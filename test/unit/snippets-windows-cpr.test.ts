import { createRequire } from "node:module";
import { expect, it } from "vitest";
import {
  MAX_TERMINAL_COLUMNS,
  MAX_TERMINAL_ROWS,
} from "../../src/shared/terminal-contract";
import { cprCoreFixture } from "../fixtures/restty-cpr-core-probe";

const require = createRequire(import.meta.url);
type CprTrace = {
  classification: string;
  outputLength: number;
  writeEnd: number;
  sequence: number;
  incomplete: boolean;
  requests: Array<{ offset: number; sequence: number }>;
  replies: Array<{
    index: number;
    sequence: number;
    requestIndex: number | null;
  }>;
};
type CprContext = { output: string; outputTruncated: boolean; trace: CprTrace };
type Classified = {
  text: string;
  focus: Array<{ index: number; kind: string }>;
  cpr: Array<{
    index: number;
    row: number;
    column: number;
    requestIndex: number;
  }>;
};
const {
  classifyWindowsWrites,
  assertWindowsInteraction,
  countWindowsProbeReceipts,
} = require("../fixtures/snippets-scenario.cjs") as {
  classifyWindowsWrites(
    writes: string[],
    offset: number,
    context?: CprContext,
    end?: number,
  ): Classified;
  assertWindowsInteraction(
    writes: string[],
    offset: number,
    insert: string,
    run: string,
    context?: CprContext,
  ): { nonFocus: string; cpr: Classified["cpr"] };
  countWindowsProbeReceipts(output: string, marker: string): number | null;
};
const { createWindowsCprTrace, parseCpr } =
  require("../fixtures/snippets-windows-cpr.cjs") as {
    createWindowsCprTrace(): {
      output(data: string): void;
      write(index: number, data: string): void;
      snapshot(): CprTrace;
    };
    parseCpr(data: string): { row: number; column: number } | null;
  };
const query = "\u001b[6n";
const out = "\u001b[O";
const inside = "\u001b[I";

function observation(output: string, writes: string[]) {
  const tracker = createWindowsCprTrace();
  tracker.output(output);
  writes.forEach((data, index) => tracker.write(index, data));
  return { output, outputTruncated: false, trace: tracker.snapshot() };
}

it("records a standalone CPR only when an observed earlier query remains available", () => {
  const writes = ["  SNIPPETS_INSERT  ", "\u001b[4;1R"];
  const result = classifyWindowsWrites(writes, 0, observation(query, writes));
  expect(result.text).toBe("  SNIPPETS_INSERT  ");
  expect(result.cpr).toEqual([
    { index: 1, row: 4, column: 1, requestIndex: 0 },
  ]);
  expect(writes).toEqual(["  SNIPPETS_INSERT  ", "\u001b[4;1R"]);
});

it("observes a query split at every chunk boundary without changing output", () => {
  for (let split = 0; split <= query.length; split++) {
    const tracker = createWindowsCprTrace();
    tracker.output(query.slice(0, split));
    tracker.output(query.slice(split));
    const writes = ["\u001b[1;1R"];
    tracker.write(0, writes[0]!);
    expect(
      classifyWindowsWrites(writes, 0, {
        output: query,
        outputTruncated: false,
        trace: tracker.snapshot(),
      }).cpr,
    ).toEqual([{ index: 0, row: 1, column: 1, requestIndex: 0 }]);
  }
});

it("correlates separate actual Restty core CPR replies to observed queries", async () => {
  const core = await cprCoreFixture();
  try {
    const tracker = createWindowsCprTrace();
    const writes: string[] = [];
    let output = "";
    for (const chunk of ["A中\u001b[6n", "B\u001b[6n"]) {
      output += chunk;
      tracker.output(chunk);
      const previous = core.replies.length;
      core.write(chunk);
      for (const reply of core.replies.slice(previous)) {
        tracker.write(writes.length, reply);
        writes.push(reply);
      }
    }
    expect(writes).toEqual(["\u001b[1;4R", "\u001b[1;5R"]);
    expect(
      classifyWindowsWrites(writes, 0, {
        output,
        outputTruncated: false,
        trace: tracker.snapshot(),
      }).cpr,
    ).toEqual([
      { index: 0, row: 1, column: 4, requestIndex: 0 },
      { index: 1, row: 1, column: 5, requestIndex: 1 },
    ]);
  } finally {
    core.dispose();
  }
});

