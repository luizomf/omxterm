import { isTerminalTheme, type TerminalTheme } from "./terminal-theme";

export const themeDocumentIpc = {
  open: "settings:theme-document:open",
  save: "settings:theme-document:save",
  import: "settings:theme-document:import",
  export: "settings:theme-document:export",
} as const;

export const THEME_DOCUMENT_PROBLEMS = [
  "read",
  "size",
  "invalid",
  "changed",
  "conflict",
  "exists",
  "symlink",
  "target",
  "write",
  "cleanup",
] as const;
export type ThemeDocumentProblem = (typeof THEME_DOCUMENT_PROBLEMS)[number];
export interface ThemeDocumentFailure {
  readonly status: "failed";
  readonly reason: ThemeDocumentProblem;
  readonly detail?: string;
}
export interface ThemeDocumentBase {
  readonly path: string;
  readonly revision: string;
}
export type ThemeDocumentOpenResult =
  | {
      readonly status: "opened";
      readonly theme: TerminalTheme;
      readonly base?: ThemeDocumentBase;
    }
  | { readonly status: "cancelled" }
  | ThemeDocumentFailure;
export type ThemeDocumentSaveResult =
  | {
      readonly status: "saved";
      readonly base: ThemeDocumentBase;
      readonly warning?: "cleanup";
    }
  | ThemeDocumentFailure;
export type ThemeDocumentExportResult =
  | { readonly status: "exported"; readonly warning?: "cleanup" }
  | { readonly status: "cancelled" }
  | ThemeDocumentFailure;
export interface ThemeDocumentSave {
  readonly theme: TerminalTheme;
  readonly target: ThemeDocumentBase | { readonly newFilename: string };
}
export interface SettingsThemeDocumentsBridge {
  openTheme(path: string): Promise<ThemeDocumentOpenResult>;
  saveTheme(request: ThemeDocumentSave): Promise<ThemeDocumentSaveResult>;
  importTheme(): Promise<ThemeDocumentOpenResult>;
  exportTheme(theme: TerminalTheme): Promise<ThemeDocumentExportResult>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
// A direct logical leaf, not an arbitrary destination. Backslashes can be
// actual POSIX filename characters; main independently enforces OS path rules.
// New filenames receive the stricter portable-name policy in main.
export function isLocalThemeDocumentPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 4096 &&
    value.startsWith("themes/") &&
    value.endsWith(".json") &&
    value.slice(7).length >= 5 &&
    !/[/\0]/u.test(value.slice(7))
  );
}
export function isThemeDocumentBase(
  value: unknown,
): value is ThemeDocumentBase {
  return (
    record(value) &&
    exact(value, ["path", "revision"]) &&
    isLocalThemeDocumentPath(value.path) &&
    typeof value.revision === "string" &&
    /^[a-f0-9]{64}$/u.test(value.revision)
  );
}
export function isThemeDocumentSave(
  value: unknown,
): value is ThemeDocumentSave {
  if (
    !record(value) ||
    !exact(value, ["theme", "target"]) ||
    !isTerminalTheme(value.theme)
  )
    return false;
  const target = value.target;
  return (
    isThemeDocumentBase(target) ||
    (record(target) &&
      exact(target, ["newFilename"]) &&
      typeof target.newFilename === "string" &&
      target.newFilename.length > 0 &&
      target.newFilename.length <= 128 &&
      isLocalThemeDocumentPath(`themes/${target.newFilename}`))
  );
}
function failure(value: Record<string, unknown>): boolean {
  return (
    exact(value, [
      "status",
      "reason",
      ...(value.detail === undefined ? [] : ["detail"]),
    ]) &&
    value.status === "failed" &&
    THEME_DOCUMENT_PROBLEMS.some((reason) => reason === value.reason) &&
    (value.detail === undefined ||
      (typeof value.detail === "string" &&
        value.detail.length <= 256 &&
        !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value.detail)))
  );
}
export function isThemeDocumentOpenResult(
  value: unknown,
): value is ThemeDocumentOpenResult {
  if (!record(value)) return false;
  if (value.status === "cancelled") return exact(value, ["status"]);
  if (value.status === "failed") return failure(value);
  return (
    value.status === "opened" &&
    exact(value, [
      "status",
      "theme",
      ...(value.base === undefined ? [] : ["base"]),
    ]) &&
    isTerminalTheme(value.theme) &&
    (value.base === undefined || isThemeDocumentBase(value.base))
  );
}
export function isThemeDocumentSaveResult(
  value: unknown,
): value is ThemeDocumentSaveResult {
  if (!record(value)) return false;
  if (value.status === "failed") return failure(value);
  return (
    value.status === "saved" &&
    exact(value, [
      "status",
      "base",
      ...(value.warning === undefined ? [] : ["warning"]),
    ]) &&
    isThemeDocumentBase(value.base) &&
    (value.warning === undefined || value.warning === "cleanup")
  );
}
export function isThemeDocumentExportResult(
  value: unknown,
): value is ThemeDocumentExportResult {
  if (!record(value)) return false;
  if (value.status === "cancelled") return exact(value, ["status"]);
  if (value.status === "failed") return failure(value);
  return (
    value.status === "exported" &&
    exact(value, [
      "status",
      ...(value.warning === undefined ? [] : ["warning"]),
    ]) &&
    (value.warning === undefined || value.warning === "cleanup")
  );
}
