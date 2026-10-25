import type { Translator } from "../../shared/i18n";
import type {
  SavedSessionsDocument,
  SessionDefinition,
  SessionFolder,
} from "../../shared/saved-sessions";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { PaneLaunch, TerminalLaunchPlacement } from "../terminal-tabs";
import { failure, sessionLaunch } from "./session-actions";
import {
  paneCountLine,
  sessionDetailLines,
  sessionStatus,
  type SessionPaneCount,
} from "./session-details";
import { sessionSubtitle, type SessionTreeNode } from "./session-tree";
import {
  showFolderMenu,
  showSessionMenu,
  type SessionMenuContext,
} from "./sessions-menus";

const SESSION_DRAG_TYPE = "application/x-omxterm-session";

export interface RowContext {
  readonly document: Document;
  readonly translator: Translator;
  readonly bridge: SessionsBridge;
  readonly list: HTMLElement;
  readonly sessions: () => SavedSessionsDocument;
  readonly expanded: Set<string>;
  readonly open: (
    launch: PaneLaunch,
    placement: TerminalLaunchPlacement,
  ) => void;
  readonly notify: (message: string) => void;
  readonly menu: () => SessionMenuContext;
  readonly render: () => void;
  // Panes of a Saved Session open in this window.
  readonly count: (sessionId: string) => SessionPaneCount;
}

export function focusRow(list: HTMLElement, row: Element | null): void {
  for (const item of list.querySelectorAll<HTMLElement>(".sessions-row"))
    item.tabIndex = item === row ? 0 : -1;
  (row as HTMLElement | null)?.focus();
}

function toggleFolder(context: RowContext, folder: SessionFolder): void {
  if (context.expanded.has(folder.id)) context.expanded.delete(folder.id);
  else context.expanded.add(folder.id);
  context.render();
  focusRow(
    context.list,
    context.list.querySelector(`[data-folder-id="${folder.id}"]`),
  );
}

