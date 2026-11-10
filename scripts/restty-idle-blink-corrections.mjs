// A blink phase redrew the Surface even when nothing on it blinks. Both
// renderers now record whether the presented frame depends on the phase, and
// the render loop skips phases that would redraw an identical frame. Every
// input to that answer invalidates: output, scrolling and preedit already do,
// and focus moves now do too, so a stale answer cannot freeze a blinking cursor.
export const idleBlinkCorrections = [
  {
    original: "function buildWebGLTickContext(deps, state) {",
    corrected: `// Cells and the cursor read the phase only while the cursor blinks: the
// cursor through its phase-dependent style, the cells through SGR 5.
function blinkPhaseChangesFrame({ isBlinking, cursor, cursorOptions, resolveCursorStyle, styleFlags, STYLE_BLINK }) {
  if (!isBlinking)
    return false;
  const style = (blinkVisible) => cursor ? resolveCursorStyle(cursor, { ...cursorOptions, blinkVisible }) : null;
  return style(true) !== style(false) || Boolean(styleFlags?.some((flags) => (flags & STYLE_BLINK) !== 0));
}
function buildWebGLTickContext(deps, state) {`,
  },
  {
    original: `  const cursorStyle = cursor ? resolveCursorStyle(cursor, {
    focused: isFocused || imeFocused,
    preedit: Boolean(imeState.preedit),
    blinkVisible
  }) : null;`,
    corrected: `  const cursorOptions = {
    focused: isFocused || imeFocused,
    preedit: Boolean(imeState.preedit)
  };
  const cursorStyle = cursor ? resolveCursorStyle(cursor, { ...cursorOptions, blinkVisible }) : null;
  deps.lastFrameBlinks = blinkPhaseChangesFrame({
    isBlinking,
    cursor,
    cursorOptions,
    resolveCursorStyle,
    styleFlags,
    STYLE_BLINK: deps.STYLE_BLINK
  });`,
    occurrences: 2,
  },
  {
    original: `        options.internalState.nextBlinkTime = (Math.floor(now / options.CURSOR_BLINK_MS) + 1) * options.CURSOR_BLINK_MS;
        options.writeState({ needsRender: true });`,
    corrected: `        options.internalState.nextBlinkTime = (Math.floor(now / options.CURSOR_BLINK_MS) + 1) * options.CURSOR_BLINK_MS;
        if (options.lastFrameBlinks())
          options.writeState({ needsRender: true });`,
  },
  {
    original: "    BACKGROUND_RENDER_FPS: render.BACKGROUND_RENDER_FPS,",
    corrected: `    BACKGROUND_RENDER_FPS: render.BACKGROUND_RENDER_FPS,
    lastFrameBlinks: render.lastFrameBlinks,`,
  },
  {
    original: `  configureImeInputElement();
  let lastRenderState = null;`,
    corrected: `  configureImeInputElement();
  // Focus decides the cursor style and whether it blinks.
  imeInput?.addEventListener("focus", invalidateRender);
  imeInput?.addEventListener("blur", invalidateRender);
  cleanupFns.push(() => {
    imeInput?.removeEventListener("focus", invalidateRender);
    imeInput?.removeEventListener("blur", invalidateRender);
  });
  let lastRenderState = null;
  let lastFrameBlinks = true;`,
  },
  {
    original: "    setIsFocused: (value) => isFocused = value,",
    corrected: `    setIsFocused: (value) => {
      isFocused = value;
      invalidateRender();
    },`,
  },
  {
    original: `    set lastRenderState(value) {
      lastRenderState = value;
    }`,
    corrected: `    set lastRenderState(value) {
      lastRenderState = value;
    },
    set lastFrameBlinks(value) {
      lastFrameBlinks = value;
    }`,
  },
  {
    original: `      BACKGROUND_RENDER_FPS,
      tickWebGPU,`,
    corrected: `      BACKGROUND_RENDER_FPS,
      lastFrameBlinks: () => lastFrameBlinks,
      tickWebGPU,`,
  },
];
