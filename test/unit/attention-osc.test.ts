import { createInputHandler } from "restty/internal";
import { describe, expect, it } from "vitest";
import {
  parseAttentionOsc,
  type AttentionOsc,
} from "../../src/terminal-surface/attention-osc";

interface ResttyOscInputOptions {
  readonly onOsc?: (command: number, payload: string) => void;
}

// The prepared Restty filter hands OSC 9 and OSC 777 to the host route, which
// OMXTerm reads with its own parser, as the Surface does.
function feed(...chunks: string[]) {
  const reports: AttentionOsc[] = [];
  const handler = createInputHandler({
    sendReply: () => {},
    onOsc: (command, payload) => {
      const report = parseAttentionOsc(command, payload);
      if (report) reports.push(report);
    },
  } as Parameters<typeof createInputHandler>[0] & ResttyOscInputOptions);
  const output = chunks.map((chunk) => handler.filterOutput(chunk)).join("");
  return { reports, output };
}

describe("program attention sequences", () => {
  it.each(["\u0007", "\u001b\\"])(
    "reads OSC 9;4 progress as working, never as a notification (%j)",
    (st) => {
      const { reports, output } = feed(
        // Claude Code's form keeps an empty percent field.
        `\u001b]9;4;3;${st}`,
        `\u001b]9;4;1;40${st}`,
        `\u001b]9;4;2${st}\u001b]9;4;4;10${st}`,
        `\u001b]9;4;0;${st}`,
        `\u001b]9;4${st}after`,
      );
      expect(reports).toEqual([
        { kind: "progress", active: true },
        { kind: "progress", active: true },
        { kind: "progress", active: true },
        { kind: "progress", active: true },
        { kind: "progress", active: false },
        { kind: "progress", active: false },
      ]);
      expect(output).toBe("after");
    },
  );

  it("survives a progress report split across output chunks", () => {
    const sequence = "\u001b]9;4;3;\u0007";
    for (let split = 0; split <= sequence.length; split += 1)
      expect(
        feed(sequence.slice(0, split), sequence.slice(split)).reports,
        `split ${split}`,
      ).toEqual([{ kind: "progress", active: true }]);
  });

  it("ignores other ConEmu subcommands and unknown progress states", () => {
    const { reports } = feed(
      "\u001b]9;9;/home/user/project\u0007",
      "\u001b]9;1;500\u0007",
      "\u001b]9;12\u0007",
      "\u001b]9;4;7\u0007",
      "\u001b]777;preexec\u0007",
      "\u001b]9;\u0007",
    );
    expect(reports).toEqual([]);
  });

  it("reads OSC 9 text and OSC 777 notify as plain notifications", () => {
    const { reports } = feed(
      "\u001b]9;Done: 4 files changed\u0007",
      "\u001b]9;10 tests passed\u001b\\",
      "\u001b]777;notify;Claude Code;Waiting; needs input\u0007",
      "\u001b]777;notify;Only a title\u0007",
    );
    expect(reports).toEqual([
      { kind: "notification", title: "", body: "Done: 4 files changed" },
      { kind: "notification", title: "", body: "10 tests passed" },
      {
        kind: "notification",
        title: "Claude Code",
        body: "Waiting; needs input",
      },
      { kind: "notification", title: "Only a title", body: "" },
    ]);
  });

  it("strips controls and bidirectional overrides and bounds the text", () => {
    const [rlo, pdf] = [
      String.fromCodePoint(0x202e),
      String.fromCodePoint(0x202c),
    ];
    expect(
      parseAttentionOsc(9, `line one\nline\ttwo ${rlo}evil${pdf}  end`),
    ).toEqual({
      kind: "notification",
      title: "",
      body: "line one line two evil end",
    });
    const long = parseAttentionOsc(
      777,
      `notify;${"t".repeat(500)};${"🙂".repeat(5_000_000)}`,
    );
    expect(long?.kind).toBe("notification");
    if (long?.kind !== "notification") return;
    expect([...long.title]).toHaveLength(128);
    expect(long.title.endsWith("…")).toBe(true);
    expect([...long.body]).toHaveLength(512);
    expect(long.body.endsWith("…")).toBe(true);
  });
});
