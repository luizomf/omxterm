import { mountResttyTerminalSurface as mountRealSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionId } from "../../src/shared/terminal-contract";
import { instrumentHiddenWebGL } from "./restty-hidden-presentation";

// Fixture-only observation of the production renderer. The real mount, the real
// preload bridge and the real Restty runtime stay in place; this module records
// what the application already produced (draws, grid text, output bytes) and
// never replaces host policy. Text export is the expensive call, so hot waits
// first compare the application's own cumulative output offset and read the grid
// once; the cost is measured and reported.
declare global {
  interface Window {
    readonly performanceBenchmark: PerformanceBenchmark;
  }
}

export interface EffectiveConfiguration {
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly fontFamily: string | null;
  readonly scrollbackLines: number;
  readonly terminalPadding: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

export interface SurfaceFrame {
  readonly tabIndex: number;
  readonly visible: boolean;
  readonly draws: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly characters: number;
  readonly contentHash: number;
  readonly session: string | null;
}

export interface InputResult {
  armed: boolean;
  settled: boolean;
  keydownAtMs: number | null;
  gridChangedAtMs: number | null;
  // Recorded, non-gated evidence: next draw after the grid change, bounded and
  // measured only inside the input window. Not a presentation timestamp.
  gridToDrawMs: number | null;
  pollCostMs: number;
  error: string | null;
}

export interface StreamResult {
  readonly found: boolean;
  readonly bytes: number;
  /** Bytes arrived beyond the fixed payload: command echo plus end marker. */
  readonly overheadBytes: number;
  readonly drawsBefore: number;
  readonly drawsAtFound: number;
  readonly pollCostMs: number;
  /** Renderer clock, from command write to marker observation or timeout. */
  readonly elapsedMs: number;
}

export interface PerformanceBenchmark {
  surfaces(): number;
  write(tabIndex: number, text: string): boolean;
  frames(): {
    readonly surfaces: readonly SurfaceFrame[];
    readonly devicePixelRatio: number;
    readonly visibilityState: string;
    readonly documentHasFocus: boolean;
    readonly outputBytes: readonly number[];
    readonly outputSessions: readonly string[];
    readonly configuration: EffectiveConfiguration | null;
    readonly webglRenderer: string | null;
  };
  textHash(tabIndex: number): {
    readonly characters: number;
    readonly hash: number;
  };
  hasMarker(
    tabIndex: number,
    marker: string,
    timeoutMs: number,
  ): Promise<boolean>;
  collectGarbage(): boolean;
  waitForMarker(
    tabIndex: number,
    marker: string,
    timeoutMs: number,
  ): Promise<{ readonly found: boolean; readonly drawsAtFound: number }>;
  stream(
    tabIndex: number,
    command: string,
    token: string,
    marker: string,
    expectedBytes: number,
    timeoutMs: number,
  ): Promise<StreamResult>;
  armInput(timeoutMs: number): boolean;
  inputResult(): InputResult;
}

interface RecordedSurface {
  readonly surface: TerminalSurface;
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
}

const draws = instrumentHiddenWebGL();
const recorded: RecordedSurface[] = [];
const sessions: string[] = [];
const outputBytes = new Map<string, number>();
let configuration: EffectiveConfiguration | null = null;
let webglRenderer: string | null = null;
let input: InputResult = {
  armed: false,
  settled: false,
  keydownAtMs: null,
  gridChangedAtMs: null,
  gridToDrawMs: null,
  pollCostMs: 0,
  error: null,
};

function tabElements(): Element[] {
  return [...document.querySelectorAll("#terminal-tabs > .terminal-tab")];
}

function tabIndexOf(container: HTMLElement): number {
  const tab = container.closest(".terminal-tab");
  return tab === null ? -1 : tabElements().indexOf(tab);
}

function visibleRecord(): RecordedSurface | undefined {
  return recorded.find(
    (record) =>
      record.container.isConnected && !record.container.hasAttribute("hidden"),
  );
}

function recordFor(tabIndex: number): RecordedSurface | undefined {
  return recorded.find((record) => tabIndexOf(record.container) === tabIndex);
}

function drawCount(canvas: HTMLCanvasElement): number {
  const counts = draws.get(canvas);
  if (!counts) return 0;
  let total = 0;
  for (const [name, value] of Object.entries(counts))
    if (name.startsWith("draw") || name === "clear") total += value;
  return total;
}

// Stable, allocation-free content witness: 32-bit FNV-1a over the exported
// text. Equal hashes in consecutive samples mean the grid did not change.
function contentHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function textOf(record: RecordedSurface): string {
  return record.surface.exportText("content");
}

function gridOf(record: RecordedSurface) {
  const geometry = record.surface.geometry();
  if (!geometry) return { columns: 0, rows: 0, cellWidth: 0, cellHeight: 0 };
  const scale = window.devicePixelRatio;
  return {
    columns: Math.round(record.canvas.width / (geometry.cellWidth * scale)),
    rows: Math.round(record.canvas.height / (geometry.cellHeight * scale)),
    cellWidth: geometry.cellWidth,
    cellHeight: geometry.cellHeight,
  };
}

// Frames are metadata only. Exporting the grid text is an explicit, separate
// call: doing it on every poll allocates a full scrollback string inside the
// measured renderer and changes the very memory it is supposed to observe.
function frameOf(record: RecordedSurface): SurfaceFrame {
  const tabIndex = tabIndexOf(record.container);
  return {
    tabIndex,
    visible: !record.container.hasAttribute("hidden"),
    draws: drawCount(record.canvas),
    ...gridOf(record),
    characters: 0,
    contentHash: 0,
    session: sessions[tabIndex] ?? null,
  };
}

function pollMarker(
  tabIndex: number,
  marker: string,
  timeoutMs: number,
): Promise<{ found: boolean; drawsAtFound: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = () => {
      const record = recordFor(tabIndex);
      const found = record !== undefined && textOf(record).includes(marker);
      if (found || performance.now() - started > timeoutMs) {
        resolve({
          found,
          drawsAtFound: record ? drawCount(record.canvas) : 0,
        });
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

// The exported production mount, substituted for the application's own import
// at bundle time so the fixture can read the grid the application produced.
export const mountResttyTerminalSurface: typeof mountRealSurface = async (
  container,
  adapter,
  options = {},
) => {
  const surface = await mountRealSurface(container, adapter, options);
  const canvas = container.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) throw new Error("Production Surface produced no canvas");
  recorded.push({ surface, container, canvas });
  return surface;
};

const benchmark: PerformanceBenchmark = {
  surfaces: () => recorded.length,
  write(tabIndex, text) {
    const session = sessions[tabIndex];
    if (session === undefined) return false;
    window.omxterm.terminal.input(session as TerminalSessionId, text);
    return true;
  },
  frames() {
    return {
      surfaces: recorded.map(frameOf),
      devicePixelRatio: window.devicePixelRatio,
      visibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      outputBytes: [...outputBytes.values()],
      outputSessions: [...outputBytes.keys()],
      configuration,
      webglRenderer: (webglRenderer ??= readWebglRenderer()),
    };
  },
  textHash(tabIndex) {
    const record = recordFor(tabIndex);
    if (!record) return { characters: 0, hash: 0 };
    const text = textOf(record);
    return { characters: text.length, hash: contentHash(text) };
  },
  // Measurement control, not a production path: the renderer runs with
  // --js-flags=--expose-gc so the steady reads start from a collected heap.
  collectGarbage() {
    const collect = (globalThis as { gc?: () => void }).gc;
    if (typeof collect !== "function") return false;
    collect();
    collect();
    return true;
  },
  hasMarker(tabIndex, marker, timeoutMs) {
    return pollMarker(tabIndex, marker, timeoutMs).then(
      (result) => result.found,
    );
  },
  waitForMarker(tabIndex, marker, timeoutMs) {
    return pollMarker(tabIndex, marker, timeoutMs);
  },
  stream(tabIndex, command, token, marker, expectedBytes, timeoutMs) {
    const session = sessions[tabIndex];
    if (session === undefined) return Promise.reject(new Error("no-session"));
    const start = outputBytes.get(session) ?? 0;
    const started = performance.now();
    let pollCostMs = 0;
    const drawsBefore = recordFor(tabIndex)
      ? drawCount(recordFor(tabIndex)!.canvas)
      : 0;
    benchmark.write(tabIndex, `${command} ${token}\r`);
    return new Promise((resolve) => {
      const poll = () => {
        const record = recordFor(tabIndex);
        const arrived = (outputBytes.get(session) ?? 0) - start;
        if (record && arrived >= expectedBytes) {
          // One grid read proves the payload reached the Surface, not only the
          // renderer: the marker carries this stream's own token.
          const readStarted = performance.now();
          // `marker` already carries this stream's own token.
          const found = textOf(record).includes(marker);
          pollCostMs += performance.now() - readStarted;
          if (found || performance.now() - started > timeoutMs) {
            resolve({
              found,
              bytes: arrived,
              overheadBytes: arrived - expectedBytes,
              drawsBefore,
              drawsAtFound: drawCount(record.canvas),
              pollCostMs,
              elapsedMs: performance.now() - started,
            });
            return;
          }
        }
        if (performance.now() - started > timeoutMs) {
          resolve({
            found: false,
            bytes: arrived,
            overheadBytes: arrived - expectedBytes,
            drawsBefore,
            drawsAtFound: 0,
            pollCostMs,
            elapsedMs: performance.now() - started,
          });
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  },
  armInput(timeoutMs) {
    const record = visibleRecord();
    if (!record) return false;
    const baseline = contentHash(textOf(record));
    const started = performance.now();
    let pollCostMs = 0;
    let drawsAtGridChange: number | null = null;
    input = {
      armed: true,
      settled: false,
      keydownAtMs: null,
      gridChangedAtMs: null,
      gridToDrawMs: null,
      pollCostMs: 0,
      error: null,
    };
    const onKey = () => {
      if (input.keydownAtMs === null) input.keydownAtMs = performance.now();
    };
    window.addEventListener("keydown", onKey, { capture: true, once: true });
    const finish = (error: string | null) => {
      input = { ...input, settled: true, pollCostMs, error };
      window.removeEventListener("keydown", onKey, { capture: true });
    };
    const poll = () => {
      if (input.settled) return;
      if (input.keydownAtMs !== null && input.gridChangedAtMs === null) {
        const readStarted = performance.now();
        const changed = contentHash(textOf(record)) !== baseline;
        pollCostMs += performance.now() - readStarted;
        if (changed) {
          input = { ...input, gridChangedAtMs: performance.now() };
          drawsAtGridChange = drawCount(record.canvas);
        }
      } else if (drawsAtGridChange !== null && input.gridToDrawMs === null) {
        if (drawCount(record.canvas) > drawsAtGridChange) {
          input = { ...input, gridToDrawMs: performance.now() };
          finish(null);
          return;
        }
        if (performance.now() - started > timeoutMs) {
          finish(null);
          return;
        }
      }
      if (performance.now() - started > timeoutMs) {
        finish(
          input.keydownAtMs === null
            ? "no-keydown"
            : input.gridChangedAtMs === null
              ? "no-grid-change"
              : null,
        );
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return true;
  },
  inputResult() {
    return { ...input };
  },
};

function readWebglRenderer(): string | null {
  for (const record of recorded) {
    const context = record.canvas.getContext("webgl2");
    if (!context) continue;
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    if (!debug) continue;
    const value: unknown = context.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

// Recorded session identities let the fixture address an exact tab through the
// production input channel instead of guessing which pane has focus.
export function recordSession(sessionId: string): void {
  sessions.push(sessionId);
  if (!outputBytes.has(sessionId)) outputBytes.set(sessionId, 0);
}

// `end` is the application's cumulative byte offset for the session, so several
// bridge subscribers observing the same chunk cannot double count.
export function recordOutput(sessionId: string, end: number): void {
  outputBytes.set(sessionId, Math.max(outputBytes.get(sessionId) ?? 0, end));
}

export function installPerformanceBenchmark(): void {
  Object.assign(window, { performanceBenchmark: benchmark });
  // The configuration the application itself applied, not the file we wrote.
  void window.omxterm.terminal.configuration().then((value) => {
    configuration = {
      fontSize: value.fontSize,
      fontLineHeight: value.fontLineHeight,
      fontLigatures: value.fontLigatures,
      fontFamily: value.fontFamily ?? null,
      scrollbackLines: value.scrollbackLines,
      terminalPadding: value.terminalPadding,
    };
  });
}
