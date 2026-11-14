// Export reads the retained buffer through the same row range as Select All,
// but without touching the selection, link hover, cursor or rendering state.
export const bufferTextCorrections = [
  {
    original: `    return true;
  };
  const selectWordAtClientPoint = (clientX, clientY) => {`,
    corrected: `    return true;
  };
  const getBufferText = () => {
    const renderState = getCurrentRenderState();
    const wasm = getWasm();
    const wasmExports = getWasmExports();
    const wasmHandle = getWasmHandle();
    if (!renderState || renderState.rows <= 0 || renderState.cols <= 0 || !wasm || !wasmHandle)
      return "";
    const totalRows = wasmExports?.restty_scrollbar_total?.(wasmHandle) ?? renderState.rows;
    const viewportOffset = wasmExports?.restty_scrollbar_offset?.(wasmHandle) ?? 0;
    if (totalRows <= 0)
      return "";
    return wasm.getSelectionText(wasmHandle, -viewportOffset, 0, totalRows - viewportOffset - 1, renderState.cols - 1);
  };
  const selectWordAtClientPoint = (clientX, clientY) => {`,
  },
  {
    original: `    selectAll,
    selectWordAtClientPoint,
    clearSelection,`,
    corrected: `    selectAll,
    getBufferText,
    selectWordAtClientPoint,
    clearSelection,`,
  },
  {
    original: `    selectAll: interaction.selectAll,
    scrollToBottom: interaction.scrollToBottom,`,
    corrected: `    selectAll: interaction.selectAll,
    getBufferText: interaction.getBufferText,
    scrollToBottom: interaction.scrollToBottom,`,
  },
];

// An agent's screen read (ADR 0052): the active screen's rows, one line per
// row, wherever the viewport is scrolled, through the same read-only core
// selection text as getBufferText. A row's own read that ends on the cell
// holding the place of a wide character wrapped to the next row also returns
// that character, so each row but the last is taken from the read of it and
// the next row, minus the next row's own read. null while the core can't
// answer.
export const screenTextCorrections = [
  {
    original: `    return wasm.getSelectionText(wasmHandle, -viewportOffset, 0, totalRows - viewportOffset - 1, renderState.cols - 1);
  };
  const selectWordAtClientPoint = (clientX, clientY) => {`,
    corrected: `    return wasm.getSelectionText(wasmHandle, -viewportOffset, 0, totalRows - viewportOffset - 1, renderState.cols - 1);
  };
  const getScreenText = () => {
    const wasm = getWasm();
    const wasmExports = getWasmExports();
    const wasmHandle = getWasmHandle();
    // The core's grid changes only on render_update; commitTerminalResize
    // keeps resize and renderUpdate together, so these match the screen.
    const rows = wasmHandle ? wasmExports?.restty_rows?.(wasmHandle) ?? 0 : 0;
    const cols = wasmHandle ? wasmExports?.restty_cols?.(wasmHandle) ?? 0 : 0;
    // A core that isn't ready has no screen to read, not an empty one.
    if (!wasm || !wasmHandle || rows <= 0 || cols <= 0)
      return null;
    const totalRows = wasmExports?.restty_scrollbar_total?.(wasmHandle) ?? rows;
    const viewportOffset = wasmExports?.restty_scrollbar_offset?.(wasmHandle) ?? 0;
    const top = totalRows - rows - viewportOffset;
    const read = (first, last) => wasm.getSelectionText(wasmHandle, top + first, 0, top + last, cols - 1);
    const lines = new Array(rows);
    let next = read(rows - 1, rows - 1);
    lines[rows - 1] = next;
    for (let row = rows - 2; row >= 0; row -= 1) {
      const own = read(row, row);
      const pair = read(row, row + 1);
      lines[row] = pair.endsWith(next) ? pair.slice(0, pair.length - next.length).replace(/\\n$/u, "") : own;
      next = own;
    }
    return lines.join("\\n");
  };
  const selectWordAtClientPoint = (clientX, clientY) => {`,
  },
  {
    original: `    getBufferText,
    selectWordAtClientPoint,`,
    corrected: `    getBufferText,
    getScreenText,
    selectWordAtClientPoint,`,
  },
  {
    original: `    getBufferText: interaction.getBufferText,
    scrollToBottom: interaction.scrollToBottom,`,
    corrected: `    getBufferText: interaction.getBufferText,
    getScreenText: interaction.getScreenText,
    scrollToBottom: interaction.scrollToBottom,`,
  },
];

// Which screen the agent's screen read saw (ADR 0052): a `wait` with `match`
// counts copies per screen, so a main screen that comes back after a
// full-screen program isn't new text. The input handler already tracks it.
export const altScreenCorrections = [
  {
    original: `    encodeKeyPress: (key) => inputHandler.encodeKeyPress(key),
    applyTheme,`,
    corrected: `    encodeKeyPress: (key) => inputHandler.encodeKeyPress(key),
    isAltScreen: () => inputHandler.isAltScreen(),
    applyTheme,`,
  },
];

// RIS (ESC c) takes the core back to the main screen without a ?1049l, so
// the input handler's screen flag follows it (#1074). DECSTR (CSI ! p)
// keeps the alternate screen in the core, so it changes nothing here.
export const risAltScreenCorrections = [
  {
    original: `      if (data[i + 1] !== "[") {
        result += ch;`,
    corrected: `      if (data[i + 1] !== "[") {
        if (data[i + 1] === "c")
          this.altScreen = false;
        result += ch;`,
  },
];

// RIS also returns every mode to its default. The filter alone owns mouse
// reporting, bracketed paste and focus reporting (the core never sees those
// sequences), and keeps its own synchronized-output flag, so after `reset`
// clicks, paste and focus would still be reported to a program that is gone.
// The user's mouse setting (`mode`) is kept.
export const risModeCorrections = [
  {
    original: `        if (data[i + 1] === "c")
          this.altScreen = false;`,
    corrected: `        if (data[i + 1] === "c") {
          this.altScreen = false;
          this.bracketedPaste = false;
          this.focusReporting = false;
          this.synchronizedOutput = false;
          this.mouse.reset();
        }`,
  },
  {
    original: "  isX10EventMode() {",
    corrected: `  reset() {
    this.flags = { 1000: false, 1002: false, 1003: false };
    this.x10Event = false;
    this.format = "x10";
    this.pressed = false;
    this.button = 0;
    this.pendingWheelX = 0;
    this.pendingWheelY = 0;
    this.setMode(this.mode);
  }
  isX10EventMode() {`,
  },
];
