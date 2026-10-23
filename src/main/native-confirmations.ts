import { dialog, type BrowserWindow } from "electron";
import type { Translator } from "../shared/i18n";
import { mainTranslator } from "./main-translator";

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

const t = (...parameters: Parameters<Translator["t"]>) =>
  mainTranslator().t(...parameters);

export const confirmQuit = (window: BrowserWindow | undefined) =>
  confirm(window, {
    type: "question",
    title: t("confirm.quit.title"),
    message: t("confirm.quit.message"),
    detail: t("confirm.quit.detail"),
    buttons: [t("confirm.quit.button"), t("confirm.cancel")],
  });

export const confirmCloseWindow = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: t("confirm.closeWindow.title"),
    message: t("confirm.closeWindow.message"),
    detail: t("confirm.closeWindow.detail"),
    buttons: [t("confirm.close"), t("confirm.cancel")],
  });

export const confirmCloseTab = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: t("confirm.closeTab.title"),
    message: t("confirm.closeTab.message"),
    detail: t("confirm.closeTab.detail"),
    buttons: [t("confirm.close"), t("confirm.cancel")],
  });

export const confirmClosePane = (window: BrowserWindow) =>
  confirm(window, {
    type: "question",
    title: t("confirm.closePane.title"),
    message: t("confirm.closePane.message"),
    detail: t("confirm.closePane.detail"),
    buttons: [t("confirm.close"), t("confirm.cancel")],
  });

export const confirmProtectedPaste = (window: BrowserWindow) =>
  confirm(window, {
    type: "warning",
    title: t("confirm.paste.title"),
    message: t("confirm.paste.message"),
    detail: t("confirm.paste.detail"),
    buttons: [t("confirm.paste.button"), t("confirm.cancel")],
  });

export const confirmBroadcast = (window: BrowserWindow, targetCount: number) =>
  confirm(window, {
    type: "warning",
    title: t("confirm.broadcast.title"),
    message: t("confirm.broadcast.message"),
    detail: t("confirm.broadcast.detail", { count: targetCount }),
    buttons: [t("confirm.broadcast.button"), t("confirm.cancel")],
  });
