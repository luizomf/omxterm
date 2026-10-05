// Both renderers derive blink visibility from the absolute clock phase.
// Relative deadlines drift with late RAF callbacks and can skip a whole phase.
export const blinkCorrections = [
  {
    original:
      "        options.internalState.nextBlinkTime = now + options.CURSOR_BLINK_MS;",
    corrected:
      "        options.internalState.nextBlinkTime = (Math.floor(now / options.CURSOR_BLINK_MS) + 1) * options.CURSOR_BLINK_MS;",
  },
  {
    original: "    nextBlinkTime: performance.now() + render.CURSOR_BLINK_MS",
    corrected:
      "    nextBlinkTime: (Math.floor(performance.now() / render.CURSOR_BLINK_MS) + 1) * render.CURSOR_BLINK_MS",
  },
];
