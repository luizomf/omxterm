import type { ScrollFeedbackCore } from "./restty-native-scroll-feedback-observer";

export interface ScrollFeedbackStartupGeometry {
  readonly width: number;
  readonly clientHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly sameCanvas: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly dpr: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly core: ScrollFeedbackCore;
}

// Startup only: mapping a native window can change layout before its backing
// canvas/core refit. Require coherent geometry for 100ms within the original
// five-second startup budget. This bounded observation is not a guarantee of
// compositor quiescence; later changes still fail the strict transition checks.
export async function waitForScrollFeedbackStartup<
  Metrics extends ScrollFeedbackStartupGeometry,
>(
  readMetrics: () => Metrics,
  nextFrame: () => Promise<void>,
  now: () => number = () => performance.now(),
): Promise<Metrics> {
  const deadline = now() + 5_000;
  let previous = "";
  let stableSince: number | undefined;
  let current: Metrics;
  do {
    await nextFrame();
    current = readMetrics();
    const geometry = JSON.stringify([
      current.width,
      current.clientHeight,
      current.canvasWidth,
      current.canvasHeight,
      current.canvasCssWidth,
      current.canvasCssHeight,
      current.viewportWidth,
      current.viewportHeight,
      current.dpr,
      current.core.len,
      current.core.cellH,
    ]);
    const coherent =
      current.sameCanvas &&
      current.width > 0 &&
      current.clientHeight > 0 &&
      current.canvasCssWidth > 0 &&
      current.canvasCssHeight > 0 &&
      // This fixture's borderless, 100%-sized canvas fills the scroll host.
      // Keep integer host metrics for DOM scrolling, but do not quantize the
      // backing buffer from them: Restty floors its actual canvas rectangle.
      Math.round(current.canvasCssWidth) === current.width &&
      Math.round(current.canvasCssHeight) === current.clientHeight &&
      current.dpr > 0 &&
      current.core.cellH > 0 &&
      current.canvasWidth ===
        Math.max(1, Math.floor(current.canvasCssWidth * current.dpr)) &&
      current.canvasHeight ===
        Math.max(1, Math.floor(current.canvasCssHeight * current.dpr)) &&
      current.core.len ===
        Math.floor(current.canvasHeight / current.core.cellH) &&
      current.scrollTop === current.scrollHeight - current.clientHeight &&
      current.core.offset === current.core.total - current.core.len;
    if (!coherent) stableSince = undefined;
    else if (geometry !== previous || stableSince === undefined)
      stableSince = now();
    previous = geometry;
    if (
      stableSince !== undefined &&
      now() <= deadline &&
      now() - stableSince >= 100
    )
      return current;
  } while (now() < deadline);
  throw new Error(
    `Scroll feedback startup geometry did not settle: ${JSON.stringify(current)}`,
  );
}
