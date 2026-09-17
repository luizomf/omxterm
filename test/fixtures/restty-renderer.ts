import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

interface ResttyFixtureResult {
  readonly backend?: string;
  readonly error?: string;
  readonly fatal?: string;
  readonly font?: string;
  readonly ptyStarts: number;
  readonly clipboardReads?: number;
  readonly clipboardWrites?: number;
  readonly terminalReplies?: number;
  readonly resize?: { readonly cols: number; readonly rows: number };
}

declare global {
  var __omxtermResttyResult: ResttyFixtureResult | undefined;
}

const unavailable = new URLSearchParams(location.search).has("unavailable");
if (unavailable) {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    ...arguments_: unknown[]
  ) {
    if (contextId === "webgl2") return null;
    return Reflect.apply(original, this, [
      contextId,
      ...arguments_,
    ]) as ReturnType<typeof original>;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

const container = document.querySelector<HTMLElement>("#terminal");
if (!container) throw new Error("Restty fixture container is missing");
let handlers: TerminalSessionHandlers | undefined;
let ptyStarts = 0;
let resize: { cols: number; rows: number } | undefined;
let fatal: string | undefined;
let clipboardReads = 0;
let clipboardWrites = 0;
let terminalReplies = 0;
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    readText: async () => {
      clipboardReads += 1;
      return "private clipboard";
    },
    writeText: async () => {
      clipboardWrites += 1;
    },
  },
});

void mountResttyTerminalSurface(
  container,
  {
    async start(nextHandlers) {
      ptyStarts += 1;
      handlers = nextHandlers;
    },
    write() {
      terminalReplies += 1;
    },
    resize(size) {
      resize = size;
    },
    close() {},
  },
  {
    onFatalError(message) {
      fatal = message;
    },
  },
)
  .then(async () => {
    handlers?.onOutput(
      "OMXTerm Restty Olá\r\n\u001b]52;c;dW5zYWZl\u0007\u001b]52;c;?\u0007",
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
    globalThis.__omxtermResttyResult = {
      ...(container.dataset.resttyBackend
        ? { backend: container.dataset.resttyBackend }
        : {}),
      ...(container.dataset.resttyFont
        ? { font: container.dataset.resttyFont }
        : {}),
      ptyStarts,
      clipboardReads,
      clipboardWrites,
      terminalReplies,
      ...(resize ? { resize } : {}),
    };
  })
  .catch((error: unknown) => {
    globalThis.__omxtermResttyResult = {
      error: error instanceof Error ? error.message : String(error),
      ...(fatal ? { fatal } : {}),
      ptyStarts,
    };
  });
