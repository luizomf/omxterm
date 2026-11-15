import { describe, expect, it } from "vitest";
import { loadResttyWasm } from "restty/internal";

type ResttyWasm = Awaited<ReturnType<typeof loadResttyWasm>>;
type PromptExports = ResttyWasm["exports"] & {
  restty_scroll_viewport_prompt(handle: number, delta: number): number;
  restty_scrollbar_offset(handle: number): number;
};

const cols = 40;
const rows = 10;
// The zsh and bash snippets in docs/shell-integration.md: D ends the last
// command, A starts the prompt, C starts the command's output.
const promptMark = "\u001b]133;A;redraw=0\u0007";
const commandMark = "\u001b]133;C\u0007";
const endMark = (code: number) => `\u001b]133;D;${code}\u0007`;

async function core() {
  const wasm = await loadResttyWasm();
  const exports = wasm.exports as PromptExports;
  const handle = wasm.create(cols, rows, 10_000_000);
  expect(handle).not.toBe(0);
  return {
    wasm,
    handle,
    jump: (delta: number) =>
      exports.restty_scroll_viewport_prompt(handle, delta),
    offset: () => exports.restty_scrollbar_offset(handle),
    topRow: () => wasm.getSelectionText(handle, 0, 0, 0, cols - 1).trimEnd(),
  };
}

function runCommands(wasm: ResttyWasm, handle: number, count: number) {
  for (let command = 1; command <= count; command += 1) {
    wasm.write(handle, `${promptMark}$ cmd${command}\r\n${commandMark}`);
    for (let line = 0; line < 15; line += 1)
      wasm.write(handle, `out${command}-${line}\r\n`);
    wasm.write(handle, endMark(0));
  }
  wasm.write(handle, `${promptMark}$ `);
}

describe("prepared Restty core prompt jumps", () => {
  it("puts the previous or next prompt at the top of the view", async () => {
    const { wasm, handle, jump, topRow, offset } = await core();
    runCommands(wasm, handle, 3);
    const bottom = offset();

    const previous = ["$ cmd3", "$ cmd2", "$ cmd1", "$ cmd1"];
    for (const expected of previous) {
      jump(-1);
      wasm.renderUpdate(handle);
      expect(topRow()).toBe(expected);
    }
    for (const expected of ["$ cmd2", "$ cmd3"]) {
      jump(1);
      wasm.renderUpdate(handle);
      expect(topRow()).toBe(expected);
    }
    // The current prompt is on the live screen: back to the bottom.
    jump(1);
    expect(offset()).toBe(bottom);
    wasm.destroy(handle);
  });

  it("leaves the view alone when the shell prints no marks", async () => {
    const { wasm, handle, jump, offset } = await core();
    for (let line = 0; line < 50; line += 1)
      wasm.write(handle, `line${line}\r\n`);
    wasm.scrollViewport(handle, -20);
    const scrolled = offset();
    jump(-1);
    expect(offset()).toBe(scrolled);
    jump(1);
    expect(offset()).toBe(scrolled);
    wasm.destroy(handle);
  });

  it("does nothing on the alternate screen", async () => {
    const { wasm, handle, jump, offset } = await core();
    runCommands(wasm, handle, 2);
    wasm.write(handle, "\u001b[?1049h");
    jump(-1);
    expect(offset()).toBe(0);
    wasm.destroy(handle);
  });
});
