import { scrollbackInputEvidence } from "./scrollback-input-evidence";
import { waitForLiveViewport } from "./restty-scrollback-viewport";
import {
  observeScrollbackNativeInput,
  type NativeInputObservation,
} from "./scrollback-native-input";
import { depthRenderingFixture } from "./restty-depth-renderer";
import { hiddenRenderingFixture } from "./restty-hidden-renderer";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

declare const __OMXTERM_SCROLLBACK_HOLD_READY__: boolean;

interface ScrollMetrics {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly sameCanvas: boolean;
}

interface ScrollbackFixture {
  readonly ready: true;
  prepareNativeInput(): void;
  nativeInput(): NativeInputObservation;
  waitForNativeDrag: ReturnType<
    typeof observeScrollbackNativeInput
  >["waitForDrag"];
  hiddenRenderingFixture: typeof hiddenRenderingFixture;
  depthRenderingFixture: typeof depthRenderingFixture;
  metrics(): ScrollMetrics;
  inputViewport(text: string): Promise<ScrollMetrics>;
  reduceHistory(): Promise<ScrollMetrics>;
  disableHistory(): Promise<ScrollMetrics>;
  enableHistory(): Promise<ScrollMetrics>;
  resizeAtBottom(): Promise<{
    before: ScrollMetrics;
    reduced: ScrollMetrics;
    restored: ScrollMetrics;
  }>;
  readonly surface: TerminalSurface;
  expectInput(stimulus: "character" | "injection"): void;
  inputEvidence(): ReturnType<
    ReturnType<typeof scrollbackInputEvidence>["snapshot"]
  >;
  scrollToTop(): Promise<ScrollMetrics>;
  outputWhileScrolled(): Promise<ScrollMetrics>;
  hiddenGeometry(): Promise<{
    sizes: { cols: number; rows: number }[];
    baseline: { cols: number; rows: number };
    hiddenSizes: { cols: number; rows: number }[];
    hiddenCanvasUnchanged: boolean;
    sameCanvas: boolean;
  }>;
}

declare global {
  var __omxtermResttyScrollback: ScrollbackFixture | undefined;
  var __scrollbackIsDragging: (() => boolean) | undefined;
  var __scrollbackStartupHeld: boolean | undefined;
}

const root = document.querySelector<HTMLElement>("#terminal-tabs");
if (!root) throw new Error("Restty scrollback fixture root is missing");
const container = document.createElement("main");
container.className = "terminal-surface";
root.append(container);
let handlers: TerminalSessionHandlers | undefined;
const inputEvidence = scrollbackInputEvidence();
const sizes: { cols: number; rows: number }[] = [];
const initialCanvas = () => container.querySelector("canvas");
const waitForRender = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.setTimeout(resolve, 50)),
    ),
  );
const output = (start: number, count: number) => {
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1)
    lines[index] =
      `scrollback-${String(start + index).padStart(5, "0")} selectable text\r\n`;
  handlers?.onOutput(lines.join(""));
};
const metrics = (canvas: HTMLCanvasElement | null): ScrollMetrics => {
  const host = container.querySelector<HTMLElement>(
    ".restty-native-scroll-host",
  );
  if (!host) throw new Error("Restty native scroll host is missing");
  return {
    scrollHeight: host.scrollHeight,
    clientHeight: host.clientHeight,
    scrollTop: host.scrollTop,
    sameCanvas: canvas === initialCanvas(),
  };
};
const liveViewport = (
  canvas: HTMLCanvasElement | null,
  hasAcceptedInput: () => boolean = () => true,
) =>
  waitForLiveViewport(
    () => metrics(canvas),
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    hasAcceptedInput,
  );
const configuration = (scrollbackLines: number) => ({
  appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  scrollbackLines,
  optionKeyMode: "none" as const,
  theme: DEFAULT_TERMINAL_THEME,
});

