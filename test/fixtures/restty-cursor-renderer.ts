import "../../src/renderer/terminal-window.css";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

declare global {
  var cursorFonts: { load(): Promise<TerminalFontData> };
  var cursorFixture: ReturnType<typeof createFixture>;
}
const root = document.querySelector<HTMLElement>("#terminal-tabs")!;
const frames = async () => {
  for (let i = 0; i < 3; i++)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
};
function createFixture() {
  let surface: TerminalSurface | undefined;
  let handlers: TerminalSessionHandlers | undefined;
  let container: HTMLElement;
  let cellWidth = 0;
  let cellHeight = 0;
  let starts = 0;
  let closes = 0;
  let originalCanvas: HTMLCanvasElement | null;
  let configured = false;
  const paddingValue = (value: number) => ({
    top: value,
    right: value,
    bottom: value,
    left: value,
  });
  const theme = {
    ...DEFAULT_TERMINAL_THEME,
    colors: {
      ...DEFAULT_TERMINAL_THEME.colors,
      background: "#101014",
      cursor: "#ffffff",
    },
  };
  return {
    async mount(useConfigured: boolean, padding: number) {
      surface?.dispose();
      configured = useConfigured;
      container = document.createElement("main");
      container.className = "terminal-surface";
      root.replaceChildren(container);
      starts = 0;
      closes = 0;
      const data = configured ? await globalThis.cursorFonts.load() : undefined;
      surface = await mountResttyTerminalSurface(
        container,
        {
          async start(next) {
            handlers = next;
            starts++;
          },
          write(value) {
            const match = /\u001b\[6;(\d+);(\d+)t/u.exec(value);
            if (match) {
              cellHeight = Number(match[1]);
              cellWidth = Number(match[2]);
            }
          },
          resize() {},
          close() {
            closes++;
          },
        },
        {
          appearance: {
            fontSize: 16,
            lineHeight: 1,
            ...(data?.configured
              ? {
                  systemFont: {
                    family: data.configured.family,
                    available: true,
                  },
                }
              : {}),
          },
          ...(data
            ? {
                acquireFontInputs: async () => ({
                  fonts: terminalFontInputs(data),
                  release() {},
                }),
              }
            : {}),
          padding: paddingValue(padding),
          theme,
        },
      );
      originalCanvas = container.querySelector("canvas");
      handlers!.onOutput("\u001b[?25l\u001b[2J\u001b[H");
      await frames();
    },
    async phase(lifecycle: string, padding: number) {
      if (lifecycle === "zoom")
        for (let i = 0; i < 16; i++) surface!.zoom("in");
      if (lifecycle === "refit") {
        await frames();
        surface!.focus();
      }
      if (lifecycle === "reload") {
        surface!.applyConfiguration({
          appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
          padding: paddingValue(padding),
          scrollbackLines: 10000,
          optionKeyMode: "none",
          theme,
        });
        surface!.zoom("reset");
      }
      await frames();
      handlers!.onOutput("\u001b[16t");
      return {
        cellWidth,
        cellHeight,
        dpr: devicePixelRatio,
        configured,
        padding: Number.parseFloat(getComputedStyle(container).paddingLeft),
        starts,
        closes,
        sameCanvas: originalCanvas === container.querySelector("canvas"),
        canvas: (() => {
          const r = container.querySelector("canvas")!.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })(),
      };
    },
    async cursor(style: number, col: number, visible: boolean) {
      handlers!.onOutput(
        `\u001b[1;${col + 1}H\u001b[${style} q\u001b[?25${visible ? "h" : "l"}`,
      );
      surface!.focus();
      await frames();
    },
    async blur() {
      document.querySelector<HTMLTextAreaElement>("textarea")!.blur();
      // showInactive windows do not deliver native focus loss. Replay the
      // canvas event after removing DOM focus; pixels still use real WebGL2.
      container.querySelector("canvas")!.dispatchEvent(new FocusEvent("blur"));
      await frames();
    },
    async focus() {
      surface!.focus();
      await frames();
    },
    dispose() {
      surface!.dispose();
      return { starts, closes };
    },
  };
}
globalThis.cursorFixture = createFixture();
