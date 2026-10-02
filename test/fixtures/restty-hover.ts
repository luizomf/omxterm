import type { BrowserWindow } from "electron";
import {
  HoverEvidenceError,
  hoverCellPoint,
  inspectHoverPixels,
  requireHoverDraw,
  requireHoverPixels,
  sameHoverGeometry,
  validateHoverGeometry,
  type HoverDraw,
  type HoverGeometry,
  type HoverPixels,
} from "./restty-hover-evidence";

export const HOVER_PHASE_PREFIX = "__OMXTERM_HOVER_PHASE__";
export const HOVER_STEP_TIMEOUT = 5000;
export interface HoverSnapshot {
  readonly canvasId: number;
  readonly geometry: HoverGeometry;
  readonly draw: HoverDraw;
  readonly events: readonly {
    readonly type: string;
    readonly trusted: boolean;
    readonly modified: boolean;
    readonly at: number;
  }[];
  readonly core: {
    readonly cols: number;
    readonly rows: number;
    readonly text: string;
  };
}
const hoverSnapshotSource = `(() => {
    const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
    if (!canvas?.__resttyHoverFixture || !canvas.__localImageFixtureCoreCells) throw new Error('Hover fixture observer is missing');
    const core = canvas.__localImageFixtureCoreCells();
    if (!core) throw new Error('Hover fixture core is unavailable');
    return {...canvas.__resttyHoverFixture(), core:{cols:core.cols,rows:core.rows,text:core.text}};
  })()`;
export async function readHoverSnapshot(
  window: BrowserWindow,
): Promise<HoverSnapshot> {
  return window.webContents.executeJavaScript(
    hoverSnapshotSource,
    true,
  ) as Promise<HoverSnapshot>;
}

interface HoverOptions {
  readonly window: BrowserWindow;
  readonly deliverOutput: (data: string) => void;
  readonly input: () => string;
  readonly size: { readonly cols: number; readonly rows: number };
  readonly text: string;
  readonly destinationColumns: number;
  readonly prefixColumns?: number;
  readonly targetColumn?: number;
  // Image fixtures query before emitting/reflowing their retained references.
  // Reuse only while the observed current device metrics still match exactly.
  readonly deviceCellSize?: readonly [number, number];
  // Native controls act at actual callers; never replace observation or pixels.
  readonly beforeStimulus?: (prepared: HoverSnapshot) => Promise<void>;
  readonly afterStimulus?: (stimulus: HoverSnapshot) => Promise<void>;
  readonly beforeCapture?: () => Promise<void>;
  readonly afterCapture?: (stimulus: HoverSnapshot) => Promise<void>;
  readonly control?: "early-capture";
}

async function bounded<T>(
  operation: () => Promise<T>,
  category: HoverEvidenceError["category"],
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new HoverEvidenceError(category)),
          HOVER_STEP_TIMEOUT,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export { bounded as boundedHoverStep };

async function dispatchHoverEvent(window: BrowserWindow, event: string) {
  return bounded(
    () =>
      window.webContents.executeJavaScript(
        `(() => { const beforeRevision = (${hoverSnapshotSource}).draw.revision; ${event} return {beforeRevision, snapshot: ${hoverSnapshotSource}}; })()`,
        true,
      ) as Promise<{ beforeRevision: number; snapshot: HoverSnapshot }>,
    "cue-not-drawn",
  );
}

