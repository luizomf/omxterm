import { dialog, type BrowserWindow } from "electron";

// Native confirmation dialogs. Each defaults to its safe choice (Cancel) and
// never includes Terminal Payload, titles or commands in its text.
async function confirm(
  window: BrowserWindow | undefined,
  options: Electron.MessageBoxOptions,
): Promise<boolean> {
  const complete = { defaultId: 1, cancelId: 1, noLink: true, ...options };
  const result =
    window && !window.isDestroyed()
      ? await dialog.showMessageBox(window, complete)
      : await dialog.showMessageBox(complete);
  return result.response === 0;
}

export const confirmQuit = (window: BrowserWindow | undefined) =>
  confirm(window, {
    type: "question",
    title: "Quit OMXTerm",
    message: "Quit OMXTerm and close all Terminal Windows?",
    detail: "All open Live Terminal Sessions will end.",
    buttons: ["Quit", "Cancel"],
  });

export const confirmCloseWindow = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: "Close Window",
    message: "Close this Terminal Window and all of its tabs?",
    detail: "All of its Live Terminal Sessions will end.",
    buttons: ["Close", "Cancel"],
  });

export const confirmCloseTab = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: "Close Tab",
    message: "Close this Terminal Tab?",
    detail: "Its Live Terminal Session will end.",
    buttons: ["Close", "Cancel"],
  });

export const confirmClosePane = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: "Close Pane",
    message: "Close this Terminal Pane?",
    detail: "Its Live Terminal Session will end.",
    buttons: ["Close", "Cancel"],
  });

export const confirmProtectedPaste = (window: BrowserWindow) =>
  confirm(window, {
    type: "warning",
    title: "Protected Paste",
    message: "Paste text that may contain multiple commands?",
    detail: "The paste contains multiple lines or control characters.",
    buttons: ["Paste", "Cancel"],
  });

export const confirmBroadcast = (window: BrowserWindow, targetCount: number) =>
  confirm(window, {
    type: "warning",
    title: "Broadcast Input",
    message: "Start broadcasting keyboard input?",
    detail: `Everything typed in the focused pane will also be sent to ${targetCount} other ${targetCount === 1 ? "pane" : "panes"} in this tab until broadcasting is stopped.`,
    buttons: ["Broadcast", "Cancel"],
  });
