import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

// Synthetic public cases only. No PTY, user configuration, or diagnostic API ships.
declare global {
  var emojiExperiment: {
    fonts(): Promise<TerminalFontData>;
    report(value: unknown): void;
    phase(name: string): Promise<void>;
  };
  var emojiProbe: Record<string, number>;
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 250));
const samples = ["😀", "👩‍💻", "👨‍👩‍👧‍👦", "👍🏽", "🇧🇷", "❤️", "漢字", "☃∑→"];
async function run(): Promise<void> {
  const container = document.querySelector<HTMLElement>("#terminal-tabs")!;
  let handlers: TerminalSessionHandlers | undefined;
  let reply = "";
  const fonts = terminalFontInputs(await globalThis.emojiExperiment.fonts());
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(value) {
        handlers = value;
      },
      write(value) {
        reply += value;
      },
      resize() {},
      close() {},
    },
    {
      appearance: {
        fontSize: 16,
        ...(document.body.dataset.configured === "true"
          ? {
              systemFont: {
                family: "JetBrainsMono Nerd Font Mono",
                available: true,
              },
            }
          : {}),
      },
      acquireFontInputs: async () => ({ fonts, release() {} }),
    },
  );
  handlers!.onOutput("\u001b[?25lASCII startup");
  await wait();
  await globalThis.emojiExperiment.phase("startup");
  const results = [];
  for (const size of [16, 8, 32, 72]) {
    surface.applyConfiguration({
      appearance: { fontSize: size, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 8, bottom: 8, left: 8 },
      theme: DEFAULT_TERMINAL_THEME,
      scrollbackLines: 10000,
      optionKeyMode: "none",
    });
    reply = "";
    handlers!.onOutput(
      "\u001b[2J\u001b[H\u001b[?25l" +
        samples.map((s) => `A${s}B`).join("\r\n") +
        "\r\n\u001b[1mBold A😀B\u001b[22m",
    );
    await wait();
    handlers!.onOutput("\u001b[16t\u001b[6n");
    await wait();
    results.push({ size, reply });
    await globalThis.emojiExperiment.phase(`emoji-${size}`);
  }
  surface.zoom("in");
  surface.zoom("out");
  await wait();
  await globalThis.emojiExperiment.phase("zoom-restored");
  globalThis.emojiExperiment.report({
    results,
    probe: globalThis.emojiProbe,
    fontBytes: fonts.map((font) => font.data.byteLength),
    dpr: devicePixelRatio,
  });
  surface.dispose();
}
void run().catch((error: unknown) =>
  globalThis.emojiExperiment.report({
    error: String(error),
    cause: String(error instanceof Error ? error.cause : ""),
  }),
);