it("requires one earlier observed query per CPR but allows equal replies to distinct queries", () => {
  const replies = ["\u001b[7;1R", "\u001b[7;1R"];
  expect(() =>
    classifyWindowsWrites(replies, 0, observation(query, replies)),
  ).toThrow("Unmatched CPR");
  expect(
    classifyWindowsWrites(replies, 0, observation(query + query, replies)).cpr,
  ).toHaveLength(2);
  const tracker = createWindowsCprTrace();
  tracker.write(0, replies[0]!);
  tracker.output(query);
  expect(() =>
    classifyWindowsWrites(replies.slice(0, 1), 0, {
      output: query,
      outputTruncated: false,
      trace: tracker.snapshot(),
    }),
  ).toThrow("Unmatched CPR");
  expect(() => classifyWindowsWrites(replies.slice(0, 1), 0)).toThrow(
    "Unexpected PTY protocol write",
  );
});

it("uses the adapter's bounded, positive canonical row and column coordinates", () => {
  expect(MAX_TERMINAL_ROWS).toBe(1000);
  expect(MAX_TERMINAL_COLUMNS).toBe(1000);
  expect(parseCpr("\u001b[1;1R")).toEqual({ row: 1, column: 1 });
  expect(parseCpr("\u001b[1000;1000R")).toEqual({ row: 1000, column: 1000 });
});

it.each([
  "\u001b[0;1R",
  "\u001b[1;0R",
  "\u001b[1001;1R",
  "\u001b[1;1001R",
  "\u001b[01;1R",
  "\u001b[1;01R",
  "\u001b[;1R",
  "\u001b[1;R",
  "\u001b[?1;1R",
  "\u001b[1;1;1R",
  "\u001b[1;1r",
  "\u001b[1;1Rextra",
  "text\u001b[1;1R",
  "\u001b[1;1R\r",
  "\u001b[1;1R\u001b[I",
  "\u001b[1;",
  "\u001b[O\u001b[I",
  "\u001b[99999;1R",
])("rejects malformed, mixed or split protocol write %j", (write) => {
  const writes = [write];
  expect(() =>
    classifyWindowsWrites(writes, 0, observation(query, writes)),
  ).toThrow("Unexpected PTY protocol write");
});

it("rejects a CPR split across separate PTY writes even after a query", () => {
  const writes = ["\u001b[7;", "1R"];
  expect(() =>
    classifyWindowsWrites(writes, 0, observation(query, writes)),
  ).toThrow("Unexpected PTY protocol write");
});

it("fails closed when query observation exceeds its explicit bound", () => {
  const writes = ["\u001b[7;1R"];
  const context = observation(query.repeat(1025), writes);
  expect(context.trace.incomplete).toBe(true);
  expect(() => classifyWindowsWrites(writes, 0, context)).toThrow(
    "observation unavailable or truncated",
  );
});

it("does not treat a semantic prefix or duplicate as the required exact input", () => {
  for (const value of ["SNIPPETS_RU", "SNIPPETS_RUN\r\r", "\r", "\u009b1;1R"]) {
    expect(classifyWindowsWrites([value], 0).text).not.toBe("SNIPPETS_RUN\r");
    expect(classifyWindowsWrites([value], 0).text).not.toBe("");
  }
});

it("rejects a callback clock too short for the retained writes even for an empty window", () => {
  const writes = Array.from({ length: 22 }, (_, index) => `write-${index}`);
  const context = observation("x".repeat(212), writes);
  expect(context.trace.sequence).toBe(23);
  context.trace.sequence = 0;
  expect(() => classifyWindowsWrites(writes, 0, context, 0)).toThrow();
  expect(() => classifyWindowsWrites(writes, 0, context)).toThrow();
});

it("rejects a CPR sequence that leaves no room for earlier ordinary writes", () => {
  const writes = ["a", "b", "c", "d", "e", "\u001b[4;1R"];
  const context = observation(query, writes);
  expect(context.trace.replies[0]?.sequence).toBe(7);
  context.trace.replies[0]!.sequence = 2;
  expect(() => classifyWindowsWrites(writes, 0, context)).toThrow();
  expect(() => classifyWindowsWrites(writes, 0, context, 0)).toThrow();
});

