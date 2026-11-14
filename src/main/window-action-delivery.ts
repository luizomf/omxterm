import { onWindowClosed } from "./window-closed";
import type { BrowserWindow, Event, Input } from "electron";
import { hasNativeAltGr } from "./keyboard-modifiers";
import { coreActionForKeyboardInput } from "./action-catalog";
import type { TrustedWebContents } from "./terminal-ipc-types";
import { coreActionKeybinds, type CoreActionCatalog } from "./action-catalog";
import type { startCommandPalette } from "./command-palette";
import type { KeybindCapture } from "./keybind-capture";
import { deliverKeybindsFromKeyEvents } from "./keybind-delivery";
import { createCompanionDismissal } from "./companion-dismissal";
import {
  isDiscreteWindowAction,
  isExtensionShortcutAction,
} from "../shared/terminal-keybinds";

// Extension slots, the panel-side action and the agent grant toggle each own
// one physical press, including repeats and release across focus, so holding
// a key never flips a toggle back and forth.
function ownsPhysicalPress(action: string): boolean {
  return (
    isExtensionShortcutAction(action) ||
    isDiscreteWindowAction(action) ||
    action === "toggleAgentAccess"
  );
}
import {
  optionShortcutInterpreter,
  type OptionShortcutIdentity,
} from "./macos-option-shortcut";

export function deliverExtensionKeybind(
  catalog: CoreActionCatalog,
  event: Event,
  input: Input,
  owner: BrowserWindow,
  capture: KeybindCapture,
  options: {
    companionOnly?: boolean | undefined;
    optionIdentity?: OptionShortcutIdentity;
  } = {},
) {
  const {
    companionOnly = false,
    optionIdentity = { platform: process.platform },
  } = options;
  if (event.defaultPrevented || !owner.isFocused()) return;
  const gestures = createCompanionDismissal(owner);
  const interpret = optionShortcutInterpreter(optionIdentity, () =>
    owner.getNativeWindowHandle(),
  );
  if (
    capture.intercept(owner.webContents, input, interpret) ||
    gestures.interceptShortcut(input)
  ) {
    event.preventDefault();
    return;
  }
  if (
    input.isComposing ||
    (input.type !== "keyDown" && input.type !== "rawKeyDown")
  )
    return;
  const action = coreActionForKeyboardInput(
    catalog,
    { ...interpret(input), altGr: hasNativeAltGr(input) },
    optionIdentity.platform,
  );
  if (!action || (companionOnly && !ownsPhysicalPress(action.id))) return;
  event.preventDefault();
  if (ownsPhysicalPress(action.id) && !gestures.claimShortcut(input)) return;
  action.invoke();
}

export function createWindowActionSender(
  palette: () => ReturnType<typeof startCommandPalette> | undefined,
) {
  const sendAction = (
    sender: TrustedWebContents,
    channel: string,
    payload?: unknown,
  ) => {
    const current = palette();
    if (current) current.send(sender, channel, payload);
    else sender.send(channel, payload);
  };
  return {
    sendAction,
    notifyWindow: (channel: string) => (window: BrowserWindow) =>
      sendAction(window.webContents, channel),
  };
}

// Window-owned key delivery and palette invalidation share native lifetime.
export function registerWindowActionDelivery(
  window: BrowserWindow,
  catalog: () => CoreActionCatalog,
  capture: KeybindCapture,
  palette: () => ReturnType<typeof startCommandPalette> | undefined,
  optionIdentity: OptionShortcutIdentity = { platform: process.platform },
) {
  const contents = window.webContents;
  const gestures = createCompanionDismissal(window);
  const interpret = optionShortcutInterpreter(optionIdentity, () =>
    window.getNativeWindowHandle(),
  );
  deliverKeybindsFromKeyEvents(
    contents,
    () => coreActionKeybinds(catalog()),
    (action, input) => {
      if (ownsPhysicalPress(action) && !gestures.claimShortcut(input)) return;
      catalog()[action].invoke();
    },
    optionIdentity.platform,
    {
      release: (target) => capture.release(target),
      intercept: (target, input, normalize) =>
        capture.intercept(target, input, normalize) ||
        gestures.interceptShortcut(input),
    },
    interpret,
  );
  const invalidate = () => palette()?.invalidate(contents);
  window.on("blur", invalidate);
  contents.on("did-start-loading", invalidate);
  contents.on("render-process-gone", invalidate);
  contents.on("destroyed", invalidate);
  window.on("blur", () => capture.release(contents));
  onWindowClosed(window, () => capture.release(contents));
  let selection: string | null | undefined;
  return {
    invalidate,
    select(next: string | null) {
      // Refocusing the same Surface is not selection loss.
      if (selection !== next) invalidate();
      selection = next;
    },
  };
}