async function poll(
  predicate: () => Promise<boolean> | boolean,
  category: HoverEvidenceError["category"],
): Promise<void> {
  const deadline = Date.now() + HOVER_STEP_TIMEOUT;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new HoverEvidenceError(category);
}
async function readHoverCellSize(
  options: HoverOptions,
): Promise<readonly [number, number]> {
  if (options.deviceCellSize) return options.deviceCellSize;
  const start = options.input().length;
  options.deliverOutput("\u001b[16t");
  await poll(
    () => /\u001b\[6;\d+;\d+t/u.test(options.input().slice(start)),
    "preparation",
  );
  const match = /\u001b\[6;(\d+);(\d+)t/u.exec(options.input().slice(start))!;
  return [Number(match[2]), Number(match[1])];
}

type HoverPhase = "prepare" | "baseline" | "modified" | "released";
function recordHoverPhase(
  window: BrowserWindow,
  input: {
    phase: HoverPhase;
    category: "none" | HoverEvidenceError["category"];
    expectedCells: number;
    prefixColumns: number;
    stimulus: { canvasId: number; revision: number; cells: number } | undefined;
    preparation: {
      readonly exactContent: boolean;
      readonly gridMatches: boolean;
      readonly deviceCellSize: readonly [number, number] | undefined;
    };
    before: HoverSnapshot | undefined;
    after: HoverSnapshot | undefined;
    latest: HoverSnapshot | undefined;
    pixels: HoverPixels | undefined;
  },
): void {
  const safeSnapshot = (value: HoverSnapshot | undefined) =>
    value && {
      canvasId: value.canvasId,
      geometry: value.geometry,
      draw: value.draw,
      events: value.events,
    };
  process.stdout.write(
    HOVER_PHASE_PREFIX +
      JSON.stringify({
        version: 1,
        phase: input.phase,
        category: input.category,
        expectedCells: input.expectedCells,
        prefixColumns: input.prefixColumns,
        stimulus: input.stimulus,
        preparation: input.preparation,
        before: safeSnapshot(input.before),
        after: safeSnapshot(input.after),
        latest: safeSnapshot(input.latest),
        pixels: input.pixels,
        native: {
          visible: window.isVisible(),
          minimized: window.isMinimized(),
          focused: window.isFocused(),
        },
      }) +
      "\n",
  );
}

export async function captureModifiedHoverEvidence(
  options: HoverOptions,
): Promise<{
  modifiedHoverChangedPixels: number;
  releasedHoverChangedPixels: number;
}> {
  const { window, size, text } = options;
  const prefix = options.prefixColumns ?? 4;
  let phase: HoverPhase = "prepare";
  let latest: HoverSnapshot | undefined;
  let before: HoverSnapshot | undefined;
  let after: HoverSnapshot | undefined;
  let pixels: HoverPixels | undefined;
  let deviceCellSize: readonly [number, number] | undefined;
  let stimulus: HoverSnapshot | undefined;
  const record = (category: "none" | HoverEvidenceError["category"]) =>
    recordHoverPhase(window, {
      phase,
      category,
      expectedCells: options.destinationColumns,
      prefixColumns: prefix,
      stimulus: stimulus && {
        canvasId: stimulus.canvasId,
        revision: stimulus.draw.revision,
        cells: stimulus.draw.cells,
      },
      preparation: {
        exactContent: latest?.core.text === text,
        gridMatches:
          latest?.core.cols === size.cols && latest?.core.rows === size.rows,
        deviceCellSize,
      },
      before,
      after,
      latest,
      pixels,
    });
  const read = async () => {
    latest = await bounded(
      () => readHoverSnapshot(window),
      phase === "prepare" ? "preparation" : "cue-not-drawn",
    );
    return latest;
  };
  let prepared: HoverSnapshot;
  const currentGeometry = (snapshot: HoverSnapshot) => {
    if (
      !Number.isSafeInteger(snapshot.canvasId) ||
      snapshot.canvasId <= 0 ||
      snapshot.canvasId !== prepared.canvasId ||
      !sameHoverGeometry(prepared.geometry, snapshot.geometry)
    )
      throw new HoverEvidenceError("geometry-changed");
    validateHoverGeometry(snapshot.geometry);
  };
  const current = (snapshot: HoverSnapshot) => {
    currentGeometry(snapshot);
    if (
      snapshot.core.cols !== size.cols ||
      snapshot.core.rows !== size.rows ||
      snapshot.core.text !== text
    )
      throw new HoverEvidenceError("stimulus-invalidated");
    if (!window.isVisible() || window.isMinimized())
      throw new HoverEvidenceError("preparation");
  };
  const draw = async (stimulus: HoverSnapshot) => {
    await poll(async () => {
      const snapshot = await read();
      current(snapshot);
      if (
        snapshot.draw.revision !== stimulus.draw.revision ||
        snapshot.draw.cells !== stimulus.draw.cells
      )
        throw new HoverEvidenceError("stimulus-invalidated");
      try {
        requireHoverDraw(
          snapshot.draw,
          stimulus.draw.revision,
          stimulus.draw.cells,
        );
        return true;
      } catch (error) {
        if (
          error instanceof HoverEvidenceError &&
          error.category === "cue-not-drawn"
        )
          return false;
        throw error;
      }
    }, "cue-not-drawn");
  };
  const dispatch = async (modified?: boolean) => {
    const prior = await read();
    current(prior);
    const point = hoverCellPoint(
      prepared.geometry,
      0,
      options.targetColumn ?? prefix,
    );
    const event =
      modified === undefined
        ? `window.dispatchEvent(new KeyboardEvent('keyup', {key:'${process.platform === "darwin" ? "Meta" : "Control"}'}));`
        : `const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
      canvas.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,pointerId:91,pointerType:'mouse',clientX:${point.x},clientY:${point.y},metaKey:${modified && process.platform === "darwin"},ctrlKey:${modified && process.platform !== "darwin"}}));`;
    // Dispatch and freeze its actual observer result in ONE synchronous task.
    const result = await dispatchHoverEvent(window, event);
    const snapshot = result.snapshot;
    latest = stimulus = snapshot;
    current(snapshot);
    if (
      !Number.isSafeInteger(result.beforeRevision) ||
      snapshot.draw.revision <= result.beforeRevision
    )
      throw new HoverEvidenceError("cue-not-drawn");
    return snapshot;
  };
  const capture = async (
    stimulus: HoverSnapshot,
    baseline?: { bitmap: Buffer; width: number; height: number },
  ) => {
    // Cross two actual native frame continuations after the observed draw.
    // This is a presentation opportunity, never pixel proof or recapture.
    if (phase !== "modified" || options.control !== "early-capture")
      await bounded(
        () =>
          window.webContents.executeJavaScript(
            "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
            true,
          ),
        "cue-not-drawn",
      );
    before = await read();
    current(before);
    const image = await bounded(
      () => window.webContents.capturePage(),
      "cue-not-drawn",
    );
    after = await read();
    currentGeometry(after);
    const captured = {
      bitmap: Buffer.from(image.toBitmap()),
      ...image.getSize(),
    };
    if (baseline)
      pixels = inspectHoverPixels(
        baseline.bitmap,
        captured.bitmap,
        captured.width,
        captured.height,
        prepared.geometry,
        {
          prefix,
          destinations: phase === "released" ? 0 : options.destinationColumns,
        },
      );
    else
      inspectHoverPixels(
        captured.bitmap,
        captured.bitmap,
        captured.width,
        captured.height,
        prepared.geometry,
        { prefix: 0, destinations: 0 },
      );
    if (phase === "modified" && options.afterCapture)
      await bounded(() => options.afterCapture!(stimulus), "cue-not-drawn");
    current(after);
    // Draw completion is not presentation: validate before/after, then pixels.
    for (const snapshot of [before, after])
      requireHoverDraw(
        snapshot.draw,
        stimulus.draw.revision,
        stimulus.draw.cells,
      );
    if (pixels) requireHoverPixels(pixels);
    record("none");
    return captured;
  };
  try {
    await poll(async () => {
      const snapshot = await read();
      return (
        snapshot.core.text === text &&
        snapshot.core.cols === size.cols &&
        snapshot.core.rows === size.rows
      );
    }, "preparation");
    // Cross queued renderer work and the real FIFO preload/main route BEFORE
    // requesting metrics or preparing a pointer. Neither crossing proves paint.
    await bounded(
      () =>
        window.webContents.executeJavaScript(
          `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => window.omxterm.terminal.configuration()).then(() => undefined)`,
          true,
        ),
      "preparation",
    );
    deviceCellSize = await readHoverCellSize(options);
    const [cellWidth, cellHeight] = deviceCellSize;
    prepared = await read();
    validateHoverGeometry(prepared.geometry);
    if (
      prepared.geometry.cellWidth !== cellWidth ||
      prepared.geometry.cellHeight !== cellHeight ||
      prepared.geometry.cols !== size.cols ||
      prepared.geometry.rows !== size.rows ||
      prepared.core.text !== text
    )
      throw new HoverEvidenceError("preparation");
    current(prepared);
    phase = "baseline";
    const unmodified = await dispatch(false);
    if (unmodified.draw.cells !== 0)
      throw new HoverEvidenceError("stimulus-invalidated");
    await draw(unmodified);
    const baseline = await capture(unmodified);
    phase = "modified";
    stimulus = undefined;
    before = undefined;
    after = undefined;
    pixels = undefined;
    if (options.beforeStimulus)
      await bounded(() => options.beforeStimulus!(prepared), "cue-not-drawn");
    const modified = await dispatch(true);
    if (options.afterStimulus)
      await bounded(() => options.afterStimulus!(modified), "cue-not-drawn");
    if (options.control !== "early-capture") await draw(modified);
    await options.beforeCapture?.();
    await capture(modified, baseline);
    const modifiedHoverChangedPixels = pixels!.total;
    phase = "released";
    stimulus = undefined;
    before = undefined;
    after = undefined;
    pixels = undefined;
    const released = await dispatch();
    if (released.draw.cells !== 0)
      throw new HoverEvidenceError("stimulus-invalidated");
    await draw(released);
    await capture(released, baseline);
    return {
      modifiedHoverChangedPixels,
      releasedHoverChangedPixels: pixels!.total,
    };
  } catch (error) {
    const failure =
      error instanceof HoverEvidenceError
        ? error
        : new HoverEvidenceError("preparation");
    record(failure.category);
    throw failure;
  }
}
