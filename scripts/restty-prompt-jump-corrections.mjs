// Restty 0.3.0 can scroll only by rows. OMXTerm's core exports Ghostty's
// prompt-to-prompt scroll (OSC 133 marks), so Jump to Previous/Next Prompt
// moves the view the same way wheel and scroll-to-bottom do: selection follows
// its text, a link hover clears and the frame and search highlights refresh.
// Without marks the core leaves the view where it is, and so does this.
export const promptJumpCorrections = [
  {
    original: `  const setViewportScrollOffset = (nextOffset) => {
    const wasm = getWasm();`,
    corrected: `  const scrollToPrompt = (delta) => {
    const wasm = getWasm();
    const wasmHandle = getWasmHandle();
    const wasmExports = getWasmExports();
    if (!getWasmReady() || !wasm || !wasmHandle || !wasmExports?.restty_scroll_viewport_prompt)
      return;
    const beforeOffset = getViewportScrollOffset();
    wasmExports.restty_scroll_viewport_prompt(wasmHandle, delta);
    const afterOffset = getViewportScrollOffset();
    if (afterOffset === beforeOffset)
      return;
    shiftSelectionByRows(beforeOffset - afterOffset);
    if (linkState.hoverId)
      updateLinkHover(null);
    wasm.renderUpdate(wasmHandle);
    markSearchDirty?.();
    markNeedsRender();
    noteScrollActivity();
  };
  const setViewportScrollOffset = (nextOffset) => {
    const wasm = getWasm();`,
  },
  {
    original: `    scrollToBottom: () => setViewportScrollOffset(Number.MAX_SAFE_INTEGER),
    scrollViewportByLines,`,
    corrected: `    scrollToBottom: () => setViewportScrollOffset(Number.MAX_SAFE_INTEGER),
    scrollToPrompt,
    scrollViewportByLines,`,
  },
  {
    original: `    scrollToBottom: scrollbarRuntime.scrollToBottom,
    bindCanvasEvents`,
    corrected: `    scrollToBottom: scrollbarRuntime.scrollToBottom,
    scrollToPrompt: scrollbarRuntime.scrollToPrompt,
    bindCanvasEvents`,
  },
  {
    original: `    scrollToBottom: interaction.scrollToBottom,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,
    resize: interactionCapabilities.resize,`,
    corrected: `    scrollToBottom: interaction.scrollToBottom,
    scrollToPrompt: interaction.scrollToPrompt,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,
    resize: interactionCapabilities.resize,`,
  },
];
