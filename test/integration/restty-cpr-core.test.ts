import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cprCoreFixture,
  preparedCprRuntime,
  runtimeSection,
} from "../fixtures/restty-cpr-core-probe";
import history from "../fixtures/restty-runtime-history.json";

const mixedStream = "A中\u001b[6n\u001b[cB\u001b[>c\u001b[16t\u001b[6nZ";
const mixedReplies =
  "\u001b[1;4R\u001b[?1;2c\u001b[>0;0;0c\u001b[6;20;10t\u001b[1;5R";
const expectReplies = (replies: string[], expected: string) =>
  expect(replies.join("")).toBe(expected);

type Step = string | { resize: number };
const cases: Array<{
  name: string;
  cols?: number;
  steps: Step[];
  reply: string;
  cursor: { row: number; col: number };
  text?: string;
}> = [
  {
    name: "wide text without a render frame",
    steps: ["A中B\u001b[6n"],
    reply: "\u001b[1;5R",
    cursor: { row: 1, col: 5 },
    text: "A中B",
  },
  {
    name: "combining text",
    steps: ["Ae\u0301B\u001b[6n"],
    reply: "\u001b[1;4R",
    cursor: { row: 1, col: 4 },
    text: "Ae\u0301B",
  },
  {
    name: "emoji ZWJ",
    steps: ["A👩‍💻B\u001b[6n"],
    reply: "\u001b[1;5R",
    cursor: { row: 1, col: 5 },
  },
  {
    name: "pending wrap",
    cols: 5,
    steps: ["12345\u001b[6n"],
    reply: "\u001b[1;5R",
    cursor: { row: 1, col: 5 },
    text: "12345",
  },
  {
    name: "pending-wrap resize",
    cols: 5,
    steps: ["12345", { resize: 10 }, "\u001b[6n"],
    reply: "\u001b[1;6R",
    cursor: { row: 1, col: 6 },
    text: "12345",
  },
  {
    name: "resize during an incomplete query",
    cols: 5,
    steps: ["12345\u001b[", { resize: 10 }, "6nZ"],
    reply: "\u001b[1;6R",
    cursor: { row: 1, col: 7 },
    text: "12345Z",
  },
  {
    name: "combining mark and query split across chunks",
    steps: ["Ae", "\u0301B\u001b[", "6", "n"],
    reply: "\u001b[1;4R",
    cursor: { row: 1, col: 4 },
    text: "Ae\u0301B",
  },
  {
    name: "two queries before trailing text (not the final cursor)",
    steps: ["A中\u001b[6nB\u001b[6nZZ"],
    reply: "\u001b[1;4R\u001b[1;5R",
    cursor: { row: 1, col: 7 },
    text: "A中BZZ",
  },
  {
    name: "cancelled CSI before a valid query",
    steps: ["A中\u001b[6\u0018n\u001b[6n"],
    reply: "\u001b[1;5R",
    cursor: { row: 1, col: 5 },
    text: "A中n",
  },
  {
    name: "synchronized output without a render frame",
    steps: ["\u001b[?2026hA中B\u001b[6n\u001b[?2026l"],
    reply: "\u001b[1;5R",
    cursor: { row: 1, col: 5 },
    text: "A中B",
  },
  {
    name: "origin-mode coordinates relative to scrolling margins",
    steps: ["\u001b[2;5r\u001b[?6h\u001b[2;3H\u001b[6n"],
    reply: "\u001b[2;3R",
    cursor: { row: 3, col: 3 },
  },
  {
    name: "alternate-screen return",
    steps: ["A中\u001b[?1049h\u001b[HAe\u0301B\u001b[6n\u001b[?1049l\u001b[6n"],
    reply: "\u001b[1;4R\u001b[1;4R",
    cursor: { row: 1, col: 4 },
    text: "A中",
  },
];

describe("Restty actual-core cursor position reports", () => {
  it.each(cases)("answers at the query position after $name", async (spec) => {
    const f = await cprCoreFixture(spec.cols);
    try {
      for (const step of spec.steps)
        typeof step === "string" ? f.write(step) : f.resize(step.resize);
      expectReplies(f.replies, spec.reply);
      expect(f.cursor()).toEqual(spec.cursor);
      if (spec.text !== undefined) expect(f.text().trimEnd()).toBe(spec.text);
    } finally {
      f.dispose();
    }
  });

  it("preserves mixed CPR, DA1, DA2 and cell-size reply order at every split", async () => {
    for (let split = 0; split <= mixedStream.length; split++) {
      const f = await cprCoreFixture();
      try {
        f.write(mixedStream.slice(0, split));
        f.write(mixedStream.slice(split));
        expect(f.replies.join(""), `split ${split}`).toBe(mixedReplies);
        // Hooks see each already-filtered byte exactly once, including queries.
        expect(f.writes.join("")).toBe("A中\u001b[6nB\u001b[6nZ");
        expect(f.cursor()).toEqual({ row: 1, col: 6 });
        expect(f.text().trimEnd()).toBe("A中BZ");
      } finally {
        f.dispose();
      }
    }
  });

  it("retains parsed title and bell delivery on both sides of a prefix commit", async () => {
    const f = await cprCoreFixture();
    try {
      f.write("\u001b]2;before\u0007A中\u001b[6n\u0007\u001b]2;after\u0007Z");
      expectReplies(f.replies, "\u001b[1;4R");
      expect(f.events).toEqual([
        { type: "title", title: "before" },
        { type: "bell" },
        { type: "title", title: "after" },
      ]);
      expect(f.text().trimEnd()).toBe("A中Z");
    } finally {
      f.dispose();
    }
  });

  it("confirms that the real pinned core answers CPR without a JS provider", async () => {
    const f = await cprCoreFixture(5);
    try {
      expect(f.rawWrite("A中B\u001b[6n")).toBe("\u001b[1;5R");
    } finally {
      f.dispose();
    }
  });

  it("rejects the old interception with the same coordinate oracle", async () => {
    const lines = preparedCprRuntime().split("\n");
    for (const prior of history) {
      for (const edit of prior.edits)
        lines.splice(edit.start, edit.deleteCount, ...edit.lines);
      if (prior.name === "priorCprDigest") break;
    }
    const baseline = lines.join("\n");
    expect(createHash("sha256").update(baseline).digest("hex")).toBe(
      "3c4dc8554c8ccc91f0b34ebea8a5638fe6592c1a973acc0a64dafcb33ab8387e",
    );
    const f = await cprCoreFixture(80, 6, baseline);
    try {
      f.write("A中B\u001b[6n");
      expect(() => expectReplies(f.replies, "\u001b[1;5R")).toThrow();
      expect(f.cursor()).toEqual({ row: 1, col: 5 });
    } finally {
      f.dispose();
    }
  });

  it("rejects plain pass-through with the same mixed-order oracle", async () => {
    const source = preparedCprRuntime();
    const prefixCommit = runtimeSection(
      source,
      '      if (seq === "\\x1B[6n" && onCoreOutput) {',
      "      this.altScreen = deriveAltScreen(seq, this.altScreen);",
    );
    const f = await cprCoreFixture(80, 6, source.replace(prefixCommit, ""));
    try {
      f.write(mixedStream);
      expect(() => expectReplies(f.replies, mixedReplies)).toThrow();
      expectReplies(
        f.replies,
        "\u001b[?1;2c\u001b[>0;0;0c\u001b[6;20;10t\u001b[1;4R\u001b[1;5R",
      );
      expect(f.cursor()).toEqual({ row: 1, col: 6 });
    } finally {
      f.dispose();
    }
  });
});
