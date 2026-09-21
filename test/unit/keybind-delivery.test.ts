import { expect, it, vi } from "vitest";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  terminalDefaultKeybinds,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

interface KeyboardInputOverrides {
  readonly type?: string;
  readonly key: string;
  readonly code?: string;
  readonly control?: boolean;
  readonly meta?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

function keybindDeliveryHarness(
  keybinds: TerminalKeybinds = DEFAULT_TERMINAL_KEYBINDS,
  platform: string = "darwin",
) {
  const invoke = vi.fn();
  let activeKeybinds = keybinds;
  let listener:
    | ((
        event: { preventDefault: () => void },
        input: Required<KeyboardInputOverrides>,
      ) => void)
    | undefined;
  deliverKeybindsFromKeyEvents(
    {
      on(_event, handler) {
        listener = handler;
      },
    },
    () => activeKeybinds,
    invoke,
    platform,
  );
  const sendKey = (overrides: KeyboardInputOverrides) => {
    const event = { preventDefault: vi.fn() };
    listener?.(event, {
      type: "keyDown",
      code: "",
      control: false,
      meta: false,
      alt: false,
      shift: false,
      ...overrides,
    });
    return event;
  };
  return {
    invoke,
    sendKey,
    setKeybinds(keybinds: TerminalKeybinds) {
      activeKeybinds = keybinds;
    },
  };
}

// Electron 43 reports shifted punctuation this way on native Windows and Linux.
// Delivery must happen before renderer key handling can suppress menu fallback.
it.each(["linux", "win32"])(
  "delivers native shifted punctuation before it reaches the %s terminal",
  (platform) => {
    for (const [key, code, action] of [
      ["+", "Equal", "zoomIn"],
      ["<", "Comma", "reloadConfig"],
    ] as const) {
      const { invoke, sendKey } = keybindDeliveryHarness(
        terminalDefaultKeybinds(platform),
        platform,
      );
      const event = sendKey({ key, code, control: true, shift: true });
      expect(invoke).toHaveBeenCalledExactlyOnceWith(action);
      expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
    }
  },
);

// Regression for #82: macOS never delivers Control+Tab to a menu accelerator,
// so the action must be observed from the key event itself. Physical presses
// can surface as rawKeyDown while synthesized ones surface as keyDown; both
// spellings must deliver or the shipped fix silently dies again.
it.each(["keyDown", "rawKeyDown"])(
  "delivers a Control+Tab %s event as the nextTab action and consumes the key",
  (type) => {
    const { invoke, sendKey } = keybindDeliveryHarness();

    const event = sendKey({ type, key: "Tab", control: true });

    expect(invoke).toHaveBeenCalledExactlyOnceWith("nextTab");
    expect(event.preventDefault).toHaveBeenCalled();
  },
);

it("delivers a Control+Shift+Tab key event as the previousTab action", () => {
  const { invoke, sendKey } = keybindDeliveryHarness();

  const event = sendKey({ key: "Tab", control: true, shift: true });

  expect(invoke).toHaveBeenCalledExactlyOnceWith("previousTab");
  expect(event.preventDefault).toHaveBeenCalled();
});

it("lets keys that match no keybind reach the terminal untouched", () => {
  const { invoke, sendKey } = keybindDeliveryHarness();

  for (const input of [
    { key: "Tab" },
    { key: "Tab", control: true, alt: true },
    { key: "a", control: true },
    { key: "Escape" },
  ]) {
    const event = sendKey(input);
    expect(event.preventDefault).not.toHaveBeenCalled();
  }
  expect(invoke).not.toHaveBeenCalled();
});

it("ignores key events that are not key presses", () => {
  const { invoke, sendKey } = keybindDeliveryHarness();

  const event = sendKey({ type: "keyUp", key: "Tab", control: true });

  expect(invoke).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

it.each(["keyDown", "rawKeyDown"])(
  "delivers main-keyboard and keypad Plus once for a %s event",
  (type) => {
    for (const shift of [false, true]) {
      const { invoke, sendKey } = keybindDeliveryHarness(
        terminalDefaultKeybinds("win32"),
        "win32",
      );
      const event = sendKey({ type, key: "+", control: true, shift });
      expect(invoke).toHaveBeenCalledExactlyOnceWith("zoomIn");
      expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
    }
  },
);

it("preserves exact symbol and explicit Shift bindings over punctuation aliases", () => {
  const { invoke, sendKey } = keybindDeliveryHarness(
    {
      ...terminalDefaultKeybinds("win32"),
      reloadConfig: "Control+Shift+Plus",
      zoomOut: "Control+Shift+,",
      toggleSnippets: "Control+Shift+<",
    },
    "win32",
  );
  sendKey({ key: "+", code: "Equal", control: true, shift: true });
  expect(invoke).toHaveBeenLastCalledWith("reloadConfig");
  sendKey({ key: "+", code: "NumpadAdd", control: true });
  expect(invoke).toHaveBeenLastCalledWith("zoomIn");
  sendKey({ key: "<", code: "Comma", control: true, shift: true });
  expect(invoke).toHaveBeenLastCalledWith("toggleSnippets");
  expect(invoke).toHaveBeenCalledTimes(3);
});

it("leaves unrelated modifiers, layouts and ordinary terminal input untouched", () => {
  const { invoke, sendKey } = keybindDeliveryHarness(
    terminalDefaultKeybinds("linux"),
    "linux",
  );
  for (const input of [
    { key: "=", control: true },
    { key: "+", shift: true },
    { key: "+", control: true, alt: true, shift: true },
    { key: "<", code: "Comma", control: true },
    { key: "<", code: "IntlBackslash", control: true, shift: true },
    { key: "<", control: true, shift: true },
    { key: ">", code: "Comma", control: true, shift: true },
    { key: "c", control: true },
    { key: "d", control: true },
  ]) {
    expect(sendKey(input).preventDefault).not.toHaveBeenCalled();
  }
  expect(invoke).not.toHaveBeenCalled();
});

it("delivers shifted punctuation with macOS Command semantics", () => {
  const { invoke, sendKey } = keybindDeliveryHarness();
  sendKey({ key: "+", code: "Equal", meta: true, shift: true });
  expect(invoke).toHaveBeenLastCalledWith("zoomIn");
  sendKey({ key: "<", code: "Comma", meta: true, shift: true });
  expect(invoke).toHaveBeenLastCalledWith("reloadConfig");
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("delivers against the latest effective keybind map in an existing window", () => {
  const { invoke, sendKey, setKeybinds } = keybindDeliveryHarness();

  setKeybinds({
    ...DEFAULT_TERMINAL_KEYBINDS,
    nextTab: "Control+PageDown",
    previousTab: "Control+PageUp",
  });
  sendKey({ key: "PageDown", control: true });
  expect(invoke).toHaveBeenCalledExactlyOnceWith("nextTab");

  const unmapped = sendKey({ key: "Tab", control: true });
  expect(unmapped.preventDefault).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});
