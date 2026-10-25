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
  readonly _modifiers?: number;
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
      send: vi.fn(),
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
      _modifiers: 0,
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

it.each(["linux", "win32"])(
  "delivers distinct Alt/AltGr actions and leaves ordinary input untouched on %s",
  (platform) => {
    const { invoke, sendKey, setKeybinds } = keybindDeliveryHarness(
      {
        ...terminalDefaultKeybinds(platform),
        newTab: "AltGr+J",
        closeTab: "Alt+J",
      },
      platform,
    );
    // Real Electron 43 AltGr event: raw Blink flag, neither Alt nor Control,
    // and no AltGr entry in the public modifier array.
    expect(
      sendKey({ key: "j", _modifiers: 32768 }).preventDefault,
    ).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("newTab");
    sendKey({ key: "j", alt: true, _modifiers: 4 });
    expect(invoke).toHaveBeenLastCalledWith("closeTab");
    for (const input of [
      { key: "j" },
      { key: "j", control: true, alt: true, _modifiers: 6 },
      { key: "é", _modifiers: 32768 },
      { key: "Dead" },
      { key: "j", type: "keyUp", _modifiers: 32768 },
    ])
      expect(sendKey(input).preventDefault).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(2);
    setKeybinds({ ...terminalDefaultKeybinds(platform), newTab: "AltGr+J" });
    expect(
      sendKey({ key: "j", alt: true, _modifiers: 4 }).preventDefault,
    ).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(2);
  },
);

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
    for (const input of [
      { code: "Equal", shift: true },
      { code: "NumpadAdd", shift: false },
      { code: "NumpadAdd", shift: true },
    ]) {
      const { invoke, sendKey } = keybindDeliveryHarness(
        terminalDefaultKeybinds("win32"),
        "win32",
      );
      const event = sendKey({ type, key: "+", control: true, ...input });
      expect(invoke).toHaveBeenCalledExactlyOnceWith("zoomIn");
      expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
    }
  },
);

it("delivers symbols and explicit Shift identities once without consuming ordinary typing", () => {
  for (const binding of ["Control+!", "Control+Shift+1"]) {
    const { invoke, sendKey } = keybindDeliveryHarness(
      { ...terminalDefaultKeybinds("linux"), newTab: binding },
      "linux",
    );
    expect(
      sendKey({ key: "!", code: "Digit1", control: true, shift: true })
        .preventDefault,
    ).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("newTab");
    for (const input of [
      { key: "!", code: "Digit1", shift: true },
      { key: "1", code: "Digit1", control: true },
      { key: "!", code: "Digit1", control: true, alt: true, shift: true },
    ])
      expect(sendKey(input).preventDefault).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  }
});

it("keeps native keypad bindings distinct and gives them precedence over the Plus convenience", () => {
  const { invoke, sendKey } = keybindDeliveryHarness(
    {
      ...terminalDefaultKeybinds("linux"),
      newTab: "Control+num1",
      closeTab: "Control+numadd",
    },
    "linux",
  );
  sendKey({ key: "1", code: "Numpad1", control: true });
  expect(invoke).toHaveBeenLastCalledWith("newTab");
  sendKey({ key: "+", code: "NumpadAdd", control: true });
  expect(invoke).toHaveBeenLastCalledWith("closeTab");
  sendKey({ key: "+", code: "Equal", control: true, shift: true });
  expect(invoke).toHaveBeenLastCalledWith("zoomIn");
  sendKey({ key: "-", code: "NumpadSubtract", control: true });
  expect(invoke).toHaveBeenLastCalledWith("zoomOut");
  expect(invoke).toHaveBeenCalledTimes(4);
});