it("requires enough callbacks for ordinary writes between CPR replies", () => {
  const tracker = createWindowsCprTrace();
  const writes = ["\u001b[1;1R", "a", "b", "c", "\u001b[2;1R"];
  tracker.output(query);
  for (let index = 0; index < 4; index++) tracker.write(index, writes[index]!);
  tracker.output(query);
  tracker.write(4, writes[4]!);
  const trace = tracker.snapshot();
  expect(trace.sequence).toBe(7);
  expect(trace.requests.map((row) => row.sequence)).toEqual([1, 6]);
  expect(trace.replies.map((row) => row.sequence)).toEqual([2, 7]);
  const valid = { output: query + query, outputTruncated: false, trace };
  expect(classifyWindowsWrites(writes, 0, valid).cpr).toHaveLength(2);
  trace.requests[1]!.sequence = 3;
  trace.replies[1]!.sequence = 4;
  expect(() => classifyWindowsWrites(writes, 0, valid)).toThrow();
});

it("requires room after the last CPR for remaining writes and unanswered query callbacks", () => {
  const tracker = createWindowsCprTrace();
  const writes = ["\u001b[1;1R", "a", "b", "c"];
  tracker.output(query);
  writes.forEach((data, index) => tracker.write(index, data));
  tracker.output(query);
  const trace = tracker.snapshot();
  expect(trace.sequence).toBe(6);
  expect(trace.replies[0]?.sequence).toBe(2);
  const valid = { output: query + query, outputTruncated: false, trace };
  expect(classifyWindowsWrites(writes, 0, valid).cpr).toHaveLength(1);
  trace.replies[0]!.sequence = 5;
  expect(() => classifyWindowsWrites(writes, 0, valid)).toThrow();
});

it("counts distinct query callbacks and at least one callback for observed nonempty output", () => {
  const tracker = createWindowsCprTrace();
  tracker.output(query);
  tracker.output(query);
  const writes = ["a", "b"];
  writes.forEach((data, index) => tracker.write(index, data));
  const trace = tracker.snapshot();
  expect(trace.sequence).toBe(4);
  trace.sequence = 3;
  expect(() =>
    classifyWindowsWrites(
      writes,
      0,
      { output: query + query, outputTruncated: false, trace },
      0,
    ),
  ).toThrow();
  const noQuery = observation("text", writes);
  noQuery.trace.sequence = 2;
  expect(() => classifyWindowsWrites(writes, 0, noQuery, 0)).toThrow();
});

it("accepts several queries in one callback, interleaved writes, unanswered queries and extra output callbacks", () => {
  const tracker = createWindowsCprTrace();
  const writes = ["a", "\u001b[2;1R", "b", "\u001b[3;1R", "c"];
  tracker.output(query.repeat(3));
  writes.forEach((data, index) => tracker.write(index, data));
  tracker.output("ordinary output");
  const trace = tracker.snapshot();
  expect(trace.requests.map((row) => row.sequence)).toEqual([1, 1, 1]);
  expect(trace.sequence).toBe(7);
  const context = {
    output: query.repeat(3) + "ordinary output",
    outputTruncated: false,
    trace,
  };
  expect(classifyWindowsWrites(writes, 0, context).text).toBe("abc");
  expect(classifyWindowsWrites(writes, 0, context, 0).cpr).toEqual([]);
  expect(classifyWindowsWrites(writes, 0, context).cpr).toEqual([
    { index: 1, row: 2, column: 1, requestIndex: 0 },
    { index: 3, row: 3, column: 1, requestIndex: 1 },
  ]);
});

it("accepts a truly empty trace and query-only output without inventing write callbacks", () => {
  const tracker = createWindowsCprTrace();
  const empty = {
    output: "",
    outputTruncated: false,
    trace: tracker.snapshot(),
  };
  expect(empty.trace.sequence).toBe(0);
  expect(classifyWindowsWrites([], 0, empty).text).toBe("");
  tracker.output(query + query);
  const pending = {
    output: query + query,
    outputTruncated: false,
    trace: tracker.snapshot(),
  };
  expect(pending.trace.sequence).toBe(1);
  expect(classifyWindowsWrites([], 0, pending).cpr).toEqual([]);
});

