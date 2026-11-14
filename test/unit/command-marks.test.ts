import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createCommandMarks } from "../../src/main/command-marks";

// Output captured from real shells running the snippets of
// docs/shell-integration.md: zsh 5.9 and bash 5.3 through a PTY, typing
// `true`, `false`, an empty Enter and `sh -c "exit 7"`. Each chunk ends at a
// prompt, where the next line is typed.
const ZSH = [
  "\x1b]133;A;redraw=0\x07\r\x1b[J% \x1b[?2004h",
  "t\x08true\x1b[?2004l\r\r\n\x1b]133;C\x07%\r \r\x1b]133;D;0\x07\x1b]133;A;redraw=0\x07\r\x1b[J% \x1b[?2004h",
  "f\x08false\x1b[?2004l\r\r\n\x1b]133;C\x07%\r \r\x1b]133;D;1\x07\x1b]133;A;redraw=0\x07\r\x1b[J% \x1b[?2004h",
  "\x1b[?2004l\r\r\n%\r \r\x1b]133;A;redraw=0\x07\r\x1b[J% \x1b[?2004h",
  's\x08sh -c "exit 7"\x1b[?2004l\r\r\n\x1b]133;C\x07%\r \r\x1b]133;D;7\x07\x1b]133;A;redraw=0\x07\r\x1b[J% \x1b[?2004h',
];
const BASH = [
  "\x1b]133;A;redraw=0\x07\x1b[?2004h$ ",
  "true\r\n\x1b[?2004l\r\x1b]133;C\x07\x1b]133;D;0\x07\x1b]133;A;redraw=0\x07\x1b[?2004h$ ",
  "false\r\n\x1b[?2004l\r\x1b]133;C\x07\x1b]133;D;1\x07\x1b]133;A;redraw=0\x07\x1b[?2004h$ ",
  "\r\n\x1b[?2004l\r\x1b]133;A;redraw=0\x07\x1b[?2004h$ ",
  'sh -c "exit 7"\r\n\x1b[?2004l\r\x1b]133;C\x07\x1b]133;D;7\x07\x1b]133;A;redraw=0\x07\x1b[?2004h$ ',
];

// Feeds chunks as a pane's output and answers the session's positions after
// each one, as main counts them (UTF-8 bytes).
function feed(chunks: readonly string[]) {
  const marks = createCommandMarks();
  let position = 0;
  const positions = chunks.map((chunk) => {
    position += Buffer.byteLength(chunk, "utf8");
    marks.observe("s1", chunk, position);
    return position;
  });
  return { marks, positions };
}

it.each([
  ["zsh", ZSH],
  ["bash", BASH],
])("answers each command's end and exit code from %s", (_shell, chunks) => {
  const { marks, positions } = feed(chunks);
  const [prompt, ranTrue, ranFalse, empty] = positions as number[];
  expect(marks.reports("s1")).toBe(true);
  // Typed at each prompt: the next end is that command's.
  expect(marks.endAfter("s1", prompt!)).toEqual({
    offset: positions[1],
    exitCode: 0,
  });
  expect(marks.endAfter("s1", ranTrue!)).toEqual({
    offset: positions[2],
    exitCode: 1,
  });
  // An empty Enter runs nothing, so the end that follows is the next command's.
  expect(marks.endAfter("s1", ranFalse!)).toEqual({
    offset: positions[4],
    exitCode: 7,
  });
  expect(marks.endAfter("s1", empty!)).toEqual({
    offset: positions[4],
    exitCode: 7,
  });
  expect(marks.endAfter("s1", positions[4]!)).toBeUndefined();
});

// Windows PowerShell 5.1 and PowerShell 7.7 running the guide's lines, as
// their ConPTY output reached node-pty with OMXTerm's bundled conpty.dll on
// Windows 11: `cmd /c exit 0`, `cmd /c exit 3`, a failing `Get-Item`, an
// empty Enter and `echo hi`, each chunk ending at a prompt.
const POWERSHELL = JSON.parse(
  readFileSync(
    new URL("../fixtures/powershell-command-marks.json", import.meta.url),
    "utf8",
  ),
) as Record<"5.1" | "7", string[]>;

