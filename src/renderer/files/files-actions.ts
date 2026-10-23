import {
  changeDirectoryCommand,
  isFileName,
  quotePathForShell,
  type FileEntry,
  type FileOperationResult,
  type FileTransfer,
} from "../../shared/file-browser";
import type { Translator } from "../../shared/i18n";
import type { MenuPosition } from "../tab-strip";
import { showContextMenu, type ContextMenuItem } from "../ui/context-menu";
import { confirmAction, promptText } from "../ui/modal";
import { isDirectoryLike } from "./files-list";
import type { FilesSource } from "./files-source";

export interface FilesActionsContext {
  readonly t: Translator["t"];
  readonly typeInTerminal: (text: string, submit: boolean) => void;
  readonly copyText: (text: string) => void;
  readonly notify: (message: string) => void;
  source(): FilesSource | undefined;
  // The listed directory, if any.
  directory(): string | undefined;
  pathOf(entry: FileEntry): string;
  refresh(): Promise<void>;
  activate(entry: FileEntry): void;
  focusList(): void;
  // Remote panes: make the shell report its folder (OSC 7).
  trackRemote(): void;
}

export interface FilesActions {
  create(kind: "folder" | "file"): Promise<void>;
  rename(entry: FileEntry): Promise<void>;
  remove(entries: readonly FileEntry[]): Promise<void>;
  hold(mode: FileTransfer, entries: readonly FileEntry[]): void;
  paste(): Promise<void>;
  upload(): Promise<void>;
  menu(entries: readonly FileEntry[], position: MenuPosition): void;
}

