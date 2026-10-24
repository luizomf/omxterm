import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { waitForLayout } from "./restty-appearance-frames";

// Actual Adapter output, live Surface configuration and WebGL cell readback.
// No production test methods or alternate escape parser are involved.
export async function verifyConfiguredPaletteResets(root: HTMLElement) {
  const container = document.createElement("main");
  container.className = "terminal-surface";
  root.replaceChildren(container);
  let handlers: TerminalSessionHandlers | undefined;
  let starts = 0;
  let closes = 0;
  const lifetime = () => ({ starts, closes });
  let cellWidth = 0;
  let cellHeight = 0;
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(next) {
        handlers = next;
        starts++;
      },
      write(data) {
        const match = /\u001b\[6;(\d+);(\d+)t/u.exec(data);
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
      appearance: { fontSize: 16, lineHeight: 1 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
    },
  );
  const canvas = container.querySelector("canvas")!;
  const observations: Array<{ phase: string; colors: number[][] }> = [];
  const output = (text: string) => handlers!.onOutput(text);
  async function observe(phase: string, expected: number[][]) {
    output(
      "\u001b[?25l\u001b[H\u001b[48;5;2m \u001b[48;5;4m \u001b[48;5;200m \u001b[0m\u001b[16t",
    );
    await waitForLayout();
    surface.focus(); // Existing synchronous production refresh before readback.
    if (!cellWidth || !cellHeight)
      throw new Error("Missing Surface cell metrics");
    const gl = canvas.getContext("webgl2")!;
    const colors = expected.map((_, col) => {
      const rgba = new Uint8Array(4);
      gl.readPixels(
        Math.floor((col + 0.5) * cellWidth),
        canvas.height - 1 - Math.floor(cellHeight / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rgba,
      );
      return [...rgba];
    });
    if (
      gl.getError() !== gl.NO_ERROR ||
      JSON.stringify(colors) !== JSON.stringify(expected)
    )
      throw new Error(
        `${phase}: palette cell pixels ${JSON.stringify(colors)}, expected ${JSON.stringify(expected)}`,
      );
    observations.push({ phase, colors });
  }
  const green = [0, 255, 191, 255];
  const blue = [128, 170, 255, 255];
  const extended = [255, 0, 215, 255];
  const override = [18, 52, 86, 255];
  try {
    await observe("initial", [green, blue, extended]);
    output("\u001bc\u001b]104\u0007");
    await observe("initial-full", [green, blue, extended]);
    output("\u001b]4;2;#123456;4;#123456;200;#123456\u0007");
    const theme = {
      ...DEFAULT_TERMINAL_THEME,
      colors: {
        ...DEFAULT_TERMINAL_THEME.colors,
        green: "#102030",
        blue: "#405060",
      },
    };
    surface.applyConfiguration({
      appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      theme,
    });
    const liveGreen = [16, 32, 48, 255];
    const liveBlue = [64, 80, 96, 255];
    await observe("live-replaces-supplied-only", [
      liveGreen,
      liveBlue,
      override,
    ]);
    output("\u001b]4;2;#123456;4;#123456\u001b\\");
    for (const chunk of "\u001b]104;2\u001b\\") output(chunk);
    await observe("split-indexed-ST", [liveGreen, override, override]);
    output("\u001b]104\u001b\\");
    await observe("live-full-ST", [liveGreen, liveBlue, extended]);
    if (
      starts !== 1 ||
      closes !== 0 ||
      canvas !== container.querySelector("canvas")
    )
      throw new Error("Palette reset replaced the Surface session or canvas");
  } finally {
    surface.dispose();
  }
  const disposed = lifetime();
  if (disposed.closes !== 1)
    throw new Error("Palette fixture did not release its Adapter");
  return { configuredPaletteReset: true, ...disposed, observations };
}
