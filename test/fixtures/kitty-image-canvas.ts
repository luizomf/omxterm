import type { TerminalSize } from "../../src/shared/terminal-contract";

export interface CellSize {
  readonly height: number;
  readonly width: number;
}

export interface PixelBounds {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export function imageCanvas(
  root: ParentNode = document,
): HTMLCanvasElement | undefined {
  return (
    root.querySelector<HTMLCanvasElement>(".xterm-image-layer-top") ?? undefined
  );
}

export function canvasIsPainted(root: ParentNode = document): boolean {
  return paintedBounds(root) !== undefined;
}

export function canvasContainsColor(
  expected: readonly [number, number, number, number],
  root: ParentNode = document,
): boolean {
  const canvas = imageCanvas(root);
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (expected.every((value, offset) => pixels[index + offset] === value))
      return true;
  }
  return false;
}

export function paintedBounds(
  root: ParentNode = document,
): PixelBounds | undefined {
  const canvas = imageCanvas(root);
  if (!canvas || canvas.width === 0 || canvas.height === 0) return undefined;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let right = -1;
  let top = canvas.height;
  let bottom = -1;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 0) continue;
    const pixel = (index - 3) / 4;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return right < 0
    ? undefined
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function currentCellSize(
  terminalSizes: readonly TerminalSize[],
): CellSize {
  const canvas = imageCanvas();
  const size = terminalSizes.at(-1);
  if (!canvas || !size)
    throw new Error("Terminal cell metrics are unavailable");
  return {
    height: canvas.height / size.rows,
    width: canvas.width / size.cols,
  };
}

export function cellSizesAgree(reported: CellSize, actual: CellSize): boolean {
  return (
    Math.abs(reported.height - actual.height) <= 0.5 &&
    Math.abs(reported.width - actual.width) <= 0.5
  );
}

export function placementIsCellAnchored(
  bounds: PixelBounds,
  columns: number,
  rows: number,
  cellSize: CellSize,
): boolean {
  return (
    Math.abs(bounds.width - Math.round(columns * cellSize.width)) <= 2 &&
    Math.abs(bounds.height - Math.round(rows * cellSize.height)) <= 2 &&
    isCellAligned(bounds.left, cellSize.width) &&
    isCellAligned(bounds.top, cellSize.height)
  );
}

export function isWholeCellDistance(
  distance: number,
  cellLength: number,
): boolean {
  return distance > 0 && isCellAligned(distance, cellLength);
}

export function pixelBoundsEqual(
  left: PixelBounds,
  right: PixelBounds,
): boolean {
  return (
    left.height === right.height &&
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width
  );
}

function isCellAligned(position: number, cellLength: number): boolean {
  return (
    Math.abs(position - Math.round(position / cellLength) * cellLength) <= 1
  );
}
