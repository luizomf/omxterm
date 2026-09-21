import { createTerminalFontGenerationOwner } from "../../src/renderer/terminal-font-generations";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

interface StoreStats {
  sources: number;
  parsed: number;
  leases: number;
  bytes: number;
}
declare global {
  var fontStyleProbe: {
    fonts(): Promise<TerminalFontData>;
    phase(
      name: string,
      capture: boolean,
      store: StoreStats,
      cell?: { right: number; bottom: number },
    ): Promise<void>;
    report(result: unknown): void;
  };
  var fontStyleStoreStats: () => StoreStats;
  var fontStylePicks: Record<string, number>;
}

const waitForPaint = () => new Promise((resolve) => setTimeout(resolve, 180));
async function run() {
  const family = document.body.dataset.family!;
  let requests = 0;
  const owner = createTerminalFontGenerationOwner(async () => {
    requests++;
    return globalThis.fontStyleProbe.fonts();
  }, family);
  const surfaces: { dispose(): void; output(text: string): void }[] = [];
  const replies: string[] = [];
  const create = async () => {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;inset:0";
    document.body.append(container);
    let handlers: TerminalSessionHandlers | undefined;
    const surface = await mountResttyTerminalSurface(
      container,
      {
        async start(value) {
          handlers = value;
        },
        write(value) {
          replies.push(value);
        },
        resize() {},
        close() {},
      },
      {
        appearance: { fontSize: 32, systemFont: { family, available: true } },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        acquireFontInputs: (selectedFamily, signal) =>
          owner.acquire(selectedFamily, signal),
      },
    );
    const first = surfaces.length === 0;
    surfaces.push({
      dispose() {
        surface.dispose();
        container.remove();
      },
      output: (text) => handlers!.onOutput(text),
    });
    handlers!.onOutput("\x1b[?25lASCII startup");
    await waitForPaint();
    if (!first) container.style.visibility = "hidden";
  };
  const phase = (name: string, capture = false) => {
    const cell = /\[6;(\d+);(\d+)t/u.exec(replies.at(-1) ?? "");
    return globalThis.fontStyleProbe.phase(
      name,
      capture,
      globalThis.fontStyleStoreStats(),
      // CSI rounds physical cell metrics: allow one pixel at its outer edge.
      cell
        ? { right: Number(cell[2]) + 1, bottom: Number(cell[1]) + 1 }
        : undefined,
    );
  };
  try {
    await create();
    await phase("one-startup");
    surfaces[0]!.output("\x1b[0m\x1b[2J\x1b[H\x1b[?25l");
    await waitForPaint();
    await phase("blank", true);
    for (const [name, code] of [
      ["regular", "0"],
      ["bold", "1"],
      ["italic", "3"],
      ["boldItalic", "1;3"],
      ["wideItalic", "3"],
      ["wideBoldItalic", "1;3"],
    ]) {
      surfaces[0]!.output(
        `\x1b[0m\x1b[2J\x1b[H\x1b[?25l\x1b[${code}m${name!.startsWith("wide") ? "W" : "Legal demais. afls"}\x1b[0m\x1b[16t`,
      );
      await waitForPaint();
      await phase(name!, true);
    }
    await create();
    await create();
    await phase("three-live");
    while (surfaces.length > 1) surfaces.pop()!.dispose();
    await waitForPaint();
    await phase("back-to-one");
    surfaces.pop()!.dispose();
    owner.dispose();
    await waitForPaint();
    await phase("disposed");
    globalThis.fontStyleProbe.report({
      requests,
      picks: globalThis.fontStylePicks,
      dpr: devicePixelRatio,
      replies,
    });
  } finally {
    surfaces.forEach((surface) => surface.dispose());
    owner.dispose();
  }
}
void run().catch((error: unknown) =>
  globalThis.fontStyleProbe.report({ error: String(error) }),
);