it("accepts a query split across callbacks with an intervening ordinary write", () => {
  const tracker = createWindowsCprTrace();
  tracker.output(query.slice(0, 2));
  tracker.write(0, "x");
  tracker.output(query.slice(2));
  tracker.write(1, "\u001b[4;1R");
  const context = {
    output: query,
    outputTruncated: false,
    trace: tracker.snapshot(),
  };
  expect(context.trace.requests[0]?.sequence).toBe(3);
  expect(classifyWindowsWrites(["x", "\u001b[4;1R"], 0, context).cpr).toEqual([
    { index: 1, row: 4, column: 1, requestIndex: 0 },
  ]);
});

it("does not classify past a stale trace and can recheck a bounded earlier window", () => {
  const writes = ["SNIPPETS_RUN"];
  const context = observation("", writes);
  writes.push("\r");
  expect(() => classifyWindowsWrites(writes, 0, context)).toThrow(
    "CPR observation does not cover write window",
  );
  expect(classifyWindowsWrites(writes, 0, context, 1).text).toBe(
    "SNIPPETS_RUN",
  );
  const protocolWrites = ["\u001b[7;1R"];
  const protocolContext = observation(query, protocolWrites);
  protocolWrites.push("\r");
  expect(
    classifyWindowsWrites(protocolWrites, 0, protocolContext, 1).cpr,
  ).toEqual([{ index: 0, row: 7, column: 1, requestIndex: 0 }]);
});

it("rejects changed, truncated, reordered or exhausted observation metadata", () => {
  const writes = ["\u001b[4;1R"];
  const original = observation(query, writes);
  for (const context of [
    { ...original, output: "changed" },
    { ...original, outputTruncated: true },
    { ...original, trace: { ...original.trace, incomplete: true } },
    { ...original, trace: { ...original.trace, writeEnd: 2 } },
    {
      ...original,
      trace: { ...original.trace, requests: [{ offset: 1, sequence: 1 }] },
    },
    {
      ...original,
      trace: {
        ...original.trace,
        replies: [{ index: 0, sequence: 1, requestIndex: 0 }],
      },
    },
    { ...original, trace: { ...original.trace, replies: [] } },
  ])
    expect(() => classifyWindowsWrites(writes, 0, context)).toThrow();
});

it("rejects a reply forged at the same callback sequence as a different query", () => {
  const tracker = createWindowsCprTrace();
  tracker.output(query);
  tracker.output(query);
  const writes = ["\u001b[1;1R", "\u001b[1;1R"];
  writes.forEach((data, index) => tracker.write(index, data));
  const trace = tracker.snapshot();
  trace.replies[0]!.sequence = trace.requests[1]!.sequence;
  expect(() =>
    classifyWindowsWrites(writes, 0, {
      output: query + query,
      outputTruncated: false,
      trace,
    }),
  ).toThrow("Unmatched CPR observation");
});

