// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountSelectionRuntime } from "../fixtures/restty-selection-runtime";

type Runtime = Awaited<ReturnType<typeof mountSelectionRuntime>>;
let runtime: Runtime | undefined;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

async function mount(text: string, cols = 20, rows = 4) {
  runtime = await mountSelectionRuntime(cols, rows);
  runtime.write(text);
  return runtime;
}

describe("double and triple click", () => {
  it("selects the word under a double click", async () => {
    const terminal = await mount("hello world foo");
    terminal.click(7, 0);
    terminal.click(7, 0);
    expect(terminal.selectedText()).toBe("world");
  });

  it("still counts a click whose pointer jitters across a cell border", async () => {
    const terminal = await mount("hello world foo");
    terminal.pointer("pointerdown", 7, 0, { dx: 4 });
    terminal.pointer("pointermove", 8, 0, { dx: -4 });
    terminal.pointer("pointerup", 8, 0, { dx: -4 });
    expect(terminal.selectedText()).toBe("");
    terminal.click(8, 0);
    expect(terminal.selectedText()).toBe("world");
  });

  it("selects a whole soft-wrapped line on a triple click", async () => {
    const line = "abcdefghij".repeat(3);
    const terminal = await mount(`first\r\n${line}\r\nlast`);
    for (let count = 0; count < 3; count += 1) terminal.click(4, 2);
    expect(terminal.selectedText()).toBe(line);
  });

  it("selects one row when the line has a hard break", async () => {
    const terminal = await mount("first\r\nsecond\r\nthird");
    for (let count = 0; count < 3; count += 1) terminal.click(2, 1);
    expect(terminal.selectedText()).toBe("second");
  });

  it("includes wrapped rows above the visible screen", async () => {
    const line = "0123456789".repeat(4);
    const terminal = await mount(`${line}\r\n1\r\n2\r\n3\r\n4`);
    // The line's first row is in scrollback; its other rows are visible.
    terminal.scrollViewport(-1);
    for (let count = 0; count < 3; count += 1) terminal.click(0, 0);
    expect(terminal.selectedText()).toBe(line);
  });
});

describe("Shift+click adjusts the selection", () => {
  // `ABC [ABC ABC] ABC` from the issue: the middle words are selected.
  async function selectMiddle() {
    const terminal = await mount("one two three four");
    terminal.drag({ row: 0, col: 4 }, { row: 0, col: 12 });
    expect(terminal.selectedText()).toBe("two three");
    terminal.pause();
    return terminal;
  }

  it("extends the end past the selection, keeping the start", async () => {
    const terminal = await selectMiddle();
    terminal.click(16, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("two three fou");
  });

  it("grows either end without dropping the other side", async () => {
    const terminal = await selectMiddle();
    terminal.click(1, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("ne two three");
    terminal.pause();
    terminal.click(17, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("ne two three four");
  });

  it("moves the nearer end for a click inside the selection", async () => {
    const terminal = await selectMiddle();
    terminal.click(11, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("two thre");
    terminal.pause();
    terminal.click(5, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("wo thre");
  });

  it("follows a Shift+drag live and keeps the result", async () => {
    const terminal = await selectMiddle();
    terminal.pointer("pointerdown", 14, 0, { shiftKey: true });
    terminal.pointer("pointermove", 17, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("two three four");
    terminal.pointer("pointerup", 17, 0, { shiftKey: true });
    expect(terminal.isDragging()).toBe(false);
    expect(terminal.selectedText()).toBe("two three four");
  });

  it("extends a double-clicked word across lines", async () => {
    const terminal = await mount("alpha beta\r\ngamma delta");
    terminal.click(7, 0);
    terminal.click(7, 0);
    terminal.pause();
    terminal.click(2, 1, { shiftKey: true });
    expect(terminal.selectedText()).toBe("beta\ngam");
  });

  it("keeps a one-letter selection when Shift+clicked on itself", async () => {
    const terminal = await mount("a b c");
    terminal.click(2, 0);
    terminal.click(2, 0);
    expect(terminal.selectedText()).toBe("b");
    terminal.pause();
    terminal.click(2, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("b");
  });

  it("does nothing without a selection, and a plain click still clears", async () => {
    const terminal = await mount("one two three four");
    terminal.click(6, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("");
    terminal.drag({ row: 0, col: 4 }, { row: 0, col: 6 });
    terminal.pause();
    terminal.click(10, 0);
    expect(terminal.selectedText()).toBe("");
  });

  it("adjusts only on Shift alone; a modified click clears as before", async () => {
    const terminal = await mount("one two three four");
    terminal.drag({ row: 0, col: 4 }, { row: 0, col: 6 });
    terminal.pause();
    terminal.click(16, 0, { shiftKey: true, metaKey: true });
    expect(terminal.selectedText()).toBe("");
  });
});

describe("with mouse reporting on", () => {
  it("sends clicks to the program and still lets Shift select and extend", async () => {
    const terminal = await mount("\u001b[?1000h\u001b[?1006hone two three");
    terminal.click(5, 0);
    terminal.click(5, 0);
    expect(terminal.selectedText()).toBe("");
    expect(terminal.reports.length).toBeGreaterThan(0);

    terminal.reports.length = 0;
    terminal.drag({ row: 0, col: 0 }, { row: 0, col: 2 }, { shiftKey: true });
    expect(terminal.selectedText()).toBe("one");
    terminal.pause();
    terminal.click(6, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("one two");
    terminal.pause();
    terminal.click(1, 0, { shiftKey: true });
    expect(terminal.selectedText()).toBe("ne two");

    // Shift+drag is the only way to start over while the program owns clicks.
    terminal.pause();
    terminal.drag({ row: 0, col: 8 }, { row: 0, col: 12 }, { shiftKey: true });
    expect(terminal.selectedText()).toBe("three");
    expect(terminal.reports).toEqual([]);
  });
});
