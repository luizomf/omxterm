import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import {
  assertOutputCheckpoint,
  outputCheckpointProducer,
} from "../fixtures/restty-output-checkpoint";

const ready = "\x1b[?25l__OMXTERM_OUTPUT_READY__";
const da1 = "\x1b[?1;2c";

class ProducerExit extends Error {}

// Execute the same generated program passed to the native Node child. Only
// external process/stdio are substituted so data boundaries and drain ordering
// are deterministic; no producer handler or state is extracted/reimplemented.
function startProducer(
  checkpoints = 1,
  pauseAfterRecords: readonly number[] = [],
) {
  const stdin = new EventEmitter();
  const stdout = new EventEmitter();
  let output = "";
  let exitCode: number | undefined;
  let recordWrites = 0;
  runInNewContext(outputCheckpointProducer(checkpoints), {
    process: {
      stdin: Object.assign(stdin, { resume() {} }),
      stdout: Object.assign(stdout, {
        write(text: string) {
          output += text;
          if (/^\d{8}:x{23}$/u.test(text)) {
            recordWrites++;
            if (pauseAfterRecords.includes(recordWrites)) return false;
          }
          return true;
        },
      }),
      exit(code: number) {
        exitCode = code;
        throw new ProducerExit();
      },
    },
  });
  return {
    output: () => output,
    exitCode: () => exitCode,
    drain: () => stdout.emit("drain"),
    input(text: string) {
      expect(
        exitCode,
        "producer must remain alive for this input",
      ).toBeUndefined();
      try {
        stdin.emit("data", Buffer.from(text));
      } catch (error) {
        if (!(error instanceof ProducerExit)) throw error;
      }
    },
  };
}

it("ignores the actual startup DA1 reply and stays alive for Copy until explicit x", () => {
  const producer = startProducer();
  producer.input(da1);
  expect(producer.output().length).toBe(ready.length);
  expect(producer.output()).toBe(ready);
  producer.input("g");
  expect(assertOutputCheckpoint(producer.output(), 0)).toMatchObject({
    records: 4_096,
    recordBytes: 131_072,
    endSeen: true,
  });
  const checkpoint = producer.output();
  producer.input(da1);
  expect(producer.output()).toBe(checkpoint);
  expect(producer.exitCode()).toBeUndefined();
  producer.input("x");
  expect(producer.exitCode()).toBe(0);
});

it("paces multiple checkpoints by phase across fragmented and coalesced replies and commands", () => {
  const producer = startProducer(3);
  producer.input("nx");
  producer.input("\x1b[?");
  producer.input("1;2");
  expect(producer.output()).toBe(ready);
  producer.input("cg\x1b[12;34R");
  expect(assertOutputCheckpoint(producer.output(), 0)).toMatchObject({
    first: 0,
    last: 4_095,
  });
  const first = producer.output();
  producer.input("gx\x1b[>0;0;0c");
  expect(producer.output()).toBe(first);
  expect(producer.exitCode()).toBeUndefined();
  producer.input("\x1b[6;16;");
  producer.input("8tn\x1b[?1;2c");
  expect(assertOutputCheckpoint(producer.output(), 1)).toMatchObject({
    first: 4_096,
    last: 8_191,
  });
  const second = producer.output();
  producer.input("xg");
  expect(producer.output()).toBe(second);
  producer.input("\x1b[");
  producer.input("12;34Rn");
  expect(assertOutputCheckpoint(producer.output(), 2)).toMatchObject({
    first: 8_192,
    last: 12_287,
  });
  const final = producer.output();
  producer.input("ng\x1b[?1;2c");
  expect(producer.output()).toBe(final);
  expect(producer.exitCode()).toBeUndefined();
  producer.input("x");
  expect(producer.exitCode()).toBe(0);
});

it("runs the same reply-tolerant multi-checkpoint protocol in a real Node child", async () => {
  const child = spawn(process.execPath, ["-e", outputCheckpointProducer(3)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let stderr = "";
  let spawnError: Error | undefined;
  let outcome:
    { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.stdout.setEncoding("utf8").on("data", (text: string) => {
    output += text;
  });
  child.stderr.setEncoding("utf8").on("data", (text: string) => {
    stderr += text;
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  const closed = new Promise<void>((resolve) => {
    child.once("close", (code, signal) => {
      outcome = { code, signal };
      resolve();
    });
  });
  const waitForOutput = async (marker: string) => {
    await expect
      .poll(
        () => {
          if (spawnError) throw spawnError;
          if (outcome)
            throw new Error(
              `Producer exited before ${marker}: ${JSON.stringify(outcome)}`,
            );
          return output.includes(marker);
        },
        { timeout: 3_000 },
      )
      .toBe(true);
  };
  try {
    await waitForOutput("__OMXTERM_OUTPUT_READY__");
    for (const chunk of ["nx", "\x1b[?", "1;2", "cg\x1b[12;34R"])
      child.stdin.write(chunk);
    await waitForOutput("__OMXTERM_BATCH_00_END__");
    child.stdin.write("gx\x1b[>0;0;0cn");
    await waitForOutput("__OMXTERM_BATCH_01_END__");
    for (const chunk of ["\x1b[6;", "16;8t", "n"]) child.stdin.write(chunk);
    await waitForOutput("__OMXTERM_BATCH_02_END__");
    for (let batch = 0; batch < 3; batch++)
      expect(assertOutputCheckpoint(output, batch)).toMatchObject({
        records: 4_096,
        recordBytes: 131_072,
      });
    child.stdin.write(da1 + "gnx");
    await expect
      .poll(() => outcome, { timeout: 3_000 })
      .toEqual({
        code: 0,
        signal: null,
      });
    expect(stderr).toBe("");
  } finally {
    if (!outcome) child.kill();
    await closed;
  }
}, 15_000);

it("does not replay commands received while stdout is backpressured at a final or first record", () => {
  const producer = startProducer(2, [4_096, 4_097]);
  producer.input("g");
  expect(producer.output()).not.toContain("__OMXTERM_BATCH_00_END__");
  const stalledFirst = producer.output();
  producer.input("gnx" + da1);
  expect(producer.output().length).toBe(stalledFirst.length);
  expect(producer.output()).toBe(stalledFirst);
  expect(producer.exitCode()).toBeUndefined();
  producer.drain();
  expect(assertOutputCheckpoint(producer.output(), 0)).toMatchObject({
    records: 4_096,
    recordBytes: 131_072,
  });
  expect(producer.output()).not.toContain("__OMXTERM_BATCH_01_BEGIN__");
  producer.input("n");
  expect(producer.output()).toContain("__OMXTERM_BATCH_01_BEGIN__00004096:");
  expect(producer.output()).not.toContain("__OMXTERM_BATCH_01_END__");
  const stalledSecond = producer.output();
  producer.input("gnx" + da1);
  expect(producer.output().length).toBe(stalledSecond.length);
  expect(producer.output()).toBe(stalledSecond);
  expect(producer.exitCode()).toBeUndefined();
  producer.drain();
  expect(assertOutputCheckpoint(producer.output(), 1)).toMatchObject({
    first: 4_096,
    last: 8_191,
  });
  const final = producer.output();
  producer.input("gn" + da1);
  producer.drain();
  expect(producer.output()).toBe(final);
  expect(producer.exitCode()).toBeUndefined();
  producer.input("x");
  expect(producer.exitCode()).toBe(0);
});
