/** Instrument only the disposable cursor bundle, never installed/runtime bytes. */
export function cursorRuntimeProbe(source: string): string {
  const draw = "            options.tickWebGL(state);";
  if (source.split(draw).length !== 2)
    throw new Error("Cursor paint probe seam drifted");
  const clock = "Math.floor(performance.now() / CURSOR_BLINK_MS) % 2 === 0";
  if (source.split(clock).length !== 3)
    throw new Error("Cursor blink clock probe seam drifted");
  const refresh = "    refresh() {\n      const shared = options.readState();";
  if (source.split(refresh).length !== 2)
    throw new Error("Cursor refresh probe seam drifted");
  // Replace only the clock input, never cursor visibility, style or draw logic.
  // Native pixel qualification is separate from production scheduler regressions.
  return source
    .replace(draw, `${draw}\n            globalThis.cursorProbe.painted();`)
    .replace(
      refresh,
      "    refresh: globalThis.cursorProbe.refresh = function() {\n      const shared = options.readState();",
    )
    .replaceAll(
      clock,
      "Math.floor(globalThis.cursorProbe.blinkNow() / CURSOR_BLINK_MS) % 2 === 0",
    );
}