it.each(["5.1", "7"] as const)(
  "answers each command's end and exit code from PowerShell %s",
  (version) => {
    const { marks, positions } = feed(POWERSHELL[version]);
    const codes = positions.map(
      (after) => marks.endAfter("s1", after)?.exitCode,
    );
    // A native exit code, a cmdlet's failure as 1, and nothing for an empty
    // Enter, whose next end is `echo hi`'s.
    expect(codes).toEqual([0, 3, 1, 0, 0, undefined]);
  },
);

it("reads marks split anywhere across chunks", () => {
  const codes = (chunks: readonly string[], afters: readonly number[]) => {
    const { marks } = feed(chunks);
    return afters.map((after) => marks.endAfter("s1", after)?.exitCode);
  };
  const { positions } = feed(ZSH);
  const expected = codes(ZSH, positions);
  expect(expected).toEqual([0, 1, 7, 7, undefined]);
  ZSH.forEach((chunk, index) => {
    for (let cut = 1; cut < chunk.length; cut += 1) {
      const split = [
        ...ZSH.slice(0, index),
        chunk.slice(0, cut),
        chunk.slice(cut),
        ...ZSH.slice(index + 1),
      ];
      // The same prompts, now one chunk further along.
      const { positions: at } = feed(split);
      const prompts = at.filter((_, i) => i !== index);
      expect(codes(split, prompts)).toEqual(expected);
    }
  });
});

it("answers the end of the command still running at after first", () => {
  // `sleep 1` runs; `echo` is typed meanwhile and runs after it.
  const { marks, positions } = feed([
    "\x1b]133;A\x07% sleep 1\r\n\x1b]133;C\x07",
    "echo typed-ahead\r\n",
    "\x1b]133;D;0\x07\x1b]133;A\x07% echo typed-ahead\r\n\x1b]133;C\x07typed-ahead\r\n",
    "\x1b]133;D;3\x07\x1b]133;A\x07% ",
  ]);
  expect(marks.endAfter("s1", positions[0]!)).toEqual({
    offset: positions[2],
    exitCode: 0,
  });
  expect(marks.endAfter("s1", positions[2]!)).toEqual({
    offset: positions[3],
    exitCode: 3,
  });
});

it("takes ST, missing and extra fields, and Windows-sized codes", () => {
  const { marks, positions } = feed([
    "\x1b]133;C\x1b\\",
    "\x1b]133;D;0;aid=42\x1b\\",
    "\x1b]133;C\x07",
    "\x1b]133;D\x07",
    "\x1b]133;C\x07",
    "\x1b]133;D;-1073741819\x07",
    "\x1b]133;C\x07",
    "\x1b]133;D;99999999999\x07",
  ]);
  const end = (after: number) => marks.endAfter("s1", after);
  expect(end(0)).toEqual({ offset: positions[1], exitCode: 0 });
  expect(end(positions[1]!)).toEqual({ offset: positions[3] });
  expect(end(positions[3]!)).toEqual({
    offset: positions[5],
    exitCode: -1073741819,
  });
  expect(end(positions[5]!)).toEqual({ offset: positions[7] });
});

it("ignores cancelled, unterminated, overlong and other marks", () => {
  const { marks } = feed([
    "\x1b]133;D;1\x18",
    "\x1b]133;D;2\x1b[0m",
    `\x1b]133;D;${"9".repeat(300)}\x07`,
    "\x1b]1337;D;4\x07\x1b]133;Z\x07",
    "\x1b]133;D;5",
  ]);
  expect(marks.reports("s1")).toBe(false);
  expect(marks.endAfter("s1", 0)).toBeUndefined();
});

it("forgets an ended session and reports nothing for a quiet one", () => {
  const { marks } = feed(ZSH);
  marks.forget("s1");
  expect(marks.reports("s1")).toBe(false);
  expect(marks.endAfter("s1", 0)).toBeUndefined();
  marks.observe("s2", "plain output with no marks\r\n", 28);
  expect(marks.reports("s2")).toBe(false);
});
