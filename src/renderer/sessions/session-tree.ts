import type {
  SavedSessionsDocument,
  SessionDefinition,
  SessionFolder,
} from "../../shared/saved-sessions";

export type SessionTreeNode =
  | {
      readonly kind: "folder";
      readonly folder: SessionFolder;
      readonly depth: number;
      readonly expanded: boolean;
      readonly count: number;
    }
  | {
      readonly kind: "session";
      readonly session: SessionDefinition;
      readonly depth: number;
    };

export interface SessionTreeOptions {
  readonly query: string;
  readonly expanded: ReadonlySet<string>;
  readonly compare: (first: string, second: string) => number;
}

// Text a search matches: name, target or directory, and notes.
export function sessionSearchText(session: SessionDefinition): string {
  const target =
    session.kind === "ssh"
      ? `${session.user ?? ""}@${session.host}:${session.port ?? ""}`
      : `${session.workingDirectory ?? ""} ${session.program ?? ""}`;
  return `${session.name}\n${target}\n${session.description ?? ""}`.toLowerCase();
}

export function sessionSubtitle(session: SessionDefinition): string {
  if (session.kind === "ssh") {
    const user = session.user ? `${session.user}@` : "";
    const port =
      session.port !== undefined && session.port !== 22
        ? `:${session.port}`
        : "";
    return `${user}${session.host}${port}`;
  }
  return session.program ?? session.workingDirectory ?? "";
}

// Flattened, visible rows of the folder tree. Folders sort before sessions,
// each alphabetically with locale rules. While searching, matching sessions
// are shown with every ancestor folder expanded; empty folders are hidden.
export function visibleSessionTree(
  document: SavedSessionsDocument,
  options: SessionTreeOptions,
): SessionTreeNode[] {
  const query = options.query.trim().toLowerCase();
  const searching = query.length > 0;
  const childrenOf = (parentId: string | undefined) =>
    document.folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => options.compare(a.name, b.name));
  const sessionsIn = (folderId: string | undefined) =>
    document.sessions
      .filter((session) => session.folderId === folderId)
      .filter(
        (session) => !searching || sessionSearchText(session).includes(query),
      )
      .sort((a, b) => options.compare(a.name, b.name));
  const countIn = (folderId: string): number =>
    sessionsIn(folderId).length +
    childrenOf(folderId).reduce((sum, child) => sum + countIn(child.id), 0);

  const rows: SessionTreeNode[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const folder of childrenOf(parentId)) {
      const count = countIn(folder.id);
      if (searching && count === 0) continue;
      const expanded = searching || options.expanded.has(folder.id);
      rows.push({ kind: "folder", folder, depth, expanded, count });
      if (expanded) visit(folder.id, depth + 1);
    }
    for (const session of sessionsIn(parentId))
      rows.push({ kind: "session", session, depth });
  };
  visit(undefined, 0);
  return rows;
}

export function favoriteSessions(
  document: SavedSessionsDocument,
  compare: (first: string, second: string) => number,
): SessionDefinition[] {
  return document.sessions
    .filter((session) => session.favorite)
    .sort((a, b) => compare(a.name, b.name));
}

export function recentSessions(
  document: SavedSessionsDocument,
  limit = 5,
): SessionDefinition[] {
  return document.sessions
    .filter((session) => session.lastUsedAt !== undefined)
    .sort((a, b) => b.lastUsedAt! - a.lastUsedAt!)
    .slice(0, limit);
}

// Folders a session or folder may move into: never a folder into itself or
// one of its descendants.
export function folderChoices(
  document: SavedSessionsDocument,
  movingFolderId?: string,
): SessionFolder[] {
  const excluded = new Set<string>();
  if (movingFolderId !== undefined) {
    excluded.add(movingFolderId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of document.folders)
        if (
          folder.parentId !== undefined &&
          excluded.has(folder.parentId) &&
          !excluded.has(folder.id)
        ) {
          excluded.add(folder.id);
          changed = true;
        }
    }
  }
  return document.folders.filter((folder) => !excluded.has(folder.id));
}

export function folderPath(
  document: SavedSessionsDocument,
  folderId: string | undefined,
): string {
  const names: string[] = [];
  let current = document.folders.find((folder) => folder.id === folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    const parentId: string | undefined = current.parentId;
    current = document.folders.find((folder) => folder.id === parentId);
  }
  return names.join(" / ");
}

// A unique "Name (2)" style copy name within the same folder.
export function duplicateName(
  document: SavedSessionsDocument,
  session: SessionDefinition,
): string {
  const siblings = new Set(
    document.sessions
      .filter((item) => item.folderId === session.folderId)
      .map((item) => item.name),
  );
  const base = session.name.replace(/ \(\d+\)$/u, "");
  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${index})`;
    if (!siblings.has(candidate)) return candidate.slice(0, 128);
  }
}
