// Physical-row proofs must not select Ghostty's spacer_head: with unwrap,
// that endpoint can include the next row's entire grapheme. Link lookup alone
// uses the preceding cell; ordinary selection/copy keep the core semantics.
export const wideWrapLinkCorrections = [
  {
    original: `    const rowText = rows.map((cells) => cells.join("").replace(/[ \\t]+$/gu, ""));`,
    corrected: `    // Copy endpoints and normalize the hit while render views are still live.
    const proofEnds = Array.from({ length: render.rows }, (_, row) =>
      render.cols - 1 - (render.wide?.[(row + 1) * render.cols - 1] === 3 ? 1 : 0),
    );
    if (proofEnds.some((end) => end < 0))
      return null;
    const hit = positionToCell({ clientX, clientY });
    // Link spacers belong to the preceding cluster on this physical row,
    // not the previous row used by generic selection normalization.
    const cell = normalizeSelectionCell(
      render.wide?.[hit.row * render.cols + hit.col] === 3
        ? { row: hit.row, col: hit.col - 1 }
        : hit,
    );
    const selectionProof = (firstRow, lastRow) => wasm.getSelectionText(
      wasmHandle, firstRow, 0, lastRow, proofEnds[lastRow] ?? render.cols - 1,
    );
    const rowText = rows.map((cells) => cells.join("").replace(/[ \\t]+$/gu, ""));`,
  },
  {
    original: `wasm.getSelectionText(wasmHandle, row, 0, row, render.cols - 1)`,
    corrected: `selectionProof(row, row)`,
    occurrences: 2,
  },
  {
    original: `wasm.getSelectionText(wasmHandle, row, 0, row + 1, render.cols - 1)`,
    corrected: `selectionProof(row, row + 1)`,
  },
  {
    original: `      const pair = wasm.getSelectionText(
        wasmHandle,
        firstRow,
        0,
        secondRow,
        render.cols - 1,
      );`,
    corrected: `      const pair = selectionProof(firstRow, secondRow);`,
  },
  {
    original: `
    const cell = normalizeSelectionCell(positionToCell({ clientX, clientY }));
    let firstRow = cell.row;`,
    corrected: `
    let firstRow = cell.row;`,
  },
];