export function sessionRow(
  context: RowContext,
  session: SessionDefinition,
  depth: number,
  section: "favorites" | "recent" | "tree",
): HTMLElement {
  const { document, translator } = context;
  const t = translator.t.bind(translator);
  const row = document.createElement("div");
  row.className = "sessions-row session";
  row.tabIndex = -1;
  row.setAttribute("role", "treeitem");
  row.dataset.sessionId = session.id;
  row.style.setProperty("--depth", String(depth));
  row.draggable = section === "tree";
  const icon = document.createElement("span");
  icon.className = `sessions-icon ${session.kind}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = session.kind === "ssh" ? "⇄" : "›_";
  if (session.color) icon.style.color = session.color;
  const text = document.createElement("span");
  text.className = "sessions-text";
  const nameLine = document.createElement("span");
  nameLine.className = "sessions-name-line";
  const title = document.createElement("span");
  title.className = "sessions-name";
  title.textContent = session.name;
  const status = document.createElement("span");
  status.className = "sessions-status";
  nameLine.append(title, status);
  const subtitle = document.createElement("span");
  subtitle.className = "sessions-subtitle";
  subtitle.textContent = sessionSubtitle(session);
  text.append(nameLine, subtitle);
  row.append(icon, text);
  applySessionStatus(row, context, session);
  row.setAttribute(
    "aria-label",
    `${t(session.kind === "ssh" ? "sessions.kind.ssh" : "sessions.kind.local")}: ${session.name}`,
  );
  row.addEventListener("dblclick", () =>
    context.open(sessionLaunch(session), "tab"),
  );
  row.addEventListener("click", () => focusRow(context.list, row));
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showSessionMenu(context.menu(), session, {
      x: event.clientX,
      y: event.clientY,
    });
  });
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData(SESSION_DRAG_TYPE, session.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  return row;
}

// The status dot after the name (green: a pane runs; red: every open pane
// has ended; grey: none open here) with the open count inside, and the
// detailed tooltip. Panes changing update existing rows in place.
export function applySessionStatus(
  row: HTMLElement,
  context: Pick<RowContext, "translator" | "sessions" | "count">,
  session: SessionDefinition,
): void {
  const { translator } = context;
  const count = context.count(session.id);
  const state = sessionStatus(count);
  const dot = row.querySelector<HTMLElement>(".sessions-status");
  if (dot) {
    dot.dataset.state = state;
    dot.textContent = count.open > 0 ? String(count.open) : "";
    dot.setAttribute(
      "aria-label",
      count.open > 0
        ? translator.t("sessions.status", {
            open: count.open,
            running: count.running,
          })
        : translator.t("sessions.status.idle"),
    );
    dot.setAttribute("role", "img");
  }
  row.title = [
    session.name,
    ...sessionDetailLines(session, context.sessions(), translator),
    paneCountLine(count, translator),
  ].join("\n");
}

export function folderRow(
  context: RowContext,
  node: Extract<SessionTreeNode, { kind: "folder" }>,
): HTMLElement {
  const { document } = context;
  const row = document.createElement("div");
  row.className = "sessions-row folder";
  row.tabIndex = -1;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-expanded", String(node.expanded));
  row.dataset.folderId = node.folder.id;
  row.style.setProperty("--depth", String(node.depth));
  const chevron = document.createElement("span");
  chevron.className = "sessions-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = node.expanded ? "▾" : "▸";
  const title = document.createElement("span");
  title.className = "sessions-name";
  title.textContent = node.folder.name;
  const count = document.createElement("span");
  count.className = "sessions-count";
  count.textContent = context.translator.formatNumber(node.count);
  row.append(chevron, title, count);
  row.addEventListener("click", () => toggleFolder(context, node.folder));
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showFolderMenu(context.menu(), node.folder, {
      x: event.clientX,
      y: event.clientY,
    });
  });
  row.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes(SESSION_DRAG_TYPE))
      return;
    event.preventDefault();
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
  row.addEventListener("drop", (event) => {
    row.classList.remove("drop-target");
    const id = event.dataTransfer?.getData(SESSION_DRAG_TYPE);
    const session = context.sessions().sessions.find((item) => item.id === id);
    if (!session) return;
    event.preventDefault();
    void context.bridge
      .saveSession({ ...session, folderId: node.folder.id })
      .catch((cause: unknown) =>
        context.notify(
          failure(context.translator.t.bind(context.translator), cause),
        ),
      );
  });
  return row;
}

// Tree keyboard model: arrows move, Right/Left expand or collapse folders,
// Enter opens (Shift+Enter in a split), F2 edits, Delete deletes, and the
// context-menu key or Shift+F10 opens the item menu.
export function handleRowKey(
  context: RowContext,
  event: KeyboardEvent,
): boolean {
  const rows = [...context.list.querySelectorAll<HTMLElement>(".sessions-row")];
  const current = event.target as HTMLElement;
  const index = rows.indexOf(current);
  const document = context.sessions();
  const session = document.sessions.find(
    (item) => item.id === current.dataset.sessionId,
  );
  const folder = document.folders.find(
    (item) => item.id === current.dataset.folderId,
  );
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    focusRow(
      context.list,
      rows[Math.max(0, Math.min(rows.length - 1, next))] ?? null,
    );
    return true;
  }
  if (folder && ["ArrowRight", "ArrowLeft", "Enter"].includes(event.key)) {
    const open = context.expanded.has(folder.id);
    if (event.key === "Enter" || (event.key === "ArrowRight") !== open)
      toggleFolder(context, folder);
    return true;
  }
  if (!session && !folder) return false;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    const rectangle = current.getBoundingClientRect();
    const position = { x: rectangle.left + 16, y: rectangle.bottom };
    if (session) showSessionMenu(context.menu(), session, position);
    else showFolderMenu(context.menu(), folder!, position);
    return true;
  }
  if (!session) return false;
  if (event.key === "Enter") {
    context.open(
      sessionLaunch(session),
      event.shiftKey ? "split-right" : "tab",
    );
    return true;
  }
  if (event.key === "F2" || event.key === "Delete") {
    showSessionMenu(
      context.menu(),
      session,
      null,
      event.key === "F2" ? "edit" : "delete",
    );
    return true;
  }
  return false;
}
