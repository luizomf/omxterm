import type { UiIconName } from "./ui-icons";

// Internal window-content transport; not an extension SDK.
export interface HostedAppearance {
  readonly background: string;
  readonly foreground: string;
  // Effective window tint opacity, not whole-view opacity or a blur command.
  readonly opacity: number;
}
// The icons a side-panel tool can show in the switcher. Main picks one for
// the tools it knows; nothing an extension ships selects or draws an icon.
export const hostedToolIcons = [
  "code",
  "folder",
  "server",
] as const satisfies readonly UiIconName[];
export type HostedToolIcon = (typeof hostedToolIcons)[number];
// "panel" docks a companion tool; "dialog" floats over the selected tab.
export type HostedPresentationKind = "panel" | "dialog";
export interface HostedContentDescriptor {
  id: string;
  title: string;
  // Omission keeps the existing general application-tab presentation.
  presentation?: HostedPresentationKind;
  // A panel tool's switcher icon; without one the panel shows a monogram.
  icon?: HostedToolIcon;
  // Main-issued tool toggle for an already retained companion.
  toggle?: true;
  // One-shot core empty-panel intent, never supplied by extension code.
  panelDefaultToken?: string;
}

export interface HostedContentPresentation {
  id: string | null;
  revision: number;
  bounds: { x: number; y: number; width: number; height: number };
  // true selects the child; "core" hands input back while retaining its pixels.
  focus: boolean | "core" | "restore";
  // Logical selection survives temporary overlay/layout hiding. Older callers
  // without this field retain visibility-based activity.
  activeId?: string | null;
}

// The pixels are presented, but a foreground-only core focus handoff lost
// eligibility. This is recoverable and distinct from failed native hiding.
export type HostedContentPresentationResult = boolean | "focus-unavailable";

export interface HostedContentBridge {
  onOpen(listener: (descriptor: HostedContentDescriptor) => void): () => void;
  onRetired(listener: (id: string) => void): () => void;
  onFailure(listener: () => void): () => void;
  onFocus?(listener: (id: string | null) => void): () => void;
  onDismissPanel?(listener: (id: string) => void): () => void;
  // A dialog-presented view's content height in CSS px, reported by the view.
  onContentHeight?(listener: (id: string, height: number) => void): () => void;
  present(
    presentation: HostedContentPresentation,
  ): Promise<HostedContentPresentationResult>;
  close(id: string): Promise<void>;
}

export const extensionViewIpc = {
  open: "extension-view:open",
  retired: "extension-view:retired",
  present: "extension-view:present",
  failure: "extension-view:failure",
  close: "extension-view:close",
  visibility: "extension-view:visibility",
  actionSelection: "extension-view:action-selection",
  actionAdmission: "extension-view:action-admission",
  appearance: "extension-view:appearance",
  activity: "extension-view:activity",
  language: "extension-view:language",
  focusIntent: "extension-view:focus-intent",
  focus: "extension-view:focus",
  dismissPanel: "extension-view:dismiss-panel",
  contentHeight: "extension-view:content-height",
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

export function isHostedContentHeight(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 10_000
  );
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
  if (value === null || typeof value !== "object") return false;
  // The icon is optional on a panel tool; every other shape stays exact.
  const { icon, ...fields } = value as Record<string, unknown>;
  if (
    Object.hasOwn(value, "icon") &&
    (fields.presentation !== "panel" ||
      !hostedToolIcons.includes(icon as HostedToolIcon))
  )
    return false;
  const rest: unknown = fields;
  return (
    (record(rest, ["id", "title"]) ||
      (record(rest, ["id", "title", "presentation"]) &&
        (rest.presentation === "panel" || rest.presentation === "dialog")) ||
      (record(rest, ["id", "title", "presentation", "panelDefaultToken"]) &&
        rest.presentation === "panel" &&
        typeof rest.panelDefaultToken === "string" &&
        /^[0-9a-f-]{36}$/.test(rest.panelDefaultToken)) ||
      (record(rest, ["id", "title", "presentation", "toggle"]) &&
        rest.presentation === "panel" &&
        rest.toggle === true)) &&
    isHostedContentId(rest.id) &&
    isHostedContentTitle(rest.title)
  );
}

export function isHostedContentPresentation(
  value: unknown,
): value is HostedContentPresentation {
  if (
    !(
      record(value, ["id", "revision", "bounds", "focus"]) ||
      (record(value, ["id", "revision", "bounds", "focus", "activeId"]) &&
        (value.activeId === null || isHostedContentId(value.activeId)))
    ) ||
    !(value.id === null || isHostedContentId(value.id)) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0 ||
    !(
      typeof value.focus === "boolean" ||
      value.focus === "core" ||
      value.focus === "restore"
    ) ||
    ((value.focus === "core" || value.focus === "restore") &&
      value.id === null) ||
    !record(value.bounds, ["x", "y", "width", "height"])
  )
    return false;
  return Object.values(value.bounds).every(
    (n) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100_000,
  );
}
