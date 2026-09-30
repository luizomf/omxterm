// Keep literal spaces at a physical row end only when core selection text
// proves that they belong to a soft-wrapped logical line, not blank padding.
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
