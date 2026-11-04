// Development-preview management only. No paths, executable text or caller-owned
// window identity cross this bridge.
export const extensionsIpc = "omxterm:extensions";

// The installer and hosted resource reader admit the same portable URL paths.
export function isExtensionResource(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 512 &&
    value
      .split("/")
      .every(
        (part) =>
          /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !part.endsWith("."),
      )
  );
}
export type ExtensionEntry = {
  id: string;
  generation: number;
  name: string;
  version: string | null;
  installed: boolean;
  enabled: boolean;
  local: string;
};
export type CatalogCard = {
  selection: string;
  id: string;
  name: string;
  description: string;
  version: string;
  installedVersion: string | null;
  compatible: boolean;
  targets: string[];
  incompatibility: "platform" | "engine" | "platform-and-engine" | null;
  action: "install" | "update" | "reinstall" | "replace";
};
export type CatalogSnapshot = {
  loaded: boolean;
  stale: boolean;
  entries: CatalogCard[];
};
export type ExtensionsResult = {
  catalog?: CatalogSnapshot;
  ok: boolean;
  error?: string;
  entries?: ExtensionEntry[];
  pendingCleanup?: boolean | undefined;
  openToken?: string;
  noticeEmpty?: boolean;
};
export type ExtensionsRequest =
  | { operation: "snapshot" | "install" | "panel-default" }
  | { operation: "cancel-panel-default"; token: string }
  | { operation: "catalog-refresh"; token: string }
  | { operation: "catalog-install"; selection: string; token: string }
  | { operation: "install-link"; url: string; token: string }
  | { operation: "cancel-install"; token: string }
  | { operation: "open"; token: string; accepted: boolean }
  | {
      operation: "enable" | "disable" | "uninstall";
      id: string;
      generation: number;
    };
export type ExtensionsBridge = {
  request(request: ExtensionsRequest): Promise<ExtensionsResult>;
};
function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
}
function isLinkRequest(item: Record<string, unknown>): boolean {
  return (
    Object.keys(item).length === (item.operation === "install-link" ? 3 : 2) &&
    isToken(item.token) &&
    (item.operation === "cancel-install" ||
      (typeof item.url === "string" &&
        item.url.length > 0 &&
        item.url.length <= 8192))
  );
}
function isCatalogRequest(item: Record<string, unknown>): boolean {
  return (
    Object.keys(item).length ===
      (item.operation === "catalog-refresh" ? 2 : 3) &&
    isToken(item.token) &&
    (item.operation === "catalog-refresh" || isToken(item.selection))
  );
}
export function isExtensionsRequest(
  value: unknown,
): value is ExtensionsRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    item.operation === "catalog-refresh" ||
    item.operation === "catalog-install"
  )
    return isCatalogRequest(item);
  if (item.operation === "install-link" || item.operation === "cancel-install")
    return isLinkRequest(item);
  if (item.operation === "cancel-panel-default")
    return Object.keys(item).length === 2 && isToken(item.token);
  if (item.operation === "open")
    return (
      Object.keys(item).length === 3 &&
      isToken(item.token) &&
      typeof item.accepted === "boolean"
    );
  if (["snapshot", "install", "panel-default"].includes(String(item.operation)))
    return Object.keys(item).length === 1;
  return (
    ["enable", "disable", "uninstall"].includes(String(item.operation)) &&
    Object.keys(item).length === 3 &&
    typeof item.id === "string" &&
    item.id.length <= 128 &&
    /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(item.id) &&
    typeof item.generation === "number" &&
    Number.isSafeInteger(item.generation) &&
    item.generation > 0
  );
}
