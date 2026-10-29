import type { BrowserWindow, Event, Input } from "electron";
import { extensionViewIpc } from "../shared/extension-view";

// One gesture belongs to the window, not the WebContents that received its
// first press. Child blur is the expected focus transfer, not cancellation.
export function createCompanionDismissal(window: BrowserWindow) {
  const contents = window.webContents;
  let owned: string | undefined;
  const release = () => {
    owned = undefined;
  };
  const handle = (event: Event, input: Input, panelId?: string) => {
    const down = input.type === "keyDown" || input.type === "rawKeyDown";
    if (!down && input.type !== "keyUp") return false;
    const identity = input.code || input.key;
    if (owned === identity) {
      if (down && !input.isAutoRepeat) release();
      else {
        if (!down) release();
        event.preventDefault();
        return true;
      }
    }
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
  return { handle };
}
