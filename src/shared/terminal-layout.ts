import { MAX_PANES_PER_TAB } from "./terminal-panes";
import { isTerminalSessionId } from "./terminal-contract";

export const LAYOUT_MAX_TABS = 16;
export const LAYOUT_MAX_PANES = 32;
export const LAYOUT_MAX_BYTES = 256 * 1024;
export type LayoutNode =
  | { pane: number }
  | { direction: "row" | "column"; children: number[]; weights: number[] };
export type LayoutTab<Pane> = {
  root: number;
  nodes: LayoutNode[];
  focused: number;
  panes: Pane[];
};
export type WindowLayout<Pane> = { selected: number; tabs: LayoutTab<Pane>[] };
export type LayoutDirectory =
  { kind: "home" } | { kind: "reported-local" | "launch-local"; path: string };
export type SavedLayout = WindowLayout<LayoutDirectory> & {
  version: 1;
  platform: "linux" | "darwin" | "win32";
  savedAt: string;
  omitted: number;
};
export type CapturedLayout = WindowLayout<string | null> & { omitted: number };
export type InitialLayout = WindowLayout<string> & { fallbacks: number };

export function exactLayoutKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
const index = (value: unknown, length: number): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < length;

// Adapted from @ruscher's #622 pane coverage/indexing (b3c3a4a); flat nodes
// preserve n-ary trees without spending the extension transport's depth budget.
export function isLayoutTab<Pane>(
  value: unknown,
  isPane: (value: unknown) => value is Pane,
): value is LayoutTab<Pane> {
  if (!exactLayoutKeys(value, ["root", "nodes", "focused", "panes"]))
    return false;
  const { nodes, panes, root, focused } = value;
  if (
    !Array.isArray(panes) ||
    panes.length < 1 ||
    panes.length > MAX_PANES_PER_TAB ||
    !Array.from(panes).every(isPane) ||
    !index(focused, panes.length) ||
    !Array.isArray(nodes) ||
    nodes.length < 1 ||
    nodes.length > 2 * panes.length - 1 ||
    !index(root, nodes.length)
  )
    return false;
  const visited = new Set<number>();
  const covered = new Set<number>();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    if (!index(current, nodes.length) || visited.has(current)) return false;
    visited.add(current);
    const node: unknown = nodes[current];
    if (exactLayoutKeys(node, ["pane"])) {
      if (!index(node.pane, panes.length) || covered.has(node.pane))
        return false;
      covered.add(node.pane);
    } else if (isLayoutSplit(node, nodes.length)) {
      pending.push(...Array.from(node.children));
    } else return false;
  }
  return visited.size === nodes.length && covered.size === panes.length;
}

function isLayoutSplit(
  value: unknown,
  length: number,
): value is Extract<LayoutNode, { children: number[] }> {
  if (!exactLayoutKeys(value, ["direction", "children", "weights"]))
    return false;
  return (
    (value.direction === "row" || value.direction === "column") &&
    Array.isArray(value.children) &&
    value.children.length >= 2 &&
    value.children.length <= MAX_PANES_PER_TAB &&
    Array.isArray(value.weights) &&
    value.weights.length === value.children.length &&
    Array.from(value.weights).every(
      (weight: unknown) =>
        typeof weight === "number" &&
        Number.isFinite(weight) &&
        weight > 0 &&
        weight <= 1,
    ) &&
    Math.abs(
      Array.from(value.weights as number[]).reduce((a, b) => a + b, 0) - 1,
    ) <= 1e-9 &&
    Array.from(value.children).every((child: unknown) => index(child, length))
  );
}

function windowLayout<Pane>(
  value: Record<string, unknown>,
  isPane: (value: unknown) => value is Pane,
): boolean {
  return (
    Array.isArray(value.tabs) &&
    value.tabs.length > 0 &&
    value.tabs.length <= LAYOUT_MAX_TABS &&
    index(value.selected, value.tabs.length) &&
    Array.from(value.tabs).every((tab: unknown) => isLayoutTab(tab, isPane)) &&
    Array.from(value.tabs as LayoutTab<Pane>[]).reduce(
      (count, tab) => count + tab.panes.length,
      0,
    ) <= LAYOUT_MAX_PANES
  );
}
export function isLayoutPath(
  value: unknown,
  platform: string,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/\p{Cc}/u.test(value) &&
    (platform === "win32"
      ? /^[A-Za-z]:[\\/]/u.test(value)
      : value.startsWith("/") && !value.startsWith("//"))
  );
}
export function isSavedLayout(value: unknown): value is SavedLayout {
  if (
    !exactLayoutKeys(value, [
      "version",
      "platform",
      "savedAt",
      "omitted",
      "selected",
      "tabs",
    ]) ||
    value.version !== 1 ||
    typeof value.platform !== "string" ||
    !["linux", "darwin", "win32"].includes(value.platform) ||
    typeof value.savedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.savedAt) ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !count(value.omitted)
  )
    return false;
  const platform = value.platform;
  return (
    windowLayout(
      value,
      (pane): pane is LayoutDirectory =>
        (exactLayoutKeys(pane, ["kind"]) && pane.kind === "home") ||
        (exactLayoutKeys(pane, ["kind", "path"]) &&
          (pane.kind === "reported-local" || pane.kind === "launch-local") &&
          isLayoutPath(pane.path, platform)),
    ) &&
    new TextEncoder().encode(JSON.stringify(value)).length <= LAYOUT_MAX_BYTES
  );
}
function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
export function isCapturedLayout(value: unknown): value is CapturedLayout {
  return (
    exactLayoutKeys(value, ["selected", "tabs", "omitted"]) &&
    count(value.omitted) &&
    windowLayout(
      value,
      (pane): pane is string | null =>
        pane === null || isTerminalSessionId(pane),
    )
  );
}
export function isLayoutToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)
  );
}
export function isInitialLayout(value: unknown): value is InitialLayout {
  if (
    !exactLayoutKeys(value, ["selected", "tabs", "fallbacks"]) ||
    !count(value.fallbacks) ||
    !windowLayout(value, isLayoutToken)
  )
    return false;
  const tokens = Array.from(value.tabs as LayoutTab<string>[]).flatMap(
    (tab) => tab.panes,
  );
  return (
    value.fallbacks <= tokens.length && new Set(tokens).size === tokens.length
  );
}
export const layoutIpc = {
  capture: "terminal:layout-capture",
  captured: "terminal:layout-captured",
  initial: "terminal:layout-initial",
  cancel: "terminal:layout-cancel",
} as const;
export interface TerminalLayoutBridge {
  initial(): Promise<InitialLayout | null>;
  /** `capture` returns null for a window with no terminal tab. */
  onCapture(capture: () => CapturedLayout | null): () => void;
  cancel(token: string): void;
}
