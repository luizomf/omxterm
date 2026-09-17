import { createInputHandler } from "restty/internal";
import { describe, expect, it, vi } from "vitest";
import { decodeOsc52Write } from "../../src/terminal-surface/osc52-clipboard";

interface ResttyOscInputOptions {
  readonly onOsc?: (command: number, payload: string) => void;
}

function createSink() {
  const writes: string[] = [];
  const replies: string[] = [];
  const handler = createInputHandler({
    sendReply: (data) => replies.push(data),
    onOsc: (command, payload) => {
      if (command !== 52) return;
      const text = decodeOsc52Write(payload);
      if (text !== undefined) writes.push(text);
    },
  } as Parameters<typeof createInputHandler>[0] & ResttyOscInputOptions);
  return { handler, writes, replies };
}

function feedSplit(
  input: string,
  split: number,
): ReturnType<typeof createSink> {
  const sink = createSink();
  sink.handler.filterOutput(input.slice(0, split));
  sink.handler.filterOutput(input.slice(split));
  return sink;
}

const CONTROL_BODY_LIMIT = 10_000_000;

describe("Restty parsed OSC 52 seam", () => {
  it.each(["\u0007", "\u001b\\"])(
    "consumes a valid write split at every boundary through %j and preserves later output",
    (terminator) => {
      const sequence = `\u001b]52;c;aGVsbG8g8J+Zgg==${terminator}later`;
      for (let split = 0; split <= sequence.length; split += 1) {
        const sink = feedSplit(sequence, split);
        expect(sink.writes, `split ${split}`).toEqual(["hello 🙂"]);
        expect(sink.replies, `split ${split}`).toEqual([]);
        expect(sink.handler.filterOutput("tail"), `split ${split}`).toBe(
          "tail",
        );
      }
    },
  );

  it.each(["c;?", "c;", "p;aGVsbG8=", "c;%%%", "c;8A==", "c;AB==", "c;YQ"])(
    "consumes refused request %j without a clipboard action or reply",
    (payload) => {
      const sink = createSink();
      expect(sink.handler.filterOutput(`\u001b]52;${payload}\u0007after`)).toBe(
        "after",
      );
      expect(sink.writes).toEqual([]);
      expect(sink.replies).toEqual([]);
    },
  );

  it.each(["\u0018", "\u001a"])(
    "cancels an unfinished request on %j and resumes ordinary output",
    (cancel) => {
      const sink = createSink();
      expect(sink.handler.filterOutput("\u001b]52;c;aGVs")).toBe("");
      expect(sink.handler.filterOutput(`${cancel}ordinary`)).toBe("ordinary");
      expect(sink.writes).toEqual([]);
      expect(sink.replies).toEqual([]);
    },
  );

  it("rejects an unfinished oversized OSC as a whole and recovers at every split terminator and cancellation", () => {
    for (const terminator of ["\u0007", "\u0018", "\u001a", "\u001b\\"]) {
      for (const split of Array.from(
        { length: terminator.length + 1 },
        (_, index) => index,
      )) {
        const sink = createSink();
        const prefix = `\u001b]52;c;${"A".repeat(CONTROL_BODY_LIMIT + 1)}`;
        expect(sink.handler.filterOutput(prefix)).toBe("");
        expect(sink.handler.filterOutput(terminator.slice(0, split))).toBe("");
        expect(
          sink.handler.filterOutput(`${terminator.slice(split)}later`),
        ).toBe("later");
        expect(sink.writes).toEqual([]);
        expect(sink.replies).toEqual([]);
      }
    }
  });

  it("bounds unfinished CSI bodies below, at, and above the control budget and recovers later text", () => {
    for (const size of [CONTROL_BODY_LIMIT - 1, CONTROL_BODY_LIMIT]) {
      for (const cancel of ["\u0018", "\u001a"]) {
        const sink = createSink();
        expect(sink.handler.filterOutput(`\u001b[${"1".repeat(size)}`)).toBe(
          "",
        );
        expect(sink.handler.filterOutput(`${cancel}later`)).toBe("later");
        expect(sink.writes).toEqual([]);
        expect(sink.replies).toEqual([]);
      }
    }

    for (const final of ["m", "\u0018", "\u001a"]) {
      const sink = createSink();
      expect(
        sink.handler.filterOutput(
          `\u001b[${"1".repeat(CONTROL_BODY_LIMIT + 1)}`,
        ),
      ).toBe("");
      expect(sink.handler.filterOutput(`${final}later`)).toBe("later");
      expect(sink.writes).toEqual([]);
      expect(sink.replies).toEqual([]);
    }
  });

  it("accepts an exact-budget OSC when its string terminator is split", () => {
    const onOsc = vi.fn();
    const handler = createInputHandler({
      onOsc,
    } as Parameters<typeof createInputHandler>[0] & ResttyOscInputOptions);
    const payload = "A".repeat(CONTROL_BODY_LIMIT);

    expect(handler.filterOutput(`\u001b]52;${payload}\u001b`)).toBe("");
    expect(onOsc).not.toHaveBeenCalled();
    expect(handler.filterOutput("\\later")).toBe("later");
    expect(onOsc).toHaveBeenCalledExactlyOnceWith(52, payload);
  });

  it("accepts the exact inside payload and rejects the next canonical request", () => {
    const writeText = vi.fn();
    const handler = createInputHandler({
      onOsc: (command, payload) => {
        if (command !== 52) return;
        const text = decodeOsc52Write(payload);
        if (text !== undefined) writeText(text);
      },
    } as Parameters<typeof createInputHandler>[0] & ResttyOscInputOptions);
    const inside = `c;${"A".repeat(9_999_996)}`;
    const outside = `c;${"A".repeat(10_000_000)}`;

    expect(inside.length).toBe(9_999_998);
    expect(handler.filterOutput(`\u001b]52;${inside}\u0007`)).toBe("");
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]![0]).toHaveLength(7_499_997);

    expect(outside.length).toBe(10_000_002);
    expect(handler.filterOutput(`\u001b]52;${outside}\u001b\\later`)).toBe(
      "later",
    );
    expect(writeText).toHaveBeenCalledOnce();
  });
});
