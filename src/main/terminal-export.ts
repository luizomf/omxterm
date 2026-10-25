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
import {
  MAX_TERMINAL_EXPORT_BYTES,
  type TerminalClipboardAction,
  type TerminalContextMenuRequest,
  type TerminalExportKind,
  type TerminalExportRequest,
} from "../shared/terminal-contract";
import { terminalClipboardContextMenuTemplate } from "./application-menu";
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
// Cancellation writes nothing; the destination and text are never logged. Every
// other outcome is reported once, in the requesting window.
export async function saveTerminalExport(
  request: TerminalExportRequest,
  host: TerminalExportHost,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): Promise<TerminalExportOutcome> {
  const title = t(TITLES[request.kind]);
  const subject = request.kind === "selection" ? "selection" : "terminal";
  // A notice that cannot be shown, such as after its window closed, is dropped.
  const notify = async (
    options: Pick<MessageBoxOptions, "type" | "message" | "detail"> &
      Partial<Pick<MessageBoxOptions, "title">>,
  ) => {
    try {
      await host.showMessageBox({
        title,
        buttons: [t("common.ok")],
        noLink: true,
        ...options,
      });
    } catch {
      // Nothing else can report it.
    }
  };
  if ("overLimit" in request) {
    await notify({
      type: "error",
      message: t(
        subject === "selection"
          ? "export.overLimit.selection"
          : "export.overLimit.content",
        { limit: EXPORT_LIMIT_MIB },
      ),
      detail: t(
        subject === "selection"
          ? "export.overLimit.selectionDetail"
          : "export.overLimit.contentDetail",
      ),
    });
    return "too-large";
  }
  if (!/\S/u.test(request.text)) {
    await notify({
      type: "info",
      message: t(
        subject === "selection"
          ? "export.empty.selection"
          : "export.empty.content",
      ),
    });
    return "empty";
  }
  let choice: SaveDialogReturnValue;
  try {
    choice = await host.showSaveDialog({
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
  } catch {
    await notify({
      type: "error",
      title: t("export.failed"),
      message: t("export.dialogError"),
    });
    return "failed";
  }
  if (choice.canceled || !choice.filePath) return "cancelled";
  try {
    await host.writeFile(
      choice.filePath,
      terminalExportFileContent(request.text),
    );
    return "saved";
  } catch (cause) {
    await notify({
      type: "error",
      title: t("export.failed"),
      message: t("export.writeError"),
      detail: cause instanceof Error ? cause.message : String(cause),
    });
    return "failed";
  }
}

// A closed window owns no dialogs: its pending export ends without reports.
export function electronTerminalExportHost(
  window: BrowserWindow,
): TerminalExportHost {
  return {
    showSaveDialog: async (options) =>
      window.isDestroyed()
        ? { canceled: true, filePath: "" }
        : dialog.showSaveDialog(window, options),
    showMessageBox: async (options) => {
      if (!window.isDestroyed()) await dialog.showMessageBox(window, options);
    },
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
  request: TerminalContextMenuRequest,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
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
          if (kind) window.webContents.send(terminalIpc.exportRequest, kind);
        },
      },
      kind,
      t,
    ),
  ).popup({ window });
}
