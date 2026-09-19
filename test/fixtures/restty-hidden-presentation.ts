declare global {
  var __hiddenRenderGeometry:
    | WeakMap<
        HTMLCanvasElement,
        {
          cursor: { row: number; col: number };
          rows: number;
          cols: number;
          cellW: number;
          cellH: number;
        }
      >
    | undefined;
}

export const hiddenGLMethods = [
  "clear",
  "drawArrays",
  "drawElements",
  "drawArraysInstanced",
  "drawElementsInstanced",
  "bufferData",
  "bufferSubData",
  "texImage2D",
  "texSubImage2D",
  "deleteTexture",
] as const;

export function instrumentHiddenWebGL() {
  const calls = new Map<HTMLCanvasElement, Record<string, number>>();
  for (const name of hiddenGLMethods) {
    const original = WebGL2RenderingContext.prototype[name];
    Object.defineProperty(WebGL2RenderingContext.prototype, name, {
      configurable: true,
      value: function (this: WebGL2RenderingContext, ...args: unknown[]) {
        const canvas = this.canvas as HTMLCanvasElement;
        const counts = calls.get(canvas) ?? {};
        counts[name] = (counts[name] ?? 0) + 1;
        calls.set(canvas, counts);
        Reflect.apply(original, this, args);
      },
    });
  }
  return calls;
}

// Read the actual drawing buffer in the tab-switch task, before presentation.
// No frame, timeout, screenshot round-trip, or settling delay precedes this read.
export function hiddenPresentation(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2")!;
  const pixel = new Uint8Array(4);
  gl.readPixels(
    Math.floor(canvas.width / 2),
    Math.floor(canvas.height / 2),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel,
  );
  const screen = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(
    0,
    0,
    canvas.width,
    canvas.height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    screen,
  );
  let foregroundPixels = 0;
  for (let offset = 0; offset < screen.length; offset += 4)
    if (
      screen[offset]! > 100 &&
      screen[offset + 1]! > 100 &&
      screen[offset + 2]! > 100
    )
      foregroundPixels += 1;
  const geometry = globalThis.__hiddenRenderGeometry!.get(canvas)!;
  const cellWidth = geometry.cellW;
  const cellHeight = geometry.cellH;
  const cursorPixels = new Uint8Array(cellWidth * cellHeight * 4);
  gl.readPixels(
    14 * cellWidth,
    canvas.height - (geometry.cursor.row + 1) * cellHeight,
    cellWidth,
    cellHeight,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    cursorPixels,
  );
  let cursorForeground = 0;
  for (let offset = 0; offset < cursorPixels.length; offset += 4)
    if (
      cursorPixels[offset] === 240 &&
      cursorPixels[offset + 1] === 240 &&
      cursorPixels[offset + 2] === 255
    )
      cursorForeground += 1;
  return { geometry, cursorForeground, foregroundPixels, pixel: [...pixel] };
}
