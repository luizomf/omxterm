import { runInNewContext } from "node:vm";
import { loadResttyWasm } from "restty/internal";
import { afterEach, describe, expect, it } from "vitest";
import {
  preparedCprRuntime,
  runtimeSection,
} from "../fixtures/restty-cpr-core-probe";

type Core = Awaited<ReturnType<typeof loadResttyWasm>> & {
  exports: Record<string, (...args: number[]) => number>;
};

const cols = 40;
const rows = 10;
// The zsh and bash snippets in docs/shell-integration.md: D ends the last
// command, A starts the prompt, C starts the command's output.
const promptMark = "\u001b]133;A;redraw=0\u0007";
const commandMark = "\u001b]133;C\u0007";
const endMark = (code: number) => `\u001b]133;D;${code}\u0007`;

const handles: Array<{ core: Core; handle: number }> = [];

// The prepared runtime's own reader: only the getters it closes over are
// supplied here.
const reader = (core: Core, handle: number) =>
  runInNewContext(
    runtimeSection(
      preparedCprRuntime(),
      "  const getLastCommandOutput = () => {",
      "  const getScreenText = () => {",
    ) + "\ngetLastCommandOutput",
    {
      getWasm: () => core,
      getWasmExports: () => core.exports,
      getWasmHandle: () => handle,
      TextDecoder,
    },
  ) as () => string;

async function terminal() {
  const core = (await loadResttyWasm()) as Core;
  const handle = core.create(cols, rows, 10_000_000);
  handles.push({ core, handle });
  const write = (text: string) => core.write(handle, text);
  const run = (command: string, output: string) =>
    write(`${command}\r\n${commandMark}${output}${endMark(0)}${promptMark}$ `);
  return { write, run, lastOutput: reader(core, handle) };
}

afterEach(() => {
  for (const { core, handle } of handles.splice(0)) core.destroy(handle);
});

describe("the prepared runtime's last command output", () => {
  it("has nothing to read before the core is ready", async () => {
    const core = (await loadResttyWasm()) as Core;
    expect(reader(core, 0)()).toBe("");
  });

  it("reads the output alone, without the prompt or the command line", async () => {
    const t = await terminal();
    t.write(`${promptMark}$ `);
    expect(t.lastOutput()).toBe("");
    t.run("ls", "a.txt\r\nb.txt\r\n");
    expect(t.lastOutput()).toBe("a.txt\nb.txt");
    t.run("echo hi", "hi\r\n");
    expect(t.lastOutput()).toBe("hi");
  });

  it("skips empty prompts, silent commands and the running command", async () => {
    const t = await terminal();
    t.write(`${promptMark}$ `);
    t.run("ls", "a.txt\r\n");
    // An empty Enter prints only a new prompt.
    t.write(`\r\n${promptMark}$ `);
    t.run("cd /tmp", "");
    expect(t.lastOutput()).toBe("a.txt");
    t.write(`tail -f log\r\n${commandMark}live\r\n`);
    expect(t.lastOutput()).toBe("a.txt");
  });

  it("joins soft-wrapped lines and reaches into scrollback", async () => {
    const t = await terminal();
    const long = "x".repeat(cols * 2 + 5);
    const lines = Array.from({ length: 30 }, (_, line) => `line${line}`);
    t.write(`${promptMark}$ `);
    t.run("cat", `${long}\r\n${lines.join("\r\n")}\r\n`);
    expect(t.lastOutput()).toBe([long, ...lines].join("\n"));
  });

  it("keeps blank lines inside the output and a line without its newline", async () => {
    const t = await terminal();
    t.write(`${promptMark}$ `);
    t.run("printf", "one\r\n\r\ntwo");
    expect(t.lastOutput()).toBe("one\n\ntwo");
  });

  it("reads nothing without marks or on the alternate screen", async () => {
    const plain = await terminal();
    for (let line = 0; line < 30; line += 1) plain.write(`line${line}\r\n`);
    expect(plain.lastOutput()).toBe("");

    const marked = await terminal();
    marked.write(`${promptMark}$ `);
    marked.run("ls", "a.txt\r\n");
    marked.write("\u001b[?1049h");
    expect(marked.lastOutput()).toBe("");
  });

  it("reads nothing from the PowerShell lines, which print no output mark", async () => {
    const t = await terminal();
    t.write(`${promptMark}PS> dir\r\nfile1\r\n${endMark(0)}${promptMark}PS> `);
    expect(t.lastOutput()).toBe("");
  });
});
