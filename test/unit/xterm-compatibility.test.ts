import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  registerOsc52Clipboard,
  XTERM_OSC_PAYLOAD_LIMIT,
} from "../../src/terminal-surface/osc52-clipboard";

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

  it("consumes a valid OSC 52 write split across transport chunks", async () => {
    const terminal = new Terminal();
    const writeText = vi.fn(async () => undefined);
    registerOsc52Clipboard(terminal.parser, writeText);

    await write(terminal, "\u001b]52;c;aGVs");
    await write(terminal, "bG8g8J+Zgg==\u0007");

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("hello 🙂");
    terminal.dispose();
  });

  it.each([
    ["BOM-only", "77u/", "\uFEFF"],
    ["BOM-prefixed text", "77u/YQ==", "\uFEFFa"],
  ])(
    "preserves %s through the real OSC parser without a PTY response",
    async (_request, encoded, text) => {
      const terminal = new Terminal();
      const writeText = vi.fn(async () => undefined);
      const responses: string[] = [];
      terminal.onData((data) => responses.push(data));
      registerOsc52Clipboard(terminal.parser, writeText);

      await write(terminal, `\u001b]52;c;${encoded}\u0007`);

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText).toHaveBeenCalledWith(text);
      expect(responses).toEqual([]);
      terminal.dispose();
    },
  );

  it("enforces the pinned xterm OSC payload limit at adjacent valid Base64 lengths", async () => {
    const terminal = new Terminal();
    const writeText = vi.fn(async () => undefined);
    const responses: string[] = [];
    terminal.onData((data) => responses.push(data));
    registerOsc52Clipboard(terminal.parser, writeText);
    const largestValidEncodedLength =
      Math.floor((XTERM_OSC_PAYLOAD_LIMIT - 2) / 4) * 4;
    const decodedInside = "\0".repeat((largestValidEncodedLength / 4) * 3);
    const immediatelyInside = `c;${"A".repeat(largestValidEncodedLength)}`;
    const nextValidOutside = `c;${"A".repeat(largestValidEncodedLength + 4)}`;

    expect(immediatelyInside.length).toBe(XTERM_OSC_PAYLOAD_LIMIT - 2);
    expect(nextValidOutside.length).toBe(XTERM_OSC_PAYLOAD_LIMIT + 2);

    await write(terminal, `\u001b]52;${immediatelyInside}\u0007`);

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(decodedInside);
    expect(responses).toEqual([]);
    writeText.mockClear();

    await write(terminal, `\u001b]52;${nextValidOutside}\u0007`);

    expect(writeText).not.toHaveBeenCalled();
    expect(responses).toEqual([]);
    terminal.dispose();
  });

  it.each([
    ["read", "c;?"],
    ["clear", "c;"],
    ["malformed Base64", "c;%%%"],
    ["malformed UTF-8", "c;8A=="],
    ["wrong target", "p;aGVsbG8="],
  ])(
    "consumes rejected OSC 52 %s through the real parser without side effects",
    async (_request, payload) => {
      const terminal = new Terminal();
      const writeText = vi.fn(async () => undefined);
      const responses: string[] = [];
      terminal.onData((data) => responses.push(data));
      registerOsc52Clipboard(terminal.parser, writeText);

      await write(terminal, `\u001b]52;${payload}\u0007`);

      expect(writeText).not.toHaveBeenCalled();
      expect(responses).toEqual([]);
      terminal.dispose();
    },
  );
});
