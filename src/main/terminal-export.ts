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
  TerminalContextMenuRequest,
  TerminalExportKind,
  TerminalExportRequest,
} from "../shared/terminal-contract";
import { terminalClipboardContextMenuTemplate } from "./application-menu";

export type TerminalExportOutcome = "saved" | "cancelled" | "empty" | "failed";

export interface TerminalExportHost {
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
  request: TerminalExportRequest,
  host: TerminalExportHost,
): Promise<TerminalExportOutcome> {
  const title = TITLES[request.kind];
  if (!/\S/u.test(request.text)) {
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
  if (choice.canceled || !choice.filePath) return "cancelled";
  try {
    await host.writeFile(
      choice.filePath,
      terminalExportFileContent(request.text),
    );
    return "saved";
  } catch (cause) {
    await host.showMessageBox({
      type: "error",
      title: "Export Failed",
      message: "OMXTerm could not save the exported text.",
      detail: cause instanceof Error ? cause.message : String(cause),
      buttons: ["OK"],
      noLink: true,
    });
    return "failed";
  }
}

export function electronTerminalExportHost(
  window: BrowserWindow,
): TerminalExportHost {
  return {
    showSaveDialog: (options) => dialog.showSaveDialog(window, options),
    showMessageBox: (options) => dialog.showMessageBox(window, options),
    writeFile: (filePath, content) =>
      writeFile(filePath, content, { encoding: "utf8", mode: 0o600 }),
    documentsPath: () => app.getPath("documents"),
    now: () => new Date(),
  };
}

// The context menu offers one contextual export, chosen when it opens.
export function popupTerminalContextMenu(
  window: BrowserWindow,
  request: TerminalContextMenuRequest,
): void {
  const send = (action: TerminalClipboardAction) =>
    window.webContents.send(terminalIpc.clipboardAction, action);
  const kind: TerminalExportKind = request.hasSelection
    ? "selection"
    : "content";
  Menu.buildFromTemplate(
    terminalClipboardContextMenuTemplate(
      {
        copy: () => send("copy"),
        paste: () => send("paste"),
        selectAll: () => send("select-all"),
        exportText: () =>
          window.webContents.send(terminalIpc.exportRequest, kind),
      },
      kind,
    ),
  ).popup({ window });
}