async function run() {
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(nextHandlers) {
        handlers = nextHandlers;
      },
      write(text) {
        inputEvidence.write(text);
      },
      resize(size) {
        sizes.push(size);
      },
      close() {},
    },
    {
      appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      scrollbackLines: 3_000,
      theme: DEFAULT_TERMINAL_THEME,
    },
  );
  const canvas = initialCanvas();
  const nativeInput = observeScrollbackNativeInput(
    canvas!,
    container.querySelector<HTMLTextAreaElement>("textarea")!,
    () => globalThis.__scrollbackIsDragging?.() === true,
    () => inputEvidence.accepted("character"),
    inputEvidence,
  );
  output(0, 5_000);
  await waitForRender();
  if (__OMXTERM_SCROLLBACK_HOLD_READY__) {
    globalThis.__scrollbackStartupHeld = true;
    // Hold the actual Surface-ready continuation; no replacement fixture or
    // fabricated process/renderer readiness substitutes for this native path.
    await new Promise<void>(() => {});
  }

  globalThis.__omxtermResttyScrollback = {
    ready: true,
    prepareNativeInput() {
      nativeInput.reset();
      surface.focus();
    },
    nativeInput: nativeInput.snapshot,
    waitForNativeDrag: nativeInput.waitForDrag,
    hiddenRenderingFixture,
    depthRenderingFixture,
    surface,
    expectInput: inputEvidence.expect,
    inputEvidence: inputEvidence.snapshot,
    async scrollToTop() {
      const host = container.querySelector<HTMLElement>(
        ".restty-native-scroll-host",
      )!;
      host.scrollTop = 0;
      host.dispatchEvent(new Event("scroll"));
      await waitForRender();
      return metrics(canvas);
    },
    async outputWhileScrolled() {
      handlers?.onOutput("ordinary output\r\n\u001b[6n");
      surface.focus();
      await waitForRender();
      return metrics(canvas);
    },
    async hiddenGeometry() {
      const baseline = sizes.at(-1)!;
      const width = canvas!.width;
      const height = canvas!.height;
      sizes.length = 0;
      container.hidden = true;
      container.style.maxWidth = "500px";
      await waitForRender();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const hiddenSizes = [...sizes];
      const hiddenCanvasUnchanged =
        canvas!.width === width && canvas!.height === height;
      container.hidden = false;
      surface.focus();
      await waitForRender();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const result = {
        baseline,
        hiddenSizes,
        hiddenCanvasUnchanged,
        sizes: [...sizes],
        sameCanvas: canvas === initialCanvas(),
      };
      container.style.maxWidth = "";
      await waitForRender();
      return result;
    },
    metrics: () => metrics(canvas),
    inputViewport: (text) =>
      liveViewport(canvas, () =>
        inputEvidence.accepted(text === "x" ? "character" : "injection"),
      ),
    async resizeAtBottom() {
      const before = await liveViewport(canvas);
      // A reload notice can shrink the host while font metrics also change.
      // Neither operation is user scroll input; the live viewport must stay live.
      container.style.maxHeight = `${before.clientHeight - 60}px`;
      surface.applyConfiguration({
        ...configuration(3_000),
        appearance: { fontSize: 18, lineHeight: 1, ligatures: true },
      });
      await waitForRender();
      const reduced = await liveViewport(canvas);
      container.style.maxHeight = "";
      surface.applyConfiguration(configuration(3_000));
      await waitForRender();
      return { before, reduced, restored: await liveViewport(canvas) };
    },
    async reduceHistory() {
      surface.applyConfiguration(configuration(1_200));
      await waitForRender();
      return metrics(canvas);
    },
    async disableHistory() {
      surface.applyConfiguration(configuration(0));
      output(10_000, 500);
      window.dispatchEvent(new Event("resize"));
      await waitForRender();
      return metrics(canvas);
    },
    async enableHistory() {
      surface.applyConfiguration(configuration(3_000));
      output(20_000, 2_000);
      await waitForRender();
      return metrics(canvas);
    },
  };
}

void run();
