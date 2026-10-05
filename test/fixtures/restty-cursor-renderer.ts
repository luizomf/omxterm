import "../../src/renderer/terminal-window.css";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

declare global {
  var cursorFonts: {
    load(): Promise<TerminalFontData>;
    interference(kind: string, moving: boolean): void;
  };
  var cursorFixture: ReturnType<typeof createFixture>;
  var cursorProbe: { painted(): void; blinkNow(): number; refresh(): void };
}
const root = document.querySelector<HTMLElement>("#terminal-tabs")!;
const nativeFrame = window.requestAnimationFrame.bind(window);
let paints = 0;
let blinkTime: number | undefined =
  new URLSearchParams(location.search).get("cursorControl") ===
  "held-blink-clock"
    ? 600
    : undefined;
globalThis.cursorProbe = {
  painted() {
    paints++;
  },
  blinkNow() {
    return blinkTime ?? performance.now();
  },
  refresh() {
    throw new Error("Cursor render refresh unavailable");
  },
};
// Capture operations still cross compositor frame boundaries. A synchronous
// WebGL tick proves refit submission, not native screenshot presentation.
const frames = async () => {
  for (let i = 0; i < 3; i++)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        if (
          new URLSearchParams(location.search).get("cursorControl") ===
          "held-execute"
        )
          console.info("__OMXTERM_CURSOR_CONTROL__held-execute");
        else resolve();
      }),
    );
};
// A trusted moving pointer or other real input can change focus/selection while
// pixels are under test. Retain only the fixed event kind, never input contents.
let lastPointer: { x: number; y: number } | undefined;
for (const kind of ["pointermove", "pointerdown", "keydown", "wheel"] as const)
  document.addEventListener(
    kind,
    (event) => {
      if (!event.isTrusted) return;
      // Layout-induced stationary hover is not evidence of physical movement.
      let moving = false;
      if (event instanceof PointerEvent && kind === "pointermove") {
        // Electron-injected trusted moves can have zero movementX/Y even at
        // distinct positions. Keep coordinates local; publish only this boolean.
        moving =
          event.movementX !== 0 ||
          event.movementY !== 0 ||
          Boolean(
            lastPointer &&
            (lastPointer.x !== event.clientX ||
              lastPointer.y !== event.clientY),
          );
        lastPointer = { x: event.clientX, y: event.clientY };
      }
      globalThis.cursorFonts.interference(kind, moving);
    },
    { capture: true },
  );

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
      blinkTime =
        new URLSearchParams(location.search).get("cursorControl") ===
        "held-blink-clock"
          ? 600
          : undefined;
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
        if (
          new URLSearchParams(location.search).get("cursorControl") ===
          "held-refit-frames"
        ) {
          window.requestAnimationFrame = () => 0;
          console.info("__OMXTERM_CURSOR_CONTROL__held-refit-frames");
        }
        // Resize content inside the actual native layout. A tiling compositor
        // need not honor BrowserWindow size requests; pixels still use WebGL2.
        container.style.width = `${Math.floor(container.getBoundingClientRect().width * 0.75)}px`;
        container.style.flex = "0 0 auto";
        const before = paints;
        surface!.focus();
        if (paints <= before) throw new Error("Cursor refit did not render");
      }
      if (lifecycle === "reload") {
        container.style.removeProperty("width");
        container.style.removeProperty("flex");
        surface!.applyConfiguration({
          appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
          padding: paddingValue(padding),
          scrollbackLines: 10000,
          optionKeyMode: "none",
          theme,
        });
        surface!.zoom("reset");
      }
      if (lifecycle !== "refit") await frames();
      else window.requestAnimationFrame = nativeFrame;
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
        available: (() => {
          const r = container.getBoundingClientRect();
          const style = getComputedStyle(container);
          const left = Number.parseFloat(style.paddingLeft);
          const right = Number.parseFloat(style.paddingRight);
          const top = Number.parseFloat(style.paddingTop);
          const bottom = Number.parseFloat(style.paddingBottom);
          return {
            x: r.x + left,
            y: r.y + top,
            width: r.width - left - right,
            height: r.height - top - bottom,
          };
        })(),
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
    async blinkAt(time: number) {
      if (![0, 600, 1200].includes(time))
        throw new Error("Invalid cursor clock sample");
      blinkTime = time;
      const before = paints;
      globalThis.cursorProbe.refresh();
      if (paints <= before)
        throw new Error("Cursor blink sample did not render");
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
