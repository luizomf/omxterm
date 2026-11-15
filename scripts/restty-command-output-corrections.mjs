// Copy Last Command Output reads the core patch's restty_last_command_output:
// the latest finished command's output as the shell's OSC 133 marks bound it,
// formatted like a selection. Read-only like getBufferText: selection, scroll,
// hover and render state stay as they are. "" without marks or such output.
export const commandOutputCorrections = [
  {
    original: `    return wasm.getSelectionText(wasmHandle, -viewportOffset, 0, totalRows - viewportOffset - 1, renderState.cols - 1);
  };
  const getScreenText = () => {`,
    corrected: `    return wasm.getSelectionText(wasmHandle, -viewportOffset, 0, totalRows - viewportOffset - 1, renderState.cols - 1);
  };
  const getLastCommandOutput = () => {
    const wasm = getWasm();
    const wasmExports = getWasmExports();
    const wasmHandle = getWasmHandle();
    if (!wasm || !wasmHandle || !wasmExports?.restty_last_command_output)
      return "";
    const result = wasmExports.restty_alloc(8) >>> 0;
    if (!result)
      return "";
    let ptr = 0;
    let len = 0;
    try {
      const status = wasmExports.restty_last_command_output(wasmHandle, result, result + 4);
      const view = new DataView(wasm.memory.buffer);
      ptr = view.getUint32(result, true);
      len = view.getUint32(result + 4, true);
      if (status !== 0 || !ptr || !len)
        return "";
      return new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, ptr, len));
    } finally {
      if (ptr && len)
        wasmExports.restty_free(ptr, len);
      wasmExports.restty_free(result, 8);
    }
  };
  const getScreenText = () => {`,
  },
  {
    original: `    getBufferText,
    getScreenText,
    selectWordAtClientPoint,`,
    corrected: `    getBufferText,
    getScreenText,
    getLastCommandOutput,
    selectWordAtClientPoint,`,
  },
  {
    original: `    getBufferText: interaction.getBufferText,
    getScreenText: interaction.getScreenText,`,
    corrected: `    getBufferText: interaction.getBufferText,
    getScreenText: interaction.getScreenText,
    getLastCommandOutput: interaction.getLastCommandOutput,`,
  },
];
