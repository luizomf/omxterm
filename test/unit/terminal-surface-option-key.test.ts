// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { OptionKeyMode } from "../../src/terminal-surface/terminal-surface";

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    activate() {}
    fit() {}
    dispose() {}
  },
}));

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

type CharacterKey = "KeyA" | "KeyB";
type OptionInput = readonly [CharacterKey, nativeCharacter?: string];

interface OptionInputCase {
  readonly mode: OptionKeyMode;
  readonly left: OptionInput;
  readonly right: OptionInput;
  readonly expected: readonly string[];
}

const cases: readonly OptionInputCase[] = [
  {
    mode: "none",
    left: ["KeyA", "å"],
    right: ["KeyB", "∫"],
    expected: ["å", "∫"],
  },
  {
    mode: "left",
    left: ["KeyA"],
    right: ["KeyB", "∫"],
    expected: ["\u001ba", "∫"],
  },
  {
    mode: "right",
    left: ["KeyA", "å"],
    right: ["KeyB"],
    expected: ["å", "\u001bb"],
  },
  {
    mode: "both",
    left: ["KeyA"],
    right: ["KeyB"],
    expected: ["\u001ba", "\u001bb"],
  },
];

let mountTerminalSurface: (typeof import("../../src/terminal-surface/terminal-surface"))["mountTerminalSurface"];

function dispatchKeyboard(
  textarea: HTMLTextAreaElement,
  type: "keydown" | "keyup",
  init: KeyboardEventInit,
  keyCode: number,
): void {
  const event = new KeyboardEvent(type, { ...init, bubbles: true });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  textarea.dispatchEvent(event);
}

function enterOptionInput(
  textarea: HTMLTextAreaElement,
  side: "left" | "right",
  [characterCode, nativeCharacter]: OptionInput,
): void {
  const optionCode = side === "left" ? "AltLeft" : "AltRight";
  const key = characterCode === "KeyA" ? "a" : "b";
  const keyCode = characterCode === "KeyA" ? 65 : 66;

  dispatchKeyboard(
    textarea,
    "keydown",
    { key: "Alt", code: optionCode, altKey: true },
    18,
  );
  dispatchKeyboard(
    textarea,
    "keydown",
    { key, code: characterCode, altKey: true },
    keyCode,
  );
  if (nativeCharacter) {
    textarea.dispatchEvent(
      new InputEvent("input", {
        data: nativeCharacter,
        inputType: "insertText",
        bubbles: true,
      }),
    );
  }
  dispatchKeyboard(
    textarea,
    "keyup",
    { key, code: characterCode, altKey: true },
    keyCode,
  );
  dispatchKeyboard(textarea, "keyup", { key: "Alt", code: optionCode }, 18);
}

describe("Terminal Surface Option Key Mode with real xterm input", () => {
  beforeAll(async () => {
    const nodeProcess = globalThis.process;
    const browserProcess = new Proxy(nodeProcess, {
      has: (target, property) =>
        property === "title" ? false : Reflect.has(target, property),
    });
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("MacIntel");
    const userAgent = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
    vi.stubGlobal("ResizeObserver", NoopResizeObserver);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: () => ({ width: 10 }),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("process", browserProcess);
    try {
      ({ mountTerminalSurface } =
        await import("../../src/terminal-surface/terminal-surface"));
    } finally {
      vi.stubGlobal("process", nodeProcess);
      platform.mockRestore();
      userAgent.mockRestore();
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => document.body.replaceChildren());

  it.each(cases)(
    "sends observable $mode input for physical left and right Option keys",
    async ({ mode, left, right, expected }) => {
      const adapter = {
        start: vi.fn(async () => undefined),
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
      };
      const container = document.createElement("main");
      document.body.append(container);
      const surface = await mountTerminalSurface(container, adapter, {
        optionKeyMode: mode,
      });
      const textarea = container.querySelector("textarea");
      expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

      enterOptionInput(textarea!, "left", left);
      enterOptionInput(textarea!, "right", right);

      expect(adapter.write.mock.calls.flat()).toEqual(expected);
      surface.dispose();
    },
  );
});
