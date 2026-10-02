import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { outputRefitProducer } from "../fixtures/restty-output-refit";
import { assertOutputCheckpoint } from "../fixtures/restty-output-checkpoint";

function producer(checkpoints: number) {
  let input: (data: Buffer) => void = () => {};
  let output = "";
  const exits: number[] = [];
  // Execute the actual child program; substitute only its external stdin,
  // stdout and exit ports. Native coverage exercises the same program via PTY.
  runInNewContext(outputRefitProducer(checkpoints), {
    process: {
      stdin: {
        isTTY: false,
        on: (_event: string, listener: typeof input) => {
          input = listener;
        },
        resume() {},
      },
      stdout: {
        write(text: string, callback?: () => void) {
          output += text;
          callback?.();
        },
      },
      exit: (code: number) => {
        exits.push(code);
      },
    },
  });
  return {
    send: (data: string) => input(Buffer.from(data)),
    output: () => output,
    exits,
  };
}

it("waits for explicit refit phases despite replies, wrong-phase keys and fragmented prefix commands", () => {
  const child = producer(2);
  const ready = "\u001b[?25l__OMXTERM_OUTPUT_READY__";
  child.send("\u001b[?1;2cngx");
  expect(child.output()).toBe(ready);
  child.send("g6");
  child.send("5882");
  expect(child.output()).toBe(ready);
  child.send(";");
  expect(child.output()).toHaveLength(30 + 65_882);
  expect(child.output()).not.toContain("__OMXTERM_BATCH_00_END__");
  child.send("\u001b[?1;2cgnx");
  expect(child.output()).toHaveLength(30 + 65_882);
  expect(child.exits).toEqual([]);
  child.send("r");
  expect(assertOutputCheckpoint(child.output(), 0).recordBytes).toBe(131_072);
  child.send("xgr");
  expect(child.exits).toEqual([]);
  child.send("n");
  expect(assertOutputCheckpoint(child.output(), 1).recordBytes).toBe(131_072);
  child.send("x");
  expect(child.exits).toEqual([0]);
});

it("processes coalesced phase commands in order without losing either exact checkpoint", () => {
  const child = producer(2);
  child.send("\u001b[?1;2cg65882;rnx");
  expect(assertOutputCheckpoint(child.output(), 0).recordBytes).toBe(131_072);
  expect(assertOutputCheckpoint(child.output(), 1).recordBytes).toBe(131_072);
  expect(child.exits).toEqual([0]);
});
