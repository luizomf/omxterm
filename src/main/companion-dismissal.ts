import type { BrowserWindow, Event, Input } from "electron";
import { extensionViewIpc } from "../shared/extension-view";
import type { KeybindKeyboardInput } from "./keybind-delivery";

type CompanionDismissal = {
  handle(
    event: Event,
    input: Input,
    panelId?: string,
    activationId?: string,
  ): boolean;
  claimActivation(id: string): void;
  interceptShortcut(input: KeybindKeyboardInput): boolean;
  claimShortcut(input: KeybindKeyboardInput): boolean;
};
const owners = new WeakMap<BrowserWindow, CompanionDismissal>();

// One gesture belongs to the window, not the WebContents that received its
// first press. Child blur is the expected focus transfer, not cancellation.
export function createCompanionDismissal(
  window: BrowserWindow,
): CompanionDismissal {
  const existing = owners.get(window);
  if (existing) return existing;
  const shortcuts = new Set<string>();
  const contents = window.webContents;
  let owned: string | undefined;
  let activation: { id: string; identity: string } | undefined;
  const releaseDismissal = () => {
    owned = undefined;
    activation = undefined;
  };
  const release = () => {
    releaseDismissal();
    shortcuts.clear();
  };
  const handle = (
    event: Event,
    input: Input,
    panelId?: string,
    activationId = panelId,
  ) => {
    const down = input.type === "keyDown" || input.type === "rawKeyDown";
    if (!down && input.type !== "keyUp") return false;
    const identity = input.code || input.key;
    if (owned === identity) {
      if (down && !input.isAutoRepeat) releaseDismissal();
      else {
        if (!down) releaseDismissal();
        event.preventDefault();
        return true;
      }
    }
    if (activation?.identity === identity && !down) activation = undefined;
    if (activationId && down && !input.isAutoRepeat && input.key === "Enter")
      activation = { id: activationId, identity };
    if (!panelId || !down || input.key !== "Escape") return false;
    owned = identity;
    event.preventDefault();
    contents.send(extensionViewIpc.dismissPanel, panelId);
    return true;
  };
  const coreInput = (event: Event, input: Input) => {
    handle(event, input);
  };
  contents.prependListener("before-input-event", coreInput);
  window.on("blur", release);
  contents.on("did-start-loading", release);
  contents.on("render-process-gone", release);
  contents.once("destroyed", () => {
    release();
    contents.removeListener("before-input-event", coreInput);
    contents.removeListener("did-start-loading", release);
    contents.removeListener("render-process-gone", release);
    window.removeListener("blur", release);
  });
  const owner: CompanionDismissal = {
    handle,
    // The same physical press may start in core and finish in a native child,
    // or vice versa. Modifier release and catalog changes do not release it.
    interceptShortcut(input) {
      const identity = input.code || input.key;
      if (!shortcuts.has(identity)) return false;
      if (input.type === "keyUp") {
        shortcuts.delete(identity);
        return true;
      }
      if (input.type !== "keyDown" && input.type !== "rawKeyDown") return false;
      if (input.isAutoRepeat) return true;
      shortcuts.delete(identity);
      return false;
    },
    claimShortcut(input) {
      const identity = input.code || input.key;
      if (identity.length > 64 || shortcuts.size >= 256) return false;
      shortcuts.add(identity);
      return !input.isAutoRepeat;
    },
    // A trusted semantic request claims the still-held Enter that reached its
    // own child. The initial press remains a DOM activation; only subsequent
    // repeats/release are swallowed across the child-to-core handoff.
    claimActivation(id: string) {
      if (activation?.id !== id) return;
      owned = activation.identity;
      activation = undefined;
    },
  };
  owners.set(window, owner);
  return owner;
}
