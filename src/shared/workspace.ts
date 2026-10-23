import {
  isTerminalSessionId,
  type TerminalSessionId,
} from "./terminal-contract";
import {
  isSavedSessionId,
  MAX_QUICK_CONNECT_TARGET_LENGTH,
  RESTORE_TOKEN,
} from "./terminal-launch";

// A serializable description of a layout's shape, used to save and restore
// workspace layouts without process state: each leaf is an index into the
// caller's own list of pane descriptions.
export type SerializedPaneLayout =
  | { readonly pane: number }
  | {
      readonly direction: "row" | "column";
      readonly children: readonly SerializedPaneLayout[];
      readonly weights: readonly number[];
    };

export const MAX_SERIALIZED_PANES = 16;
export const MAX_WORKSPACE_TABS = 64;

export function isSerializedPaneLayout(
  value: unknown,
  depth = 0,
): value is SerializedPaneLayout {
  if (depth > 8 || typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if ("pane" in record)
    return (
      Object.keys(record).length === 1 &&
      Number.isInteger(record.pane) &&
      (record.pane as number) >= 0 &&
      (record.pane as number) < MAX_SERIALIZED_PANES
    );
  const { direction, children, weights } = record;
  return (
    Object.keys(record).length === 3 &&
    (direction === "row" || direction === "column") &&
    Array.isArray(children) &&
    Array.isArray(weights) &&
    children.length >= 2 &&
    children.length <= MAX_SERIALIZED_PANES &&
    weights.length === children.length &&
    weights.every(
      (weight) => typeof weight === "number" && weight > 0 && weight <= 1,
    ) &&
    children.every((child) => isSerializedPaneLayout(child, depth + 1))
  );
}

// True when the layout's leaves are exactly 0..count-1, each once.
export function layoutCoversPanes(
  layout: SerializedPaneLayout,
  count: number,
): boolean {
  const seen: number[] = [];
  const visit = (node: SerializedPaneLayout): void => {
    if ("pane" in node) seen.push(node.pane);
    else node.children.forEach(visit);
  };
  visit(layout);
  return (
    seen.length === count &&
    [...seen].sort((a, b) => a - b).every((pane, index) => pane === index)
  );
}

// A tab's own name, color and group, set from its menu.
export interface WorkspaceTabLook {
  readonly title?: string;
  readonly color?: string;
  readonly group?: {
    readonly name: string;
    readonly color: string;
    readonly collapsed: boolean;
  };
}

const COLOR = /^#[0-9a-fA-F]{6}$/u;
const isColor = (value: unknown): value is string =>
  typeof value === "string" && COLOR.test(value);

function isTabLook(record: Record<string, unknown>): boolean {
  const { title, color, group } = record;
  if (
    title !== undefined &&
    !(typeof title === "string" && title.length > 0 && title.length <= 200)
  )
    return false;
  if (color !== undefined && !isColor(color)) return false;
  if (group === undefined) return true;
  if (!isRecord(group) || !keysAre(group, "name", "color", "collapsed"))
    return false;
  return (
    typeof group.name === "string" &&
    group.name.length > 0 &&
    group.name.length <= 64 &&
    isColor(group.color) &&
    typeof group.collapsed === "boolean"
  );
}

// What a pane was opened as, when the renderer knows more than main can
// infer from its session: a Saved Session or a Quick Connect target.
export type WorkspacePaneLaunch =
  | { readonly kind: "saved-session"; readonly id: string }
  | { readonly kind: "quick-ssh"; readonly target: string };

// Renderer to main: the window's tabs and panes, by session. A window whose
// tabs have all closed reports no tabs.
export interface WorkspaceSnapshot {
  readonly selected: number;
  readonly tabs: readonly (WorkspaceTabLook & {
    readonly layout: SerializedPaneLayout;
    readonly focused: number;
    readonly panes: readonly {
      readonly sessionId: TerminalSessionId | null;
      readonly launch?: WorkspacePaneLaunch;
    }[];
  })[];
}

// Main to renderer: how to reopen one window. Shell panes carry an opaque
// token for their directory; paths never reach the renderer.
export type RestoredPane =
  | { readonly kind: "shell"; readonly token?: string }
  | {
      readonly kind: "saved-session";
      readonly id: string;
      readonly label: string;
      readonly color?: string;
    }
  | { readonly kind: "quick-ssh"; readonly target: string };

export interface WorkspacePlan {
  readonly selected: number;
  readonly tabs: readonly (WorkspaceTabLook & {
    readonly layout: SerializedPaneLayout;
    readonly focused: number;
    readonly panes: readonly RestoredPane[];
  })[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const keysAre = (record: Record<string, unknown>, ...keys: string[]) =>
  Object.keys(record).sort().join(",") === [...keys].sort().join(",");
const isQuickTarget = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_QUICK_CONNECT_TARGET_LENGTH;

export function isWorkspacePaneLaunch(
  value: unknown,
): value is WorkspacePaneLaunch {
  if (!isRecord(value)) return false;
  if (value.kind === "saved-session")
    return keysAre(value, "kind", "id") && isSavedSessionId(value.id);
  return (
    value.kind === "quick-ssh" &&
    keysAre(value, "kind", "target") &&
    isQuickTarget(value.target)
  );
}

function isTabShape<Pane>(
  value: unknown,
  isPane: (pane: unknown) => pane is Pane,
): boolean {
  const allowed = ["layout", "focused", "panes", "title", "color", "group"];
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) => allowed.includes(key)) ||
    !isTabLook(value)
  )
    return false;
  const { layout, focused, panes } = value;
  return (
    Array.isArray(panes) &&
    panes.length >= 1 &&
    panes.length <= MAX_SERIALIZED_PANES &&
    panes.every(isPane) &&
    isSerializedPaneLayout(layout) &&
    layoutCoversPanes(layout, panes.length) &&
    Number.isInteger(focused) &&
    (focused as number) >= 0 &&
    (focused as number) < panes.length
  );
}

