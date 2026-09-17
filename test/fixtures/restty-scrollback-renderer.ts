import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

interface ScrollMetrics {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly sameCanvas: boolean;
}

interface ScrollbackFixture {
  readonly ready: true;
  metrics(): ScrollMetrics;
  reduceHistory(): Promise<ScrollMetrics>;
  disableHistory(): Promise<ScrollMetrics>;
  enableHistory(): Promise<ScrollMetrics>;
  readonly surface: TerminalSurface;
}

declare global {
  var __omxtermResttyScrollback: ScrollbackFixture | undefined;
}

const root = document.querySelector<HTMLElement>("#terminal-tabs");
if (!root) throw new Error("Restty scrollback fixture root is missing");
const container = document.createElement("main");
container.className = "terminal-surface";
root.append(container);
let handlers: TerminalSessionHandlers | undefined;
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
const configuration = (scrollbackLines: number) => ({
  appearance: { fontSize: 16, lineHeight: 1 },
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
      write() {},
      resize() {},
      close() {},
    },
    {
      appearance: { fontSize: 16, lineHeight: 1 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      scrollbackLines: 3_000,
      theme: DEFAULT_TERMINAL_THEME,
    },
  );
  const canvas = initialCanvas();
  output(0, 5_000);
  await waitForRender();

  globalThis.__omxtermResttyScrollback = {
    ready: true,
    surface,
    metrics: () => metrics(canvas),
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
