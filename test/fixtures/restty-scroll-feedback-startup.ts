import type { ScrollFeedbackCore } from "./restty-native-scroll-feedback-observer";

export interface ScrollFeedbackStartupGeometry {
  readonly width: number;
  readonly clientHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
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
      current.dpr > 0 &&
      current.core.cellH > 0 &&
      current.canvasWidth === Math.round(current.width * current.dpr) &&
      current.canvasHeight === Math.round(current.clientHeight * current.dpr) &&
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
