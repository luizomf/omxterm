import type { BrowserWindow, Event, Input } from "electron";
import { hasNativeAltGr } from "./keyboard-modifiers";
import { coreActionForKeyboardInput } from "./action-catalog";
import type { TrustedWebContents } from "./terminal-ipc-types";
import { coreActionKeybinds, type CoreActionCatalog } from "./action-catalog";
import type { startCommandPalette } from "./command-palette";
import type { KeybindCapture } from "./keybind-capture";
import { deliverKeybindsFromKeyEvents } from "./keybind-delivery";
import { createCompanionDismissal } from "./companion-dismissal";
import { isCompanionToolAction } from "../shared/terminal-keybinds";

export function deliverExtensionKeybind(
  catalog: CoreActionCatalog,
  event: Event,
  input: Input,
  owner: BrowserWindow,
  capture: KeybindCapture,
) {
  if (event.defaultPrevented || !owner.isFocused()) return;
  const gestures = createCompanionDismissal(owner);
  if (
    capture.intercept(owner.webContents, input) ||
    gestures.interceptShortcut(input)
  ) {
    event.preventDefault();
    return;
  }
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") return;
  const action = coreActionForKeyboardInput(
    catalog,
    { ...input, altGr: hasNativeAltGr(input) },
    process.platform,
  );
  if (!action) return;
  event.preventDefault();
  if (isCompanionToolAction(action.id) && !gestures.claimShortcut(input))
    return;
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
) {
  const contents = window.webContents;
  const gestures = createCompanionDismissal(window);
  deliverKeybindsFromKeyEvents(
    contents,
    () => coreActionKeybinds(catalog()),
    (action, input) => {
      if (isCompanionToolAction(action) && !gestures.claimShortcut(input))
        return;
      catalog()[action].invoke();
    },
    process.platform,
    {
      release: (target) => capture.release(target),
      intercept: (target, input) =>
        capture.intercept(target, input) || gestures.interceptShortcut(input),
    },
  );
  const invalidate = () => palette()?.invalidate(contents);
  window.on("blur", invalidate);
  contents.on("did-start-loading", invalidate);
  contents.on("render-process-gone", invalidate);
  contents.on("destroyed", invalidate);
  window.on("blur", () => capture.release(contents));
  window.once("closed", () => capture.release(contents));
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
