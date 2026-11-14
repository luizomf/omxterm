// Desktop mouse selection that can be adjusted instead of restarted (#1102).
// - Shift+click moves the selection end on the click's side (inside the
//   selection, the nearer end); the other end stays, so later Shift+clicks on
//   either side keep growing it. Shift+drag continues the same gesture live.
// - A press must travel a few pixels before it becomes a drag, so pointer
//   jitter across a cell border still counts as a click (and as part of a
//   double or triple click).
// - A triple click selects the whole line, including its soft-wrapped rows.
export const selectionCorrections = [
  {
    original: `    lastPrimaryClickCount: 0
  };`,
    corrected: `    lastPrimaryClickCount: 0,
    pendingX: 0,
    pendingY: 0,
    extendingPointerId: null
  };`,
  },
  {
    original: `    desktopSelectionState.startedWithActiveSelection = selectionState.active;
  };`,
    corrected: `    desktopSelectionState.startedWithActiveSelection = selectionState.active;
    desktopSelectionState.pendingX = event.clientX;
    desktopSelectionState.pendingY = event.clientY;
    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && selectionState.active && selectionState.anchor && selectionState.focus) {
      // Selection cells may sit in scrollback (negative rows); order them linearly.
      const width = Math.max(1, getGridState().cols || 1);
      const order = (at) => at.row * width + at.col;
      const forward = order(selectionState.focus) >= order(selectionState.anchor);
      const start = forward ? selectionState.anchor : selectionState.focus;
      const end = forward ? selectionState.focus : selectionState.anchor;
      const at = order(cell);
      const movesStart = at < order(start) || at <= order(end) && at - order(start) < order(end) - at;
      clearPendingDesktopSelection();
      selectionState.anchor = movesStart ? end : start;
      selectionState.focus = cell;
      selectionState.dragging = true;
      desktopSelectionState.extendingPointerId = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      updateLinkHover(null);
      updateCanvasCursor();
      markNeedsRender();
    }
  };`,
  },
  {
    original: `      const anchor = desktopSelectionState.pendingCell;
      if (anchor.row !== cell.row || anchor.col !== cell.col) {`,
    corrected: `      const anchor = desktopSelectionState.pendingCell;
      const travelled = Math.hypot(event.clientX - desktopSelectionState.pendingX, event.clientY - desktopSelectionState.pendingY);
      if ((anchor.row !== cell.row || anchor.col !== cell.col) && travelled >= 3) {`,
  },
  {
    original: `    if (anchor.row === cell.row && anchor.col === cell.col) return;`,
    corrected: `    if (anchor.row === cell.row && anchor.col === cell.col) return;
    if (Math.hypot(event.clientX - desktopSelectionState.pendingX, event.clientY - desktopSelectionState.pendingY) < 3) return;`,
  },
  {
    original: `    if (selectionState.dragging) {
      event.preventDefault();
      selectionState.dragging = false;
      selectionState.focus = cell;
      if (selectionState.anchor && selectionState.focus && selectionState.anchor.row === selectionState.focus.row && selectionState.anchor.col === selectionState.focus.col) {`,
    corrected: `    // An adjusted selection is never dropped, even when it ends on one cell.
    const extended = desktopSelectionState.extendingPointerId === event.pointerId;
    if (extended)
      desktopSelectionState.extendingPointerId = null;
    if (selectionState.dragging) {
      event.preventDefault();
      selectionState.dragging = false;
      selectionState.focus = cell;
      if (!extended && selectionState.anchor && selectionState.focus && selectionState.anchor.row === selectionState.focus.row && selectionState.anchor.col === selectionState.focus.col) {`,
  },
  {
    original: `    clearPendingDesktopSelection();
    selectionState.active = true;
    selectionState.dragging = false;
    selectionState.anchor = { row: cell.row, col: 0 };
    selectionState.focus = { row: cell.row, col: renderState.cols - 1 };`,
    corrected: `    // Copy the borrowed render view before selection queries can grow memory.
    const { cols } = renderState;
    const wasm = getWasm();
    const wasmHandle = getWasmHandle();
    const wasmExports = getWasmExports();
    const viewportOffset = wasmExports?.restty_scrollbar_offset?.(wasmHandle) ?? 0;
    const totalRows = wasmExports?.restty_scrollbar_total?.(wasmHandle) ?? renderState.rows;
    // The core joins a soft wrap without a line break; blank text proves nothing.
    const wraps = (row) => {
      const text = wasm && wasmHandle ? wasm.getSelectionText(wasmHandle, row, cols - 1, row + 1, 0) : "";
      return text !== "" && !text.includes("\\n");
    };
    let firstRow = cell.row;
    let lastRow = cell.row;
    while (firstRow > -viewportOffset && cell.row - firstRow < 1000 && wraps(firstRow - 1))
      firstRow -= 1;
    while (lastRow < totalRows - viewportOffset - 1 && lastRow - cell.row < 1000 && wraps(lastRow))
      lastRow += 1;
    clearPendingDesktopSelection();
    selectionState.active = true;
    selectionState.dragging = false;
    selectionState.anchor = { row: firstRow, col: 0 };
    selectionState.focus = { row: lastRow, col: cols - 1 };`,
  },
];