// What can be done to items in the Files panel: name prompts, deletion
// confirmation (trash locally, permanent on a remote host), an in-panel
// clipboard for copy and move, transfers, and the context menu.
export function createFilesActions(
  document: Document,
  context: FilesActionsContext,
): FilesActions {
  const { t } = context;
  let clipboard:
    { mode: FileTransfer; paths: string[]; source: FilesSource } | undefined;
  const report = (result: FileOperationResult, success?: string) => {
    if (!result.ok) context.notify(result.error);
    else if (success) context.notify(success);
    return result.ok;
  };
  const validate = (value: string) =>
    isFileName(value.trim()) ? undefined : t("files.invalidName");
  const platform = () => context.source()?.platform ?? "linux";
  const terminalHere = (directory: string) =>
    context.typeInTerminal(changeDirectoryCommand(directory, platform()), true);

  const actions: FilesActions = {
    async create(kind) {
      const source = context.source();
      const directory = context.directory();
      if (!source || directory === undefined) return;
      const folder = kind === "folder";
      const name = await promptText(document, {
        title: t(folder ? "files.newFolder" : "files.newFile"),
        label: t("common.name"),
        value: t(folder ? "files.newFolderName" : "files.newFileName"),
        confirmLabel: t("common.add"),
        cancelLabel: t("common.cancel"),
        validate,
      });
      if (name === undefined) return;
      const result = await (folder
        ? source.createFolder(directory, name)
        : source.createFile(directory, name));
      if (report(result)) await context.refresh();
    },
    async rename(entry) {
      const source = context.source();
      if (!source) return;
      const name = await promptText(document, {
        title: t("common.rename"),
        label: t("common.name"),
        value: entry.name,
        confirmLabel: t("common.rename"),
        cancelLabel: t("common.cancel"),
        validate,
      });
      if (name === undefined || name === entry.name) return;
      if (report(await source.rename(context.pathOf(entry), name)))
        await context.refresh();
    },
    async remove(entries) {
      const source = context.source();
      if (!source || entries.length === 0) return;
      const remote = source.kind === "remote";
      const confirmed = await confirmAction(document, {
        title: t(remote ? "files.deleteTitle" : "files.trashTitle"),
        message:
          entries.length === 1
            ? t(remote ? "files.deleteOne" : "files.trashOne", {
                name: entries[0]!.name,
              })
            : t(remote ? "files.deleteMany" : "files.trashMany", {
                count: entries.length,
              }),
        confirmLabel: t(remote ? "files.delete" : "files.trash"),
        cancelLabel: t("common.cancel"),
        danger: true,
      });
      if (!confirmed) return;
      const result = await source.remove(entries.map(context.pathOf));
      if (report(result, t(remote ? "files.deleted" : "files.trashed")))
        await context.refresh();
    },
    hold(mode, entries) {
      const source = context.source();
      if (source && entries.length > 0)
        clipboard = { mode, paths: entries.map(context.pathOf), source };
    },
    async paste() {
      const source = context.source();
      const directory = context.directory();
      if (!clipboard || !source || directory === undefined) return;
      // Items move or copy only within the place they were taken from.
      if (clipboard.source !== source) {
        context.notify(t("files.pasteElsewhere"));
        return;
      }
      const { mode, paths } = clipboard;
      const result = await source.transfer(mode, paths, directory);
      if (report(result) && mode === "move") clipboard = undefined;
      await context.refresh();
    },
    async upload() {
      const source = context.source();
      const directory = context.directory();
      if (!source?.upload || directory === undefined) return;
      if (report(await source.upload(directory))) await context.refresh();
    },
    menu(entries, position) {
      showContextMenu(
        document,
        position,
        [...itemMenu(entries), { separator: true }, ...folderMenu()],
        context.focusList,
      );
    },
  };

  const itemMenu = (entries: readonly FileEntry[]): ContextMenuItem[] => {
    const source = context.source();
    if (entries.length === 0 || !source) return [];
    const remote = source.kind === "remote";
    const single = entries.length === 1 ? entries[0] : undefined;
    const paths = entries.map(context.pathOf);
    const files = entries.filter((entry) => !isDirectoryLike(entry));
    const items: ContextMenuItem[] = [];
    if (single)
      items.push({
        label: t(
          remote && !isDirectoryLike(single) ? "files.edit" : "files.open",
        ),
        action: () => context.activate(single),
      });
    if (single && isDirectoryLike(single))
      items.push({
        label: t("files.openInTerminal"),
        action: () => terminalHere(context.pathOf(single)),
      });
    if (source.download && files.length > 0)
      items.push({
        label: t("files.download"),
        action: () =>
          void source.download!(files.map(context.pathOf)).then((result) =>
            report(result),
          ),
      });
    items.push(
      {
        label: t("files.insertPath"),
        action: () =>
          context.typeInTerminal(
            `${paths.map((item) => quotePathForShell(item, platform())).join(" ")} `,
            false,
          ),
      },
      {
        label: t("files.copyPath"),
        action: () => context.copyText(paths.join("\n")),
      },
    );
    if (single && source.reveal)
      items.push({
        label: t("files.reveal"),
        action: () => void source.reveal!(context.pathOf(single)),
      });
    items.push({ separator: true });
    if (single)
      items.push({
        label: t("common.rename"),
        action: () => void actions.rename(single),
      });
    if (!remote)
      items.push({
        label: t("common.copy"),
        action: () => actions.hold("copy", entries),
      });
    items.push(
      { label: t("files.cut"), action: () => actions.hold("move", entries) },
      {
        label: t(remote ? "files.delete" : "files.trash"),
        danger: true,
        action: () => void actions.remove(entries),
      },
    );
    return items;
  };
  const folderMenu = (): ContextMenuItem[] => {
    const source = context.source();
    const directory = context.directory();
    return [
      {
        label: t("files.newFolder"),
        action: () => void actions.create("folder"),
      },
      { label: t("files.newFile"), action: () => void actions.create("file") },
      ...(source?.upload
        ? [{ label: t("files.upload"), action: () => void actions.upload() }]
        : []),
      {
        label: t("files.paste"),
        disabled: clipboard === undefined,
        action: () => void actions.paste(),
      },
      {
        label: t("files.terminalHere"),
        disabled: directory === undefined,
        action: () => directory !== undefined && terminalHere(directory),
      },
      ...(source?.kind === "remote"
        ? [{ label: t("files.trackRemote"), action: context.trackRemote }]
        : []),
    ];
  };
  return actions;
}