export function isWorkspaceWindowShape<Pane>(
  value: unknown,
  isPane: (pane: unknown) => pane is Pane,
  allowEmpty = false,
): boolean {
  if (!isRecord(value) || !keysAre(value, "selected", "tabs")) return false;
  const { selected, tabs } = value;
  if (allowEmpty && Array.isArray(tabs) && tabs.length === 0)
    return selected === 0;
  return (
    Array.isArray(tabs) &&
    tabs.length >= 1 &&
    tabs.length <= MAX_WORKSPACE_TABS &&
    tabs.every((tab) => isTabShape(tab, isPane)) &&
    Number.isInteger(selected) &&
    (selected as number) >= 0 &&
    (selected as number) < tabs.length
  );
}

const isSnapshotPane = (
  value: unknown,
): value is WorkspaceSnapshot["tabs"][number]["panes"][number] =>
  isRecord(value) &&
  (value.sessionId === null || isTerminalSessionId(value.sessionId)) &&
  (keysAre(value, "sessionId") ||
    (keysAre(value, "sessionId", "launch") &&
      isWorkspacePaneLaunch(value.launch)));

export function isWorkspaceSnapshot(
  value: unknown,
): value is WorkspaceSnapshot {
  return isWorkspaceWindowShape(value, isSnapshotPane, true);
}

const isRestoredPane = (value: unknown): value is RestoredPane => {
  if (!isRecord(value)) return false;
  if (value.kind === "shell")
    return (
      keysAre(value, "kind") ||
      (keysAre(value, "kind", "token") &&
        typeof value.token === "string" &&
        RESTORE_TOKEN.test(value.token))
    );
  if (value.kind === "quick-ssh")
    return keysAre(value, "kind", "target") && isQuickTarget(value.target);
  return (
    value.kind === "saved-session" &&
    (keysAre(value, "kind", "id", "label") ||
      (keysAre(value, "kind", "id", "label", "color") &&
        typeof value.color === "string" &&
        /^#[0-9a-fA-F]{6}$/u.test(value.color))) &&
    isSavedSessionId(value.id) &&
    typeof value.label === "string" &&
    value.label.length <= 200
  );
};

export function isWorkspacePlan(value: unknown): value is WorkspacePlan {
  return isWorkspaceWindowShape(value, isRestoredPane);
}
