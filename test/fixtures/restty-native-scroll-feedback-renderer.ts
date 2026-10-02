import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { waitForLiveViewport } from "./restty-scrollback-viewport";
import type { ScrollFeedbackCore } from "./restty-native-scroll-feedback-observer";
import { waitForScrollFeedbackStartup } from "./restty-scroll-feedback-startup";

const root = document.querySelector<HTMLElement>("#terminal-tabs")!;
const container = document.createElement("main");
container.className = "terminal-surface";
root.append(container);
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const rendered = async () => {
  await frame();
  await frame();
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
};
let handlers: TerminalSessionHandlers;
const writes: string[] = [];

async function mount() {
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(next) {
        handlers = next;
      },
      write(text) {
        writes.push(text);
      },
      resize() {},
      close() {},
    },
    {
      appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      scrollbackLines: 3_000,
      theme: DEFAULT_TERMINAL_THEME,
    },
  );
  const canvas = container.querySelector("canvas")!;
  const host = container.querySelector<HTMLElement>(
    ".restty-native-scroll-host",
  )!;
  const core = (): ScrollFeedbackCore =>
    globalThis.__scrollFeedbackCore.get(canvas)!();
  const metrics = () => ({
    scrollHeight: host.scrollHeight,
    clientHeight: host.clientHeight,
    scrollTop: host.scrollTop,
    width: host.clientWidth,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    dpr: devicePixelRatio,
    sameCanvas: canvas === container.querySelector("canvas"),
    core: core(),
  });
  handlers.onOutput(
    Array.from(
      { length: 5_000 },
      (_, i) => `scrollback-${i} selectable text\r\n`,
    ).join(""),
  );
  await rendered();
  const live = () => waitForLiveViewport(metrics, frame);
  return {
    ready: true,
    metrics,
    dispose: () => surface.dispose(),
    async run() {
      const startup = metrics();
      const baseline = await waitForScrollFeedbackStartup(metrics, frame);
      const dpr = devicePixelRatio;
      // One backing pixel above/below a real cell-row boundary, inside the
      // available host. Native tilers need not honor requested window sizes.
      const boundary =
        Math.floor((host.clientHeight * dpr - 1) / core().cellH) * core().cellH;
      const high = (boundary + 1) / dpr;
      const low = (boundary - core().cellH / 2 + 1) / dpr;
      const original = container.style.maxHeight;
      const transitions: ReturnType<typeof metrics>[] = [];
      const transitionFailure = (
        message: string,
        index: number,
        measurement: ReturnType<typeof metrics>,
      ) =>
        new Error(
          `${message}: ${JSON.stringify({ baseline, index, measurement, dpr, high, low })}`,
        );
      try {
        for (let index = 0; index < 12; index++) {
          container.style.maxHeight = `${index % 2 ? low : high}px`;
          // The original exact bottom predicate and five-second deadline are
          // unchanged. Do not wait for a guard/event to drain before resizing.
          const measurement = await live().catch((error: unknown) => {
            throw transitionFailure(
              `Height transition did not settle (${String(error)})`,
              index,
              metrics(),
            );
          });
          if (
            measurement.core.offset !==
            measurement.core.total - measurement.core.len
          )
            throw transitionFailure(
              "Height transition left the actual core away from live",
              index,
              measurement,
            );
          if (
            measurement.width !== baseline.width ||
            measurement.canvasWidth !== baseline.canvasWidth ||
            !measurement.sameCanvas
          )
            throw transitionFailure(
              "Height transition changed width or canvas identity",
              index,
              measurement,
            );
          transitions.push(measurement);
        }
        const lengths = transitions.map(({ core: state }) => state.len);
        if (
          !lengths.every((len, index) => len === lengths[index % 2]) ||
          lengths[0]! - lengths[1]! !== 1
        )
          throw new Error(
            `Height constraints did not cross exactly one actual core row: ${JSON.stringify({ baseline, lengths, transitions, dpr, high, low })}`,
          );
      } finally {
        container.style.maxHeight = original;
      }
      await rendered();
      const initial = await live();
      const rowStep =
        (initial.scrollHeight - initial.clientHeight) /
        (initial.core.total - initial.core.len);
      // A DOM scroll and its browser-queued event, not dispatchEvent or a core
      // mutation. This control does not claim physical wheel input.
      host.scrollTop -= rowStep;
      await rendered();
      const scrolled = metrics();
      if (scrolled.core.offset !== initial.core.offset - 1)
        throw new Error("Intentional one-row native DOM scroll was lost");
      handlers.onOutput("retained ordinary output\r\n");
      surface.focus();
      await rendered();
      const afterOutputAndFocus = metrics();
      if (
        afterOutputAndFocus.core.offset >=
          afterOutputAndFocus.core.total - afterOutputAndFocus.core.len ||
        afterOutputAndFocus.scrollTop >=
          afterOutputAndFocus.scrollHeight - afterOutputAndFocus.clientHeight
      )
        throw new Error(
          "Output/focus incorrectly returned the viewport to live",
        );
      await surface.inject("viewport-resume");
      const resumed = await waitForLiveViewport(metrics, frame, () =>
        writes.includes("viewport-resume"),
      );
      if (resumed.core.offset !== resumed.core.total - resumed.core.len)
        throw new Error(
          "Accepted input did not restore the core live viewport",
        );
      const events = globalThis.__scrollFeedbackEvents;
      if (
        events.length >= 128 ||
        !events.some((event) => event.kind === "spacer-clamp") ||
        !events.some((event) => event.kind === "native-scroll" && event.trusted)
      )
        throw new Error(
          "Natural spacer-clamp/queued native scroll evidence is missing or truncated",
        );
      return {
        dpr,
        startup,
        baseline,
        cellHeight: core().cellH,
        availableHeight: baseline.clientHeight,
        high,
        low,
        transitions,
        scrolled,
        afterOutputAndFocus,
        resumed,
        events,
      };
    },
  };
}

declare global {
  var __nativeScrollFeedback: Awaited<ReturnType<typeof mount>> | undefined;
}
void mount().then((fixture) => {
  globalThis.__nativeScrollFeedback = fixture;
});
