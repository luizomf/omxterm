import { dialog, type BrowserWindow } from "electron";
import type { Translator } from "../shared/i18n";
import {
  terminalApplicationFailureDisplay,
  type TerminalApplicationFailure,
} from "./terminal-application-failure";
import type { TerminalSessionFailure } from "./terminal-application";
import { terminalSessionFailureDialog } from "./terminal-session-failure";

// Native dialog text follows the configured language when each dialog opens.
export function createNativeDialogs(translator: () => Translator) {
  const confirm = async (
    window: BrowserWindow | undefined,
    kind: "quit" | "closeWindow" | "closeTab",
    action: string,
  ) => {
    const { t } = translator();
    const options = {
      type: "question" as const,
      title: t(`dialog.${kind}.title`),
      message: t(`dialog.${kind}.message`),
      detail: t(`dialog.${kind}.detail`),
      buttons: [action, t("common.cancel")],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const result =
      window && !window.isDestroyed()
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options);
    return result.response === 0;
  };
  return {
    clipboardError() {
      const { t } = translator();
      dialog.showErrorBox(
        t("dialog.clipboardError.title"),
        t("dialog.clipboardError.message"),
      );
    },
    externalLinkError() {
      const { t } = translator();
      dialog.showErrorBox(
        t("dialog.externalLinkError.title"),
        t("dialog.externalLinkError.message"),
      );
    },
    async confirmPaste(window: BrowserWindow) {
      const { t } = translator();
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        title: t("dialog.protectedPaste.title"),
        message: t("dialog.protectedPaste.message"),
        detail: t("dialog.protectedPaste.detail"),
        buttons: [t("dialog.protectedPaste.paste"), t("common.cancel")],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      return result.response === 0;
    },
    confirmQuit: (window: BrowserWindow | undefined) =>
      confirm(window, "quit", translator().t("dialog.quit.button")),
    confirmCloseWindow: (window: BrowserWindow) =>
      confirm(window, "closeWindow", translator().t("common.close")),
    confirmCloseTab: (window: BrowserWindow) =>
      confirm(window, "closeTab", translator().t("common.close")),
    async sessionFailure(
      window: BrowserWindow,
      failure: TerminalSessionFailure,
    ) {
      const failureDialog = terminalSessionFailureDialog(failure, translator());
      await dialog.showMessageBox(window, {
        ...failureDialog,
        buttons: [...failureDialog.buttons],
        noLink: true,
      });
    },
    applicationFailure(failure: TerminalApplicationFailure) {
      const display = terminalApplicationFailureDisplay(failure, translator());
      dialog.showErrorBox(display.title, display.message);
    },
  };
}
