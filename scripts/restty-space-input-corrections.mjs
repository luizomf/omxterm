// Historical correction retained so every accepted input has an exact upgrade path.
export const spaceInputCorrections = [
  {
    original: `      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !event.repeat && !(event.altKey && optionActsAsAlt())) {`,
    corrected: `      // Standalone Space must not depend on native text insertion: macOS can
      // omit it on successive taps. Composition and native Option text bypass
      // this path above; the ordinary key encoder still owns protocol reporting.
      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && event.key !== " " && !event.repeat && !(event.altKey && optionActsAsAlt())) {`,
  },
  {
    original: `    if (options.imeInput && imeActive && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !event.repeat && !event.isComposing && !options.interaction.imeState.composing) {`,
    corrected: `    if (options.imeInput && imeActive && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && event.key !== " " && !event.repeat && !event.isComposing && !options.interaction.imeState.composing) {`,
  },
];

export const nativeDeadKeySpaceCorrections = [
  {
    original: `function attachRuntimeControllerKeyboardEvents(options) {
  let leftOptionDown = false;`,
    corrected: `function attachRuntimeControllerKeyboardEvents(options) {
  let nativeDeadKeyPending = false;
  let nativeDeadKeySpaceDown = false;
  const clearNativeDeadKeyPending = () => { nativeDeadKeyPending = false; };
  const resetNativeDeadKeyState = () => {
    nativeDeadKeyPending = false;
    nativeDeadKeySpaceDown = false;
  };
  let leftOptionDown = false;`,
  },
  {
    original: `  const onKeyDown = (event) => {
    updateOptionState(event, true);
    if (isMacInputSourceShortcut(event)) {`,
    corrected: `  const onKeyDown = (event) => {
    updateOptionState(event, true);
    if (hasInputFocus()) {
      const nativeTextModifiers = !event.ctrlKey && !event.metaKey && (!event.altKey || options.isMacPlatform && !optionActsAsAlt());
      if (event.key === " " && nativeDeadKeySpaceDown)
        return;
      if (event.key === "Dead" && nativeTextModifiers) {
        nativeDeadKeyPending = true;
      } else if (event.key === " " && nativeTextModifiers && nativeDeadKeyPending) {
        // X11 can commit a dead key through insertText without composition events.
        // Leave this press and its repeats to native text, retaining release ownership.
        nativeDeadKeyPending = false;
        nativeDeadKeySpaceDown = true;
        return;
      } else if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
        nativeDeadKeyPending = false;
      }
    }
    if (isMacInputSourceShortcut(event)) {`,
  },
  {
    original: `  const onKeyUp = (event) => {
    updateOptionState(event, false);
    if (isMacInputSourceShortcut(event))`,
    corrected: `  const onKeyUp = (event) => {
    updateOptionState(event, false);
    if (event.key === " " && nativeDeadKeySpaceDown) {
      nativeDeadKeySpaceDown = false;
      return;
    }
    if (isMacInputSourceShortcut(event))`,
  },
  {
    original: `  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", resetOptionState);`,
    corrected: `  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", resetOptionState);
  window.addEventListener("blur", resetNativeDeadKeyState);
  options.imeInput?.addEventListener("blur", resetNativeDeadKeyState);
  for (const type of ["beforeinput", "input", "compositionend"])
    options.imeInput?.addEventListener(type, clearNativeDeadKeyPending);
  options.cleanupFns.push(() => {
    window.removeEventListener("blur", resetNativeDeadKeyState);
    options.imeInput?.removeEventListener("blur", resetNativeDeadKeyState);
    for (const type of ["beforeinput", "input", "compositionend"])
      options.imeInput?.removeEventListener(type, clearNativeDeadKeyPending);
  });`,
  },
];
