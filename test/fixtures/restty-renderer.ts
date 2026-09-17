import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { OptionKeyMode } from "../../src/shared/user-configuration";

interface ResttyFixtureResult {
  readonly backend?: string;
  readonly error?: string;
  readonly fatal?: string;
  readonly font?: string;
  readonly ptyStarts: number;
  readonly clipboardReads?: number;
  readonly clipboardWrites?: number;
  readonly terminalReplies?: number;
  readonly optionInput?: readonly string[];
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
const terminalInput: string[] = [];
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
    write(data) {
      terminalInput.push(data);
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
  .then(async (surface) => {
    const input = container.querySelector("textarea");
    if (!input) throw new Error("Restty IME input is missing");
    const dispatchKey = (
      type: "keydown" | "keyup",
      key: string,
      code: string,
      altKey: boolean,
    ) =>
      input.dispatchEvent(
        new KeyboardEvent(type, { key, code, altKey, bubbles: true }),
      );
    const setOptionMode = (optionKeyMode: OptionKeyMode) =>
      surface.applyConfiguration({
        appearance: { fontSize: 16, lineHeight: 1 },
        padding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode,
        theme: DEFAULT_TERMINAL_THEME,
      });
    const optionText = (
      side: "left" | "right",
      key: string,
      code: string,
      nativeText?: string,
    ) => {
      const optionCode = side === "left" ? "AltLeft" : "AltRight";
      dispatchKey("keydown", "Alt", optionCode, true);
      dispatchKey("keydown", key, code, true);
      if (nativeText)
        input.dispatchEvent(
          new InputEvent("input", {
            data: nativeText,
            inputType: "insertText",
            bubbles: true,
          }),
        );
      dispatchKey("keyup", key, code, true);
      dispatchKey("keyup", "Alt", optionCode, false);
    };

    input.focus();
    optionText("left", "å", "KeyA", "å");
    dispatchKey("keydown", "Alt", "AltLeft", true);
    dispatchKey("keydown", "Dead", "KeyE", true);
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { data: "", bubbles: true }),
    );
    input.dispatchEvent(
      new CompositionEvent("compositionupdate", { data: "´", bubbles: true }),
    );
    input.dispatchEvent(
      new CompositionEvent("compositionend", { data: "é", bubbles: true }),
    );
    input.dispatchEvent(
      new InputEvent("input", {
        data: "é",
        inputType: "insertText",
        bubbles: true,
      }),
    );
    dispatchKey("keyup", "Dead", "KeyE", true);
    dispatchKey("keyup", "Alt", "AltLeft", false);
    setOptionMode("left");
    dispatchKey("keydown", "Alt", "AltLeft", true);
    window.dispatchEvent(new Event("blur"));
    optionText("right", "∫", "KeyB", "∫");
    optionText("left", "å", "KeyA");
    optionText("right", "∫", "KeyB", "∫");
    setOptionMode("right");
    optionText("left", "å", "KeyA", "å");
    optionText("right", "∫", "KeyB");
    setOptionMode("both");
    optionText("left", "å", "KeyA");
    optionText("right", "∫", "KeyB");

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
      terminalReplies: terminalInput.length,
      optionInput: terminalInput.slice(0, 9),
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
