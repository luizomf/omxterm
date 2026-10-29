// Keep origin and final PTY encoding inside Restty. Host routing never guesses
// whether an escape sequence came from a key, pointer, or terminal reply.
export const inputRoutingCorrections = [
  {
    original: `      const payload = inputHandler.mapKeyForPty(intercepted);
      ptyTransport.sendInput(payload);`,
    corrected: `      const payload = inputHandler.mapKeyForPty(intercepted);
      if (source === "key" && options.routeKeyInput?.(payload) === true)
        return;
      ptyTransport.sendInput(payload);`,
  },
  {
    original: `      const seq = inputHandler.encodePromptClickEvent(cell);
      if (seq) {
        event.preventDefault();
        sendKeyInput(seq);`,
    corrected: `      const seq = inputHandler.encodePromptClickEvent(cell);
      if (seq) {
        event.preventDefault();
        sendKeyInput(seq, "pointer");`,
  },
  {
    original: `    if (event.inputType === "insertFromPaste") {
      event.preventDefault();`,
    corrected: `    if (event.inputType === "insertFromPaste") {
      bindOptions.onPasteGesture?.();
      event.preventDefault();`,
  },
  {
    original: `  const onPaste = (event) => {
    if (!getWasmReady() || !getWasmHandle())
      return;
    event.preventDefault();`,
    corrected: `  const onPaste = (event) => {
    if (!getWasmReady() || !getWasmHandle())
      return;
    bindOptions.onPasteGesture?.();
    event.preventDefault();`,
  },
  {
    original: `    getCursorForCpr: resolveCursorForCpr,
    sendInput,
    runBeforeInputHook,`,
    corrected: `    getCursorForCpr: resolveCursorForCpr,
    sendInput,
    routeKeyInput: services.routeKeyInput,
    runBeforeInputHook,`,
  },
  {
    original: `  function bindCanvasEvents() {
    bindCanvasInteractionEvents({
      inputHandler,
      sendKeyInput,`,
    corrected: `  function bindCanvasEvents() {
    bindCanvasInteractionEvents({
      inputHandler,
      onPasteGesture: services.onPasteGesture,
      sendKeyInput,`,
  },
];
