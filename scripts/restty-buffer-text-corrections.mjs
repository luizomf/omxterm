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