it("preserves logical keypad Multiply while prioritizing its explicit native binding", () => {
  for (const platform of ["darwin", "linux", "win32"]) {
    for (const [binding, shift] of [
      ["Control+*", false],
      ["Control+Shift+*", true],
    ] as const) {
      const bindings = {
        ...terminalDefaultKeybinds(platform),
        newTab: binding,
      };
      const { invoke, sendKey, setKeybinds } = keybindDeliveryHarness(
        bindings,
        platform,
      );
      const input = { key: "*", code: "NumpadMultiply", control: true, shift };
      expect(sendKey(input).preventDefault).toHaveBeenCalledOnce();
      expect(invoke).toHaveBeenCalledExactlyOnceWith("newTab");
      setKeybinds({
        ...bindings,
        closeTab: shift ? "Control+Shift+nummult" : "Control+nummult",
      });
      sendKey(input);
      expect(invoke).toHaveBeenLastCalledWith("closeTab");
      expect(
        sendKey({ ...input, control: false }).preventDefault,
      ).not.toHaveBeenCalled();
    }
  }
});

it("keeps logical Plus convenience out of literal Equal bindings", () => {
  const defaults = terminalDefaultKeybinds("linux");
  const { invoke, sendKey } = keybindDeliveryHarness(
    { ...defaults, newTab: "Control+=" },
    "linux",
  );
  sendKey({ key: "+", code: "BracketRight", control: true });
  expect(invoke).toHaveBeenCalledExactlyOnceWith("zoomIn");
  sendKey({ key: "=", code: "Equal", control: true });
  expect(invoke).toHaveBeenLastCalledWith("newTab");
  const explicit = keybindDeliveryHarness(
    { ...defaults, newTab: "Control+Shift+=", zoomIn: "Alt+G" },
    "linux",
  );
  expect(
    explicit.sendKey({
      key: "+",
      code: "BracketRight",
      control: true,
      shift: true,
    }).preventDefault,
  ).not.toHaveBeenCalled();
  explicit.sendKey({ key: "+", code: "Equal", control: true, shift: true });
  expect(explicit.invoke).toHaveBeenCalledExactlyOnceWith("newTab");
});

it("distinguishes the Plus fallback policy from an explicit Shift requirement", () => {
  for (const [binding, expected] of [
    ["Control+Plus", true],
    ["Control+Shift+Plus", false],
    ["Control+Shift+=", false],
  ] as const) {
    const { invoke, sendKey } = keybindDeliveryHarness(
      { ...terminalDefaultKeybinds("linux"), zoomIn: binding },
      "linux",
    );
    const keypad = sendKey({ key: "+", code: "NumpadAdd", control: true });
    expect(keypad.preventDefault).toHaveBeenCalledTimes(expected ? 1 : 0);
    sendKey({ key: "+", code: "Equal", control: true, shift: true });
    expect(invoke).toHaveBeenLastCalledWith("zoomIn");
    expect(
      sendKey({ key: "=", control: true }).preventDefault,
    ).not.toHaveBeenCalled();
  }
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

it.each(
  ["darwin", "linux", "win32"].flatMap((platform) =>
    (["toggleTabBar", "toggleTitleBar"] as const).map((action) => ({
      platform,
      action,
    })),
  ),
)(
  "consumes $action once and follows its remap on $platform",
  ({ platform, action }) => {
    const defaults = terminalDefaultKeybinds(platform);
    const { invoke, sendKey, setKeybinds } = keybindDeliveryHarness(
      defaults,
      platform,
    );
    const key = action === "toggleTabBar" ? "B" : "D";
    const input = {
      key,
      shift: true,
      meta: platform === "darwin",
      control: platform !== "darwin",
    };
    expect(sendKey(input).preventDefault).toHaveBeenCalledOnce();
    sendKey({ ...input, type: "keyUp" });
    expect(invoke).toHaveBeenCalledExactlyOnceWith(action);
    setKeybinds({ ...defaults, [action]: `Control+Alt+${key}` });
    expect(sendKey(input).preventDefault).not.toHaveBeenCalled();
    invoke.mockClear();
    expect(
      sendKey({ key: key.toLowerCase(), control: true, alt: true })
        .preventDefault,
    ).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledExactlyOnceWith(action);
  },
);

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
