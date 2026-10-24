import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  dialog,
  Menu,
  type BrowserWindow,
  type MessageBoxOptions,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from "electron";
import { terminalIpc } from "../shared/terminal-ipc";
import type {
  TerminalClipboardAction,
  TerminalContextMenuInvocation,
  TerminalExportKind,
  TerminalExportSaveRequest,
} from "../shared/terminal-contract";
import { terminalClipboardContextMenuTemplate } from "./application-menu";

export type TerminalExportOutcome =
  "saved" | "cancelled" | "empty" | "too-large" | "failed";

export interface TerminalExportHost {
  isAlive(): boolean;
  showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
  showMessageBox(options: MessageBoxOptions): Promise<unknown>;
  writeFile(filePath: string, content: string): Promise<void>;
  documentsPath(): string;
  now(): Date;
}

const TITLES: Readonly<Record<TerminalExportKind, string>> = {
  selection: "Export Selection",
  content: "Export Terminal Content",
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
): Promise<TerminalExportOutcome> {
  let noticeStarted = false;
  let writeStarted = false;
  try {
    if (!host.isAlive()) return "cancelled";
    if ("notice" in request) {
      noticeStarted = true;
      await host.showMessageBox({
        type: "warning",
        title: "Export Too Large",
        message: "The requested text exceeds the 16 MiB UTF-8 export limit.",
        detail:
          "Select a smaller portion of the terminal text and export the selection. Nothing was saved or truncated.",
        buttons: ["OK"],
        noLink: true,
      });
      return "too-large";
    }
    const title = TITLES[request.kind];
    if (!/\S/u.test(request.text)) {
      noticeStarted = true;
      await host.showMessageBox({
        type: "info",
        title,
        message:
          request.kind === "selection"
            ? "The selection has no text to export."
            : "The terminal has no text to export.",
        buttons: ["OK"],
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
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
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
          title: "Export Failed",
          message: "OMXTerm could not save the exported text.",
          detail:
            "Try exporting again and choose a writable destination with enough free space.",
          buttons: ["OK"],
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

// A terminal context menu offers one contextual export, chosen when it opens;
// a text field's menu offers only editing actions.
export function popupTerminalContextMenu(
  window: BrowserWindow,
  request: TerminalContextMenuInvocation,
): void {
  const send = (action: TerminalClipboardAction) =>
    window.webContents.send(terminalIpc.clipboardAction, action);
  const kind: TerminalExportKind | undefined =
    request.target === "field"
      ? undefined
      : request.hasSelection
        ? "selection"
        : "content";
  Menu.buildFromTemplate(
    terminalClipboardContextMenuTemplate(
      {
        copy: () => send("copy"),
        paste: () => send("paste"),
        selectAll: () => send("select-all"),
        exportText: () => {
          if (
            kind &&
            request.target === "terminal" &&
            !window.isDestroyed() &&
            !window.webContents.isDestroyed()
          )
            window.webContents.send(terminalIpc.exportRequest, {
              kind,
              contextId: request.contextId,
            });
        },
      },
      kind,
    ),
  ).popup({ window });
}
