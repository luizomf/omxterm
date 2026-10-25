import { translatorFor, DEFAULT_LANGUAGE, type Translator } from "./i18n";
import { MAX_USER_FILE_ERROR_LENGTH } from "./user-configuration";

// Only Settings/reload-owned frames cross this seam as identity. Validator and
// warning detail is literal text, even when it happens to equal an English UI label.
export type SettingsMessage =
  | string
  | {
      readonly kind:
        | "read"
        | "utf8"
        | "json"
        | "object"
        | "symlink"
        | "conflict"
        | "write"
        | "application";
    }
  | { readonly kind: "reload"; readonly detail?: string }
  | {
      readonly kind: "deferred";
      readonly fields: readonly ("font.family" | "font.lineHeight")[];
    };

const frames = {
  read: "settings.readError",
  utf8: "settings.utf8Error",
  json: "settings.jsonError",
  object: "settings.objectError",
  symlink: "settings.symlinkError",
  conflict: "settings.conflict",
  write: "settings.writeError",
  application: "settings.applicationError",
} as const;

export function settingsMessageText(
  message: SettingsMessage,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): string {
  if (typeof message === "string") return message;
  if (message.kind === "reload") {
    const frame = t("notice.reloadFailed", { detail: "{detail}" });
    const detail = message.detail ?? t("notice.reloadUnexpected");
    const available =
      MAX_USER_FILE_ERROR_LENGTH - frame.length + "{detail}".length;
    return frame.replace("{detail}", () =>
      detail.slice(0, Math.max(0, available)),
    );
  }
  if (message.kind === "deferred") {
    const fields = message.fields;
    const settings =
      fields.length === 1
        ? fields[0]!
        : t("notice.and", { first: fields[0]!, second: fields[1]! });
    return t("notice.restartDeferred", { count: fields.length, settings });
  }
  return t(frames[message.kind]);
}

export function isSettingsMessage(value: unknown): value is SettingsMessage {
  if (typeof value === "string") return value.length <= 65_536;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  const keys = Object.keys(message);
  if (!Object.hasOwn(message, "kind") || typeof message.kind !== "string")
    return false;
  if (Object.hasOwn(frames, message.kind)) return keys.length === 1;
  if (message.kind === "reload")
    return (
      keys.every((key) => ["kind", "detail"].includes(key)) &&
      (message.detail === undefined ||
        (typeof message.detail === "string" && message.detail.length <= 65_536))
    );
  return (
    message.kind === "deferred" &&
    keys.length === 2 &&
    keys.every((key) => key === "kind" || key === "fields") &&
    Array.isArray(message.fields) &&
    message.fields.length > 0 &&
    message.fields.length <= 2 &&
    new Set(message.fields).size === message.fields.length &&
    message.fields.every(
      (field: unknown) =>
        field === "font.family" || field === "font.lineHeight",
    )
  );
}
