// Internal application-tab transport; not an extension SDK.
export interface HostedContentDescriptor {
  id: string;
  title: string;
}

export interface HostedContentPresentation {
  id: string | null;
  revision: number;
  bounds: { x: number; y: number; width: number; height: number };
  // true selects the child; "core" hands input back while retaining its pixels.
  focus: boolean | "core";
}

export interface HostedContentBridge {
  onOpen(listener: (descriptor: HostedContentDescriptor) => void): () => void;
  onRetired(listener: (id: string) => void): () => void;
  onFailure(listener: () => void): () => void;
  present(presentation: HostedContentPresentation): Promise<boolean>;
  close(id: string): Promise<void>;
}

export const extensionViewIpc = {
  open: "extension-view:open",
  retired: "extension-view:retired",
  present: "extension-view:present",
  failure: "extension-view:failure",
  close: "extension-view:close",
  visibility: "extension-view:visibility",
} as const;

function record(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function isHostedContentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
}

export function isHostedContentTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isHostedContentDescriptor(
  value: unknown,
): value is HostedContentDescriptor {
  return (
    record(value, ["id", "title"]) &&
    isHostedContentId(value.id) &&
    isHostedContentTitle(value.title)
  );
}

export function isHostedContentPresentation(
  value: unknown,
): value is HostedContentPresentation {
  if (
    !record(value, ["id", "revision", "bounds", "focus"]) ||
    !(value.id === null || isHostedContentId(value.id)) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0 ||
    !(typeof value.focus === "boolean" || value.focus === "core") ||
    (value.focus === "core" && value.id === null) ||
    !record(value.bounds, ["x", "y", "width", "height"])
  )
    return false;
  return Object.values(value.bounds).every(
    (n) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100_000,
  );
}
