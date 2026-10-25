import type { Translator } from "../../shared/i18n";
import type { OpenSessionPane } from "./session-activity";
import type {
  SavedSessionsDocument,
  SessionDefinition,
  SessionFolder,
} from "../../shared/saved-sessions";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { PaneLaunch, TerminalLaunchPlacement } from "../terminal-tabs";
import { showContextMenu, type ContextMenuItem } from "../ui/context-menu";
import { confirmAction, promptText } from "../ui/modal";
import { editSession } from "./session-editor";
import { duplicateName, folderChoices, folderPath } from "./session-tree";
import { failure, sessionLaunch } from "./session-actions";

export interface SessionMenuContext {
  readonly document: Document;
  readonly translator: Translator;
  readonly bridge: SessionsBridge;
  readonly sessions: SavedSessionsDocument;
  readonly open: (
    launch: PaneLaunch,
    placement: TerminalLaunchPlacement,
  ) => void;
  readonly notify: (message: string) => void;
  readonly expandFolder: (id: string) => void;
  // A session's panes open in this window, and revealing one.
  readonly openPanes?: (sessionId: string) => readonly OpenSessionPane[];
  readonly reveal?: (pane: OpenSessionPane) => void;
}

type Position = { readonly x: number; readonly y: number };

const MAX_MOVE_TARGETS = 12;

function run(
  context: SessionMenuContext,
  action: () => Promise<unknown>,
): void {
  void action().catch((cause: unknown) =>
    context.notify(
      failure(context.translator.t.bind(context.translator), cause),
    ),
  );
}

function editorContext(context: SessionMenuContext) {
  return {
    document: context.document,
    translator: context.translator,
    sessions: context.sessions,
    chooseFile: context.bridge.chooseFile,
    save: context.bridge.saveSession,
    passwordState: context.bridge.passwordState,
    setPassword: context.bridge.setPassword,
  };
}

async function deleteSession(
  context: SessionMenuContext,
  session: SessionDefinition,
) {
  const t = context.translator.t.bind(context.translator);
  const confirmed = await confirmAction(context.document, {
    title: t("common.delete"),
    message: t("sessions.deleteConfirm", { name: session.name }),
    confirmLabel: t("common.delete"),
    cancelLabel: t("common.cancel"),
    danger: true,
  });
  if (confirmed) await context.bridge.deleteSession(session.id);
}

// The session's panes open in this window, first in its menu: choosing one
// selects its tab and focuses the pane.
function openPaneItems(
  context: SessionMenuContext,
  session: SessionDefinition,
): ContextMenuItem[] {
  const panes = context.openPanes?.(session.id) ?? [];
  const reveal = context.reveal;
  if (panes.length === 0 || !reveal) return [];
  const t = context.translator.t.bind(context.translator);
  return [
    { label: t("sessions.openHere"), action: () => {}, disabled: true },
    ...panes.map((pane): ContextMenuItem => {
      const label =
        pane.paneCount > 1
          ? t("sessions.openPaneSplit", {
              tab: pane.tabNumber,
              pane: pane.paneNumber,
              title: pane.title,
            })
          : t("sessions.openPane", { tab: pane.tabNumber, title: pane.title });
      return {
        label: pane.ended ? t("sessions.openPaneEnded", { label }) : label,
        action: () => reveal(pane),
      };
    }),
    { separator: true },
  ];
}

export function showSessionMenu(
  context: SessionMenuContext,
  session: SessionDefinition,
  position: Position | null,
  direct?: "edit" | "delete",
): void {
  const t = context.translator.t.bind(context.translator);
  if (direct === "edit") {
    run(context, () => editSession(editorContext(context), session));
    return;
  }
  if (direct === "delete") {
    run(context, () => deleteSession(context, session));
    return;
  }
  const open = (placement: TerminalLaunchPlacement) => () =>
    context.open(sessionLaunch(session), placement);
  const moveTargets = folderChoices(context.sessions)
    .filter((folder) => folder.id !== session.folderId)
    .slice(0, MAX_MOVE_TARGETS)
    .map((folder): ContextMenuItem => ({
      label: t("sessions.moveTo", {
        folder: folderPath(context.sessions, folder.id),
      }),
      action: () =>
        run(context, () =>
          context.bridge.saveSession({ ...session, folderId: folder.id }),
        ),
    }));
  const items: ContextMenuItem[] = [
    ...openPaneItems(context, session),
    { label: t("sessions.openInNewTab"), action: open("tab") },
    {
      label: `${t("sessions.openInSplit")} → ${t("pane.splitRight")}`,
      action: open("split-right"),
    },
    {
      label: `${t("sessions.openInSplit")} → ${t("pane.splitDown")}`,
      action: open("split-down"),
    },
    { separator: true },
    {
      label: `${t("common.edit")}…`,
      action: () =>
        run(context, () => editSession(editorContext(context), session)),
    },
    {
      label: t("common.duplicate"),
      action: () =>
        run(context, () => {
          const { id: _id, lastUsedAt: _used, ...copy } = session;
          return context.bridge.saveSession({
            ...copy,
            name: duplicateName(context.sessions, session),
          });
        }),
    },
    {
      label: session.favorite
        ? t("sessions.unfavorite")
        : t("sessions.favorite"),
      action: () =>
        run(context, () => {
          const { favorite: _favorite, ...rest } = session;
          return context.bridge.saveSession(
            session.favorite ? rest : { ...rest, favorite: true },
          );
        }),
    },
    ...(moveTargets.length > 0 || session.folderId
      ? [{ separator: true } as const, ...moveTargets]
      : []),
    ...(session.folderId
      ? [
          {
            label: t("sessions.moveToRoot"),
            action: () =>
              run(context, () => {
                const { folderId: _folder, ...rest } = session;
                return context.bridge.saveSession(rest);
              }),
          },
        ]
      : []),
    { separator: true },
    {
      label: t("common.delete"),
      danger: true,
      action: () => run(context, () => deleteSession(context, session)),
    },
  ];
  showContextMenu(context.document, position ?? { x: 48, y: 96 }, items);
}

