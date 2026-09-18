import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

interface FixtureState {
  readonly state: "ready";
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly copiedText: string;
  readonly cursorReports: readonly string[];
  readonly starts: number;
  readonly closes: number;
  readonly canvasIdentity: number;
}

declare global {
  var __omxtermLigaturesState: FixtureState | undefined;
  var __omxtermSetLigatures: (enabled: boolean) => Promise<void>;
  var __omxtermMountLigatures: (enabled: boolean) => Promise<void>;
}

const queriedRoot = document.querySelector<HTMLElement>("#terminal-tabs");
if (!queriedRoot) throw new Error("Ligature fixture container is missing");
const root: HTMLElement = queriedRoot;

let surface: TerminalSurface | undefined;
let handlers: TerminalSessionHandlers | undefined;
let starts = 0;
let closes = 0;
let canvasIdentity = 0;
let copiedText = "";
let cellWidth = 0;
let cellHeight = 0;
const cursorReports: string[] = [];

const waitForPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

const configuration = (ligatures: boolean) => ({
  appearance: { fontSize: 32, lineHeight: 1, ligatures },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  scrollbackLines: 10_000,
  optionKeyMode: "none" as const,
  theme: DEFAULT_TERMINAL_THEME,
});

async function renderEvidence(): Promise<void> {
  copiedText = "";
  cursorReports.length = 0;
  handlers?.onOutput(
    "\u001b[2J\u001b[H\u001b[?25l" +
      "=>" +
      "\u001b[2;1H\u001b[1m=>\u001b[22m" +
      "\u001b[3;1H=" +
      "\u001b[4;2H>" +
      "\u001b[5;1H\u001b[1m=\u001b[22m" +
      "\u001b[6;2H\u001b[1m>\u001b[22m" +
      "\u001b[7;1H界é🙂 \ue8f0" +
      "\u001b[8;1Hsource => text" +
      "\u001b[1;3H\u001b[6n\u001b[16t",
  );
  await waitForPaint();
  await new Promise((resolve) => setTimeout(resolve, 100));
  surface?.selectAll();
  await surface?.copy();
  await waitForPaint();
  globalThis.__omxtermLigaturesState = {
    state: "ready",
    cellWidth,
    cellHeight,
    copiedText,
    cursorReports: [...cursorReports],
    starts,
    closes,
    canvasIdentity,
  };
}

async function mount(ligatures: boolean): Promise<void> {
  surface?.dispose();
  const container = document.createElement("main");
  container.className = "terminal-surface";
  root.replaceChildren(container);
  handlers = undefined;
  cellWidth = 0;
  cellHeight = 0;
  surface = await mountResttyTerminalSurface(
    container,
    {
      async start(nextHandlers) {
        starts += 1;
        handlers = nextHandlers;
      },
      write(data) {
        const cell = /\u001b\[6;(\d+);(\d+)t/u.exec(data);
        if (cell) {
          cellHeight = Number(cell[1]);
          cellWidth = Number(cell[2]);
        }
        if (/\u001b\[1;3R/u.test(data)) cursorReports.push(data);
      },
      resize() {},
      close() {
        closes += 1;
      },
    },
    {
      ...configuration(ligatures),
      clipboard: {
        async writeText(text) {
          copiedText = text;
        },
        async readText() {
          return "";
        },
        async confirmPaste() {
          return false;
        },
        requestContextMenu() {},
      },
    },
  );
  canvasIdentity += 1;
  await renderEvidence();
}

globalThis.__omxtermSetLigatures = async (enabled) => {
  globalThis.__omxtermLigaturesState = undefined;
  surface?.applyConfiguration(configuration(enabled));
  await renderEvidence();
};
globalThis.__omxtermMountLigatures = async (enabled) => {
  globalThis.__omxtermLigaturesState = undefined;
  await mount(enabled);
};

void mount(true).catch((error: unknown) => {
  document.body.dataset.fixtureError = String(error);
});
