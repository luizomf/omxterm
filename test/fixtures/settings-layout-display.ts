import assert from "node:assert/strict";
import type { SettingsGeometrySize } from "./settings-layout-observation";

export const settingsExactViewports = [
  [600, 320],
  [600, 480],
  [640, 480],
  [800, 600],
  [960, 320],
  [960, 640],
  [1280, 800],
  [1920, 1080],
] as const;

// Electron screen/bounds are DIPs, not physical pixels. Only renderer zoom
// converts the CSS viewport to content DIPs; display scaleFactor is diagnostic.
export function assertSettingsDisplayGeometry(options: {
  readonly outer: SettingsGeometrySize;
  readonly content: SettingsGeometrySize;
  readonly zoom: number;
  readonly display: {
    readonly workArea: SettingsGeometrySize;
    readonly scaleFactor: number;
  };
}) {
  const { outer, content, zoom, display } = options;
  assert.ok(
    [outer, content, display.workArea].every((size) =>
      [size.width, size.height].every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    ) &&
      Number.isFinite(zoom) &&
      zoom > 0,
    "Settings invalid geometry for display prerequisite",
  );
  const frame = {
    width: outer.width - content.width,
    height: outer.height - content.height,
  };
  assert.ok(
    frame.width >= 0 && frame.height >= 0,
    "Settings invalid geometry for native frame",
  );
  const viewport = {
    width: Math.max(...settingsExactViewports.map(([width]) => width)),
    height: Math.max(...settingsExactViewports.map(([, height]) => height)),
  };
  const required = {
    width: Math.ceil(viewport.width * zoom) + frame.width,
    height: Math.ceil(viewport.height * zoom) + frame.height,
  };
  const size = ({ width, height }: SettingsGeometrySize) =>
    `${width}x${height}`;
  assert.ok(
    display.workArea.width >= required.width &&
      display.workArea.height >= required.height,
    `Settings layout display prerequisite not met: ${size(viewport)} CSS px viewport ` +
      `requires at least ${size(required)} DIP usable work area with the observed ` +
      `${size(frame)} DIP native frame and renderer zoom ${zoom}; ` +
      `selected display work area is ${size(display.workArea)} DIPs ` +
      `(scaleFactor ${display.scaleFactor}, not a physical-resolution minimum). ` +
      "Provision a larger logical usable work area in the assigned test desktop, " +
      "then run npm test -- test/integration/window-chrome.test.ts -t settings-only " +
      "before the full suite. The matrix has not run; this is a failure, not a skip. " +
      "See docs/development.md#settings-layout-display-requirement.",
  );
}