async function newFolder(context: SessionMenuContext, parentId?: string) {
  const t = context.translator.t.bind(context.translator);
  const name = await promptText(context.document, {
    title: parentId ? t("sessions.newSubfolder") : t("sessions.newFolder"),
    label: t("common.name"),
    confirmLabel: t("common.save"),
    cancelLabel: t("common.cancel"),
    validate: (value) =>
      value.trim().length === 0 ? t("sessions.validation.name") : undefined,
  });
  if (!name) return;
  const folder = await context.bridge.saveFolder({
    name,
    ...(parentId ? { parentId } : {}),
  });
  if (parentId) context.expandFolder(parentId);
  context.expandFolder(folder.id);
}

export function showFolderMenu(
  context: SessionMenuContext,
  folder: SessionFolder,
  position: Position,
): void {
  const t = context.translator.t.bind(context.translator);
  const count = context.sessions.sessions.filter(
    (session) => session.folderId === folder.id,
  ).length;
  showContextMenu(context.document, position, [
    {
      label: t("sessions.new"),
      action: () =>
        run(context, () =>
          editSession(editorContext(context), undefined, folder.id),
        ),
    },
    {
      label: t("sessions.newSubfolder"),
      action: () => run(context, () => newFolder(context, folder.id)),
    },
    {
      label: t("sessions.renameFolder"),
      action: () =>
        run(context, async () => {
          const name = await promptText(context.document, {
            title: t("sessions.renameFolder"),
            label: t("common.name"),
            value: folder.name,
            confirmLabel: t("common.save"),
            cancelLabel: t("common.cancel"),
            validate: (value) =>
              value.trim().length === 0
                ? t("sessions.validation.name")
                : undefined,
          });
          if (name) await context.bridge.saveFolder({ ...folder, name });
        }),
    },
    { separator: true },
    {
      label: t("sessions.deleteFolder"),
      danger: true,
      action: () =>
        run(context, async () => {
          const confirmed = await confirmAction(context.document, {
            title: t("sessions.deleteFolder"),
            message: t("sessions.folderDeleteConfirm", {
              name: folder.name,
              count,
            }),
            confirmLabel: t("common.delete"),
            cancelLabel: t("common.cancel"),
            danger: true,
          });
          if (confirmed) await context.bridge.deleteFolder(folder.id);
        }),
    },
  ]);
}

export function showPanelMenu(
  context: SessionMenuContext,
  anchor: HTMLElement,
  kind: "new" | "more",
): void {
  const t = context.translator.t.bind(context.translator);
  const rectangle = anchor.getBoundingClientRect();
  const position = { x: rectangle.left, y: rectangle.bottom + 4 };
  const items: ContextMenuItem[] =
    kind === "new"
      ? [
          {
            label: t("sessions.new"),
            action: () =>
              run(context, () => editSession(editorContext(context))),
          },
          {
            label: t("sessions.newFolder"),
            action: () => run(context, () => newFolder(context)),
          },
        ]
      : [
          {
            label: t("sessions.importSshConfig"),
            action: () =>
              run(context, async () => {
                const { added } = await context.bridge.importSshConfig();
                context.notify(t("sessions.importedHosts", { count: added }));
              }),
          },
          {
            label: t("sessions.import"),
            action: () =>
              run(context, async () => {
                const result = await context.bridge.importFile();
                if (result)
                  context.notify(
                    t("sessions.importedSessions", { count: result.added }),
                  );
              }),
          },
          {
            label: t("sessions.export"),
            action: () =>
              run(context, async () => {
                if (await context.bridge.exportFile())
                  context.notify(t("sessions.exported"));
              }),
          },
        ];
  showContextMenu(context.document, position, items);
}
