import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

describe("standard xterm compatibility fixtures", () => {
  it("renders Unicode and representative REPL cursor movement", async () => {
    const terminal = new Terminal({ cols: 40, rows: 6, scrollback: 10_000 });

    await write(terminal, "Olá 🙂 你好\r\n> 1 + 1\r\n2\r\n> ");

    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(
      "Olá 🙂 你好",
    );
    expect(terminal.buffer.active.getLine(1)?.translateToString(true)).toBe(
      "> 1 + 1",
    );
    expect(terminal.buffer.active.getLine(2)?.translateToString(true)).toBe(
      "2",
    );
    expect(terminal.buffer.active.getLine(3)?.translateToString(true)).toBe(
      "> ",
    );

    terminal.dispose();
  });

  it("enters and leaves a representative alternate-screen TUI", async () => {
    const terminal = new Terminal({ cols: 40, rows: 6 });

    await write(terminal, "shell-before-tui");
    await write(terminal, "\u001b[?1049h\u001b[HTUI screen\u001b[2;1Hstatus");

    expect(terminal.buffer.active.type).toBe("alternate");
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(
      "TUI screen",
    );
    expect(terminal.buffer.active.getLine(1)?.translateToString(true)).toBe(
      "status",
    );

    await write(terminal, "\u001b[?1049l");
    expect(terminal.buffer.active.type).toBe("normal");
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(
      "shell-before-tui",
    );

    terminal.dispose();
  });

  it("tracks bracketed-paste mode transitions", async () => {
    const terminal = new Terminal();

    expect(terminal.modes.bracketedPasteMode).toBe(false);
    await write(terminal, "\u001b[?2004h");
    expect(terminal.modes.bracketedPasteMode).toBe(true);
    await write(terminal, "\u001b[?2004l");
    expect(terminal.modes.bracketedPasteMode).toBe(false);

    terminal.dispose();
  });
});
