import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { OptionKeyMode } from "../../src/shared/user-configuration";
import {
  exerciseResttyDeadKeySpaceInput,
  exerciseResttySpaceInput,
} from "./restty-space-input";

interface ResttyFixtureResult {
  readonly backend?: string;
  readonly error?: string;
  readonly fatal?: string;
  readonly font?: string;
  readonly ptyStarts: number;
  readonly clipboardReads?: number;
  readonly clipboardWrites?: number;
  readonly terminalReplies?: number;
  readonly startupReplies?: readonly string[];
  readonly optionInput?: readonly string[];
  readonly compositionInput?: Readonly<Record<string, readonly string[]>>;
  readonly spaceInput?: Readonly<Record<string, readonly string[]>>;
  readonly deadKeySpaceInput?: Readonly<Record<string, readonly string[]>>;
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
      nextHandlers.onOutput("\u001b[c\u001b[>c");
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
    const startupReplies = terminalInput.splice(0);
    const input = container.querySelector("textarea");
    if (!input) throw new Error("Restty IME input is missing");
    const dispatchKey = (
      type: "keydown" | "keyup",
      key: string,
      code: string,
      altKey: boolean,
      shiftKey = false,
    ) =>
      input.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code,
          altKey,
          shiftKey,
          bubbles: true,
        }),
      );
    const setOptionMode = (optionKeyMode: OptionKeyMode) =>
      surface.applyConfiguration({
        appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
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
    dispatchKey("keydown", "Alt", "AltLeft", true);
    dispatchKey("keydown", "Dead", "KeyE", true);
    dispatchKey("keyup", "Dead", "KeyE", true);
    dispatchKey("keydown", "Å", "KeyA", true, true);
    dispatchKey("keyup", "Å", "KeyA", true, true);
    dispatchKey("keyup", "Alt", "AltLeft", false);
    const optionInput = terminalInput.slice();
    setOptionMode("none");

    const dispatchTextInput = (text: string) => {
      input.dispatchEvent(
        new InputEvent("beforeinput", {
          data: text,
          inputType: "insertText",
          bubbles: true,
          cancelable: true,
        }),
      );
      input.dispatchEvent(
        new InputEvent("input", {
          data: text,
          inputType: "insertText",
          bubbles: true,
        }),
      );
    };
    const dispatchComposition = (text: string) => {
      dispatchKey("keydown", "Dead", "Quote", false);
      input.dispatchEvent(
        new CompositionEvent("compositionstart", { data: "", bubbles: true }),
      );
      input.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: text ? "´" : "",
          bubbles: true,
        }),
      );
      input.dispatchEvent(
        new CompositionEvent("compositionend", { data: text, bubbles: true }),
      );
      if (text)
        input.dispatchEvent(
          new InputEvent("input", {
            data: text,
            inputType: "insertText",
            bubbles: true,
          }),
        );
      dispatchKey("keyup", "Dead", "Quote", false);
    };
    const captureInput = (exercise: () => void) => {
      terminalInput.length = 0;
      exercise();
      return terminalInput.slice();
    };
    const compositionInput: Record<string, readonly string[]> = {};
    const exerciseCompositionMode = (name: string, mode: string) => {
      handlers?.onOutput(mode);
      compositionInput[`${name}Commit`] = captureInput(() => {
        dispatchTextInput("ser");
        dispatchComposition("á");
        dispatchTextInput(" s");
        dispatchComposition("ó");
        dispatchTextInput(" av");
        dispatchComposition("ó");
      });
      compositionInput[`${name}Cancel`] = captureInput(() =>
        dispatchComposition(""),
      );
      compositionInput[`${name}LiteralApostrophe`] = captureInput(() => {
        dispatchKey("keydown", "'", "Quote", false);
        dispatchTextInput("'");
        dispatchKey("keyup", "'", "Quote", false);
      });
    };
    exerciseCompositionMode("legacy", "\u001b[=0u\u001b[>4;0m");
    exerciseCompositionMode("modifyOtherKeys", "\u001b[=0u\u001b[>4;2m");
    exerciseCompositionMode("kitty1", "\u001b[=1u");
    exerciseCompositionMode("kitty2", "\u001b[=2u");
    exerciseCompositionMode("kitty4", "\u001b[=4u");
    exerciseCompositionMode("kitty124", "\u001b[=7u");
    compositionInput.kitty124Modified = captureInput(() => {
      for (const [type, key, code] of [
        ["keydown", "c", "KeyC"],
        ["keyup", "c", "KeyC"],
        ["keydown", "ArrowLeft", "ArrowLeft"],
        ["keyup", "ArrowLeft", "ArrowLeft"],
      ] as const)
        input.dispatchEvent(
          new KeyboardEvent(type, {
            key,
            code,
            ctrlKey: true,
            bubbles: true,
          }),
        );
    });

    const spaceInput = exerciseResttySpaceInput(
      input,
      (data) => handlers?.onOutput(data),
      captureInput,
    );

    const deadKeySpaceInput = exerciseResttyDeadKeySpaceInput(
      input,
      (data) => handlers?.onOutput(data),
      captureInput,
    );

    terminalInput.length = 0;
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
      terminalReplies: optionInput.length + terminalInput.length,
      startupReplies,
      optionInput,
      compositionInput,
      spaceInput,
      deadKeySpaceInput,
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
