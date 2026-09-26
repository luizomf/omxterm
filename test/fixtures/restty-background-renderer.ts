import "../../src/renderer/terminal-window.css";
import "../../src/renderer/window-chrome.css";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

const element = (id: string) => document.getElementById(id)!;
let configuration: TerminalRendererConfiguration = {
  fontSize: 24,
  fontLineHeight: 1,
  fontLigatures: true,
  terminalPadding: { top: 8, right: 8, bottom: 8, left: 8 },
  scrollbackLines: 100,
  optionKeyMode: "none",
  nativeTitleInset: 0,
  showTabBar: true,
  transparency: 0,
  terminalTheme: {
    ...DEFAULT_TERMINAL_THEME,
    colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "#123456" },
  },
  userFileErrors: [],
};
const sessions: Array<{
  handlers?: TerminalSessionHandlers;
  surface?: TerminalSurface;
  cellWidth: number;
  cellHeight: number;
}> = [];
let starts = 0;
let closes = 0;
let update!: (configuration: TerminalRendererConfiguration) => void;
let tabCommand!: (command: TerminalTabCommand) => void;
let snippetsToggle!: () => void;
let currentSession = 0;
const host = mountTerminalWindowPage(
  { tabStrip: element("tab-strip"), tabsContainer: element("terminal-tabs") },
  {
    configuration,
    createAdapter() {
      const index = sessions.length;
      const session = {
        cellWidth: 0,
        cellHeight: 0,
      } as (typeof sessions)[number];
      sessions.push(session);
      currentSession = index;
      return {
        sessionId: () => `background-${index}`,
        async start(handlers) {
          starts++;
          session.handlers = handlers;
        },
        resize() {},
        close() {
          closes++;
        },
        write(data) {
          const match = /\u001b\[6;(\d+);(\d+)t/u.exec(data);
          if (match) {
            session.cellHeight = Number(match[1]);
            session.cellWidth = Number(match[2]);
          }
        },
      };
    },
    async mount(container, adapter, options) {
      const session = sessions[currentSession]!;
      session.surface = await mountResttyTerminalSurface(
        container,
        adapter,
        options,
      );
      return session.surface;
    },
    subscribeToConfigurationUpdates(listener) {
      update = listener;
      return () => {};
    },
    subscribeToTabCommands(listener) {
      tabCommand = listener;
      return () => {};
    },
    snippets: {
      element: element("snippets-sidebar"),
      load: async () => ({
        snippets: [{ name: "Fixture", body: "no execution", execute: false }],
      }),
      subscribeToToggle(listener) {
        snippetsToggle = listener;
        return () => {};
      },
    },
  },
);
const frames = async () => {
  for (let i = 0; i < 3; i++)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
};

function paintFixture() {
  sessions[0]!.handlers!.onOutput(
    "\u001b[?25l\u001b[2J\u001b[HMMMM" +
      "\u001b[2;1H\u001b[48;2;18;52;86m    \u001b[0m" +
      "\u001b[3;1H\u001b[48;2;200;40;60m    \u001b[0m" +
      "\u001b[4;1H\u001b[7mMMMM \u001b[0m" +
      "\u001b[5;1H\u001b[32mMMMM\u001b[0m" +
      "\u001b[6;1H\u001b_Ga=T,f=32,s=1,v=1,c=2,r=1,i=1,C=1,q=2;/zNE/w==\u001b\\" +
      "\u001b[7;1H\u001b[2 q\u001b[?25h\u001b[16t",
  );
}

function pixels(sessionIndex = 0) {
  const session = sessions[sessionIndex]!;
  session.surface!.focus(); // Synchronous production refresh before readback.
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".terminal-surface:not([hidden]) canvas",
  )!;
  const gl = canvas.getContext("webgl2")!;
  const bytes = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(
    0,
    0,
    canvas.width,
    canvas.height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    bytes,
  );
  const at = (x: number, y: number) => [
    ...bytes.slice(
      ((canvas.height - 1 - y) * canvas.width + x) * 4,
      ((canvas.height - 1 - y) * canvas.width + x) * 4 + 4,
    ),
  ];
  const cell = (row: number, col: number) =>
    at(
      Math.floor(session.cellWidth * (col + 0.5)),
      Math.floor(session.cellHeight * (row + 0.5)),
    );
  const opaqueColors = (row: number) => {
    const colors: Record<string, number> = {};
    for (
      let y = row * session.cellHeight;
      y < (row + 1) * session.cellHeight;
      y++
    )
      for (let x = 0; x < session.cellWidth * 4; x++) {
        const rgba = at(x, y);
        if (rgba[3] === 255) {
          const key = rgba.slice(0, 3).join(",");
          colors[key] = (colors[key] ?? 0) + 1;
        }
      }
    return colors;
  };
  return {
    alpha: gl.getContextAttributes()!.alpha,
    implicit: cell(7, 6),
    equalRgb: cell(1, 1),
    explicit: cell(2, 1),
    inverseBackground: cell(3, 4),
    image: cell(5, 0),
    glyphs: opaqueColors(0),
    inverseInk: opaqueColors(3),
    ansi: opaqueColors(4),
    cursor: opaqueColors(6),
    error: gl.getError(),
  };
}

declare global {
  var backgroundFixture: ReturnType<typeof createFixture>;
}
function createFixture() {
  let originalCanvas: HTMLCanvasElement | null = null;
  return {
    ready: false,
    async phase(transparency: number, background = "#123456") {
      configuration = {
        ...configuration,
        transparency,
        terminalTheme: {
          ...configuration.terminalTheme,
          colors: { ...configuration.terminalTheme.colors, background },
        },
      };
      update(configuration);
      await frames();
      const result = pixels();
      return {
        ...result,
        starts,
        closes,
        sameCanvas: originalCanvas === document.querySelector("canvas"),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        rootBackground: getComputedStyle(document.documentElement)
          .backgroundColor,
        tabsBackground: getComputedStyle(element("terminal-tabs"))
          .backgroundColor,
        surfaceBackground: getComputedStyle(
          document.querySelector(".terminal-surface")!,
        ).backgroundColor,
        sidebarBackground: getComputedStyle(element("snippets-sidebar"))
          .backgroundColor,
      };
    },
    async selection() {
      sessions[0]!.surface!.selectAll();
      return pixels().glyphs;
    },
    async tabs() {
      configuration = { ...configuration, transparency: 1 };
      update(configuration);
      tabCommand({ action: "new" });
      for (let i = 0; !sessions[1]?.surface && i < 300; i++) await frames();
      if (!sessions[1]?.surface)
        throw new Error("Second Surface did not mount");
      sessions[1].handlers!.onOutput("\u001b[16t");
      const future = pixels(1);
      tabCommand({ action: "previous" });
      await frames();
      return {
        starts,
        closes,
        sameCanvas: originalCanvas === document.querySelector("canvas"),
        pixels: pixels(),
        future,
        selectedShadow: getComputedStyle(
          document.querySelector('#tab-strip [aria-selected="true"]')!,
        ).boxShadow,
      };
    },
    dispose() {
      host.dispose();
      return { starts, closes };
    },
    async initialize() {
      await host.ready;
      originalCanvas = document.querySelector("canvas");
      paintFixture();
      snippetsToggle();
      await frames();
      this.ready = true;
    },
  };
}
globalThis.backgroundFixture = createFixture();
void globalThis.backgroundFixture.initialize().catch((error: unknown) => {
  document.body.dataset.fixtureError = String(error);
});
