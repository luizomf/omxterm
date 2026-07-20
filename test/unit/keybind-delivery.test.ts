import { expect, it, vi } from "vitest";
import { deliverUnhandledKeybinds } from "../../src/main/keybind-delivery";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

interface KeyboardInputOverrides {
  readonly type?: string;
  readonly key: string;
  readonly control?: boolean;
  readonly meta?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

function keybindDeliveryHarness(
  keybinds: TerminalKeybinds = DEFAULT_TERMINAL_KEYBINDS,
) {
  const invoke = vi.fn();
  let listener:
    | ((
        event: { preventDefault: () => void },
        input: Required<KeyboardInputOverrides>,
      ) => void)
    | undefined;
  deliverUnhandledKeybinds(
    {
      on(_event, handler) {
        listener = handler;
      },
    },
    keybinds,
    invoke,
  );
  const sendKey = (overrides: KeyboardInputOverrides) => {
    const event = { preventDefault: vi.fn() };
    listener?.(event, {
      type: "keyDown",
      control: false,
      meta: false,
      alt: false,
      shift: false,
      ...overrides,
    });
    return event;
  };
  return { invoke, sendKey };
}

// Regression for #82: macOS never delivers Control+Tab to a menu accelerator,
// so the action must be observed from the key event itself.
it("delivers a Control+Tab key event as the nextTab action and consumes the key", () => {
  const { invoke, sendKey } = keybindDeliveryHarness();

  const event = sendKey({ key: "Tab", control: true });

  expect(invoke).toHaveBeenCalledExactlyOnceWith("nextTab");
  expect(event.preventDefault).toHaveBeenCalled();
});

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

it("delivers against the effective keybind map, not the defaults", () => {
  const { invoke, sendKey } = keybindDeliveryHarness({
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
