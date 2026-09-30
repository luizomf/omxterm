// Keep literal spaces at a physical row end only when core selection text
// proves that they belong to a soft-wrapped logical line, not blank padding.
export const visiblePathBoundaryCorrections = [
  {
    original: `    const rowText = rows.map((cells) => cells.join("").replace(/[ \\t]+$/gu, ""));`,
    corrected: `    // Snapshot literal cell content before selection queries can grow memory.
    // Codepoint zero is blank padding; an emitted space remains codepoint 32.
    const literalRows = rows.map((cells, row) => {
      let end = render.cols;
      while (end > 0 && !(render.codepoints?.[row * render.cols + end - 1] ?? 0))
        end -= 1;
      return cells.slice(0, end).join("");
    });
    const rowText = rows.map((cells) => cells.join("").replace(/[ \\t]+$/gu, ""));`,
  },
  {
    original: `    const selectionRows = rowText.slice();`,
    corrected: `    const selectionRows = rowText.slice();
    for (let row = 0; row < render.rows; row += 1)
      rowText[row] = literalRows[row];`,
  },
  {
    original: `firstRow === 0 && viewportOffset > 0 && isSoftWrap(-1, 0) === true;`,
    corrected: `firstRow === 0 && viewportOffset > 0 && isSoftWrap(-1, 0) !== false;`,
  },
  {
    original: `(isSoftWrap(render.rows - 1, render.rows) === true ||`,
    corrected: `(isSoftWrap(render.rows - 1, render.rows) !== false ||`,
  },
];

export const softWrapSpaceCorrections = [
  {
    original: `    const selectionRowText = (row) =>
      row >= 0 && row < render.rows
        ? rowText[row]
        : wasm.getSelectionText(wasmHandle, row, 0, row, render.cols - 1);`,
    corrected: `    const selectionRows = rowText.slice();
    for (let row = 0; row + 1 < render.rows; row += 1) {
      const full = rows[row].join("");
      const pair = wasm.getSelectionText(wasmHandle, row, 0, row + 1, render.cols - 1);
      if (pair === full + selectionRows[row + 1])
        rowText[row] = full;
    }
    const selectionRowText = (row) =>
      row >= 0 && row < render.rows
        ? selectionRows[row]
        : wasm.getSelectionText(wasmHandle, row, 0, row, render.cols - 1);`,
  },
  {
    original: `      if (pair === first + second)
        return true;`,
    corrected: `      if (pair === first + second || pair === (rowText[firstRow] ?? first) + second)
        return true;`,
  },
];
