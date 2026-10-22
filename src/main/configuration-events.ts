import { hasExactKeys, isNonnegativeSafeInteger } from "./event-validation";

export type ConfigurationFailureReason =
  | "read-failed"
  | "invalid-utf8"
  | "invalid-json"
  | "invalid-schema"
  | "font-discovery-failed"
  | "theme-read-failed"
  | "theme-invalid";

export const configurationFailureReasons: readonly ConfigurationFailureReason[] =
  [
    "read-failed",
    "invalid-utf8",
    "invalid-json",
    "invalid-schema",
    "font-discovery-failed",
    "theme-read-failed",
    "theme-invalid",
  ];

export function isConfigurationEvent(value: Record<string, unknown>): boolean {
  if (value.name === "configuration.validated")
    return hasExactKeys(value, ["name"]);
  if (value.name === "configuration.rejected")
    return (
      hasExactKeys(value, ["name", "reason"]) &&
      configurationFailureReasons.includes(
        value.reason as ConfigurationFailureReason,
      )
    );
  if (
    value.name === "configuration.reload.requested" ||
    value.name === "configuration.reload.succeeded"
  )
    return (
      hasExactKeys(value, ["name", "trigger", "durationMs"]) &&
      value.trigger === "manual" &&
      isReloadDuration(value.durationMs)
    );
  return (
    value.name === "configuration.reload.rejected" &&
    hasExactKeys(value, ["name", "trigger", "durationMs", "reason"]) &&
    value.trigger === "manual" &&
    isReloadDuration(value.durationMs) &&
    (configurationFailureReasons.includes(
      value.reason as ConfigurationFailureReason,
    ) ||
      value.reason === "unexpected-failure")
  );
}

function isReloadDuration(value: unknown): value is number {
  return isNonnegativeSafeInteger(value) && value <= 86_400_000;
}
