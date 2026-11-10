import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from "electron";
import {
  MAX_TERMINAL_EXPORT_BYTES,
  type TerminalExportKind,
  type TerminalExportSaveRequest,
} from "../shared/terminal-contract";
import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type MessageKey,
  type Translator,
} from "../shared/i18n";

export type TerminalExportOutcome =
  "saved" | "cancelled" | "empty" | "too-large" | "failed";

const EXPORT_LIMIT_MIB = MAX_TERMINAL_EXPORT_BYTES / (1024 * 1024);

export interface TerminalExportHost {
  isAlive(): boolean;
  showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
  showMessageBox(options: MessageBoxOptions): Promise<unknown>;
  writeFile(filePath: string, content: string): Promise<void>;
  documentsPath(): string;
  now(): Date;
}

const TITLES: Readonly<Record<TerminalExportKind, MessageKey>> = {
  selection: "export.title.selection",
  content: "export.title.content",
};

// The file holds the requested text as UTF-8 with LF line breaks, ending with
// exactly one line break; trailing blank rows of the screen are not kept.
export function terminalExportFileContent(text: string): string {
  return `${text.replace(/\n+$/u, "")}\n`;
}

export function suggestedTerminalExportName(
  kind: TerminalExportKind,
  now: Date,
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `omxterm-${kind === "selection" ? "selection" : "terminal"}-${stamp}.txt`;
}

// Saves only what the user explicitly requested, to the destination they pick.
// Cancellation writes nothing; the destination and text are never logged.
export async function saveTerminalExport(
  request: TerminalExportSaveRequest,
  host: TerminalExportHost,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): Promise<TerminalExportOutcome> {
  let noticeStarted = false;
  let writeStarted = false;
  try {
    if (!host.isAlive()) return "cancelled";
    if ("notice" in request) {
      noticeStarted = true;
      if (request.notice === "failed") {
        await host.showMessageBox({
          type: "error",
          title: t("export.failed"),
          message: t("export.readError"),
          buttons: [t("common.ok")],
          noLink: true,
        });
        return "failed";
      }
      await host.showMessageBox({
        type: "warning",
        title: t("export.tooLarge.title"),
        message: t("export.tooLarge.message", { limit: EXPORT_LIMIT_MIB }),
        detail: t("export.tooLarge.detail"),
        buttons: [t("common.ok")],
        noLink: true,
      });
      return "too-large";
    }
    const title = t(TITLES[request.kind]);
    if (!/\S/u.test(request.text)) {
      noticeStarted = true;
      await host.showMessageBox({
        type: "info",
        title,
        message: t(
          request.kind === "selection"
            ? "export.empty.selection"
            : "export.empty.content",
        ),
        buttons: [t("common.ok")],
        noLink: true,
      });
      return "empty";
    }
    const choice = await host.showSaveDialog({
      title,
      defaultPath: path.join(
        host.documentsPath(),
        suggestedTerminalExportName(request.kind, host.now()),
      ),
      filters: [
        { name: t("export.textFiles"), extensions: ["txt"] },
        { name: t("dialog.allFiles"), extensions: ["*"] },
      ],
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    // Losing the owner while the chooser is pending authorizes no new write.
    if (!host.isAlive() || choice.canceled || !choice.filePath)
      return "cancelled";
    const content = terminalExportFileContent(request.text);
    writeStarted = true;
    await host.writeFile(choice.filePath, content);
    // An already-started, user-authorized write may finish after owner loss.
    return "saved";
  } catch {
    if (!host.isAlive()) return writeStarted ? "failed" : "cancelled";
    // Never retry a failed notice or display a second one. Native details may
    // include private paths/text, so neither notices nor logs receive them.
    if (!noticeStarted) {
      try {
        await host.showMessageBox({
          type: "error",
          title: t("export.failed"),
          message: t("export.writeError"),
          detail: t("export.failureDetail"),
          buttons: [t("common.ok")],
          noLink: true,
        });
      } catch {
        /* The native notice itself is unavailable; do not retry. */
      }
    }
    return "failed";
  }
}

export function electronTerminalExportHost(
  window: BrowserWindow,
  isOwnerAlive: () => boolean,
): TerminalExportHost {
  return {
    isAlive: () =>
      isOwnerAlive() &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed(),
    showSaveDialog: (options) => dialog.showSaveDialog(window, options),
    showMessageBox: (options) => dialog.showMessageBox(window, options),
    writeFile: (filePath, content) =>
      writeFile(filePath, content, { encoding: "utf8", mode: 0o600 }),
    documentsPath: () => app.getPath("documents"),
    now: () => new Date(),
  };
}