it("replays the observed action-window shapes and CPR gaps with synthetic query/write ordering", () => {
  // The original capture does not retain an output/write clock or Cancel offset.
  // These writes preserve its literal order; the interleaving and offset are synthetic.
  const c1 = "\u001b[1;1R",
    c2 = "\u001b[2;1R",
    c4 = "\u001b[4;1R",
    c5 = "\u001b[5;1R",
    c7 = "\u001b[7;1R";
  const writes = [
    "\u001b[?1;2c",
    c1,
    out,
    inside,
    c2,
    out,
    inside,
    out,
    inside,
    c2,
    c2,
    out,
    inside,
    out,
    inside,
    c2,
    c2,
    out,
    inside,
    out,
    inside,
    c2,
    c2,
    out,
    inside,
    out,
    inside,
    c2,
    c2,
    "  SNIPPETS_INSERT  ",
    out,
    inside,
    "\r",
    out,
    inside,
    c4,
    c4,
    "SNIPPETS_RUN",
    "\r",
    out,
    inside,
    out,
    inside,
    "\r",
    out,
    inside,
    c5,
    c5,
    out,
    inside,
    "SNIPPETS_RUN",
    out,
    inside,
    "\u0003",
    out,
    inside,
    c7,
    out,
    inside,
    c7,
  ];
  expect(writes).toHaveLength(60);
  const tracker = createWindowsCprTrace();
  let output = "";
  const snapshots = new Map<number, CprContext>();
  function feed(text: string) {
    output += text;
    tracker.output(text);
  }
  function take(start: number, end: number) {
    for (let index = start; index < end; index++) {
      tracker.write(index, writes[index]!);
      if ([32, 33, 43, 44, 53, 60].includes(index + 1))
        snapshots.set(index + 1, {
          output,
          outputTruncated: false,
          trace: tracker.snapshot(),
        });
    }
  }
  feed(query.repeat(10));
  take(0, 35);
  feed(query.repeat(2));
  take(35, 46);
  feed(query.repeat(2));
  take(46, 56);
  feed(query.repeat(2));
  take(56, 60);
  for (const [start, end, expected] of [
    [29, 32, "  SNIPPETS_INSERT  "],
    [32, 33, "\r"],
    [37, 43, "SNIPPETS_RUN\r"],
    [43, 44, "\r"],
    [48, 53, "SNIPPETS_RUN"],
  ] as const)
    expect(
      classifyWindowsWrites(writes.slice(0, end), start, snapshots.get(end))
        .text,
    ).toBe(expected);
  for (const [start, end, expected] of [
    [29, 32, "  SNIPPETS_INSERT  "],
    [32, 33, "\r"],
    [37, 43, "SNIPPETS_RUN\r"],
    [43, 44, "\r"],
    [48, 53, "SNIPPETS_RUN"],
  ] as const)
    expect(
      classifyWindowsWrites(writes, start, snapshots.get(60), end).text,
    ).toBe(expected);
  const cancel = classifyWindowsWrites(writes, 54, snapshots.get(60));
  expect(cancel.text).toBe("");
  expect(
    cancel.cpr.map(({ index, row, column }) => ({ index, row, column })),
  ).toEqual([
    { index: 56, row: 7, column: 1 },
    { index: 59, row: 7, column: 1 },
  ]);
  const suffix = ["  SNIPPETS_INSERT  \r", "SNIPPETS_PING\r"];
  suffix.forEach((value) => {
    tracker.write(writes.length, value);
    writes.push(value);
  });
  const context = { output, outputTruncated: false, trace: tracker.snapshot() };
  const global = assertWindowsInteraction(
    writes,
    29,
    "  SNIPPETS_INSERT  ",
    "SNIPPETS_RUN",
    context,
  );
  expect(global.cpr.map(({ index }) => index)).toEqual([
    35, 36, 46, 47, 56, 59,
  ]);
  tracker.write(writes.length, "\r");
  writes.push("\r");
  expect(() =>
    assertWindowsInteraction(
      writes,
      29,
      "  SNIPPETS_INSERT  ",
      "SNIPPETS_RUN",
      { ...context, trace: tracker.snapshot() },
    ),
  ).toThrow("complete interaction has no extra input");
});

it("rejects a duplicate Enter between otherwise exact action windows even with a correlated CPR", () => {
  const writes = [
    "  SNIPPETS_INSERT  ",
    "\r",
    "\r", // delayed semantic leakage in the gap
    "\u001b[4;1R",
    "SNIPPETS_RUN\r",
    "\r",
    "SNIPPETS_RUN",
    "\u0003",
    "  SNIPPETS_INSERT  \r",
    "SNIPPETS_PING\r",
  ];
  const context = observation(query, writes);
  expect(classifyWindowsWrites(writes, 0, context, 1).text).toBe(
    "  SNIPPETS_INSERT  ",
  );
  expect(classifyWindowsWrites(writes, 4, context, 5).text).toBe(
    "SNIPPETS_RUN\r",
  );
  expect(() =>
    assertWindowsInteraction(
      writes,
      0,
      "  SNIPPETS_INSERT  ",
      "SNIPPETS_RUN",
      context,
    ),
  ).toThrow("complete interaction has no extra input");
});

it("leaves the controlled child receipt framing and count contract unchanged", () => {
  const marker = "SNIPPETS_INSERT_RECEIPT";
  expect(countWindowsProbeReceipts(`\u001b[2;1H${marker}\r\n`, marker)).toBe(1);
  expect(countWindowsProbeReceipts(`${marker}\n${marker}\n`, marker)).toBe(2);
  expect(countWindowsProbeReceipts(`${marker}\n${marker}`, marker)).toBeNull();
  expect(() =>
    countWindowsProbeReceipts(`prefix${marker}\n`, marker),
  ).toThrow();
});
