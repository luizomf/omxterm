import path from "node:path";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "../shared/user-configuration";
import { UserConfigurationError } from "./user-configuration-error";

// `notifications`: desktop notifications on by default, sound off, and an
// optional absolute path to the user's own sound file (ADR 0053).
export function notificationPreferences(
  root: Readonly<Record<string, unknown>>,
  configurationPath: string,
  platform: string,
): NotificationPreferences {
  const value = root.notifications;
  if (value === undefined) return DEFAULT_NOTIFICATION_PREFERENCES;
  const fail = (location: string, reason: string): never => {
    throw new UserConfigurationError(configurationPath, location, reason);
  };
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("notifications", "must be an object");
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find(
    (key) => !["enabled", "sound", "soundFile"].includes(key),
  );
  if (unknown !== undefined) fail(`notifications.${unknown}`, "is unknown");
  const flag = (key: "enabled" | "sound") => {
    const flagValue = record[key];
    if (flagValue === undefined) return DEFAULT_NOTIFICATION_PREFERENCES[key];
    if (typeof flagValue !== "boolean")
      fail(`notifications.${key}`, "must be a boolean");
    return flagValue as boolean;
  };
  const { soundFile } = record;
  if (
    soundFile !== undefined &&
    (typeof soundFile !== "string" ||
      soundFile.length > 4_096 ||
      soundFile.includes("\0") ||
      !(platform === "win32" ? path.win32 : path.posix).isAbsolute(soundFile))
  )
    fail("notifications.soundFile", "must be an absolute file path");
  return Object.freeze({
    enabled: flag("enabled"),
    sound: flag("sound"),
    ...(typeof soundFile === "string" ? { soundFile } : {}),
  });
}
