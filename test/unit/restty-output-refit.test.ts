import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import {
  createOutputRefitPrefix,
  outputRefitProducer,
} from "../fixtures/restty-output-refit";
import {
  assertOutputCheckpoint,
  createOutputSourceObserver,
} from "../fixtures/restty-output-checkpoint";

function producer(checkpoints: number, observe = (_text: string) => {}) {
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
          observe(text);
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

it("accepts only the exact acknowledged producer prefix after measured native startup", () => {
  const source = createOutputSourceObserver(1);
  // An external transport prologue: 23 UTF-8 bytes, not producer output.
  source.observe("\u001b[?9001h\u001b[?1004h\u001b[?25h\r");
  let holdTail = false;
  let tail = "";
  const child = producer(1, (text) => {
    if (holdTail) {
      source.observe(text.slice(0, -1));
      tail = text.slice(-1);
    } else source.observe(text);
  });
  let cumulativeAck = 53;
  let pendingBytes = 0;
  const prefix = createOutputRefitPrefix({
    prefixUnits: 65_613,
    readProgress: () => ({
      sourceBytes: source.evidence().bytes,
      cumulativeAck,
      pendingBytes,
    }),
  });
  expect(source.ready()).toBe(true);
  expect(prefix.ready()).toBe(false);
  holdTail = true;
  child.send("g65613;");
  holdTail = false;
  cumulativeAck = 65_665;
  expect(prefix.ready()).toBe(false);
  source.observe(tail);
  cumulativeAck = 65_666;
  expect(prefix.ready()).toBe(true);
  expect(prefix.evidence()).toEqual({
    baselineBytes: 53,
    prefixUnits: 65_613,
    expectedSourceBytes: 65_666,
    sourceBytes: 65_666,
    cumulativeAck: 65_666,
    pendingBytes: 0,
  });
  cumulativeAck = 65_665;
  expect(prefix.ready()).toBe(false);
  cumulativeAck = 65_666;
  pendingBytes = 1;
  expect(prefix.ready()).toBe(false);
  pendingBytes = 0;
  expect(prefix.ready()).toBe(true);
  child.send("r");
  cumulativeAck = 131_175;
  expect(source.evidence().bytes).toBe(131_175);
  expect(prefix.ready()).toBe(false);
  child.send("x");
  expect(assertOutputCheckpoint(child.output(), 0).recordBytes).toBe(131_072);
  expect(child.exits).toEqual([0]);
});

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
  for (const reply of [
    "\u001b[?",
    "1;2c\u001b[12;",
    "34R\u001b[6;16;",
    "8tgnx",
  ])
    child.send(reply);
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
