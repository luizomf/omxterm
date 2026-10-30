import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../../shared/i18n";
import type { SettingsResult, SettingsSnapshot } from "../../shared/settings";
import { settingsMessageText } from "../../shared/settings-messages";

export function describeSettingsProblem(
  issue: SettingsSnapshot["problem"],
  t: Translator["t"],
): { text: string; severity: "error" } {
  const detail = issue === undefined ? "" : settingsMessageText(issue, t);
  return {
    text:
      issue === undefined
        ? ""
        : typeof issue !== "string" && issue?.kind === "symlink"
          ? detail
          : `${detail}\n${t("settings.fileGuidance")}`,
    severity: "error",
  };
}

const lifetimes = {
  "new-tabs": "settings.lifetime.tabs",
  "new-windows": "settings.lifetime.windows",
  restart: "settings.lifetime.restart",
} as const;

export function describeSettingsResult(
  result: SettingsResult,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): {
  readonly text: string;
  readonly error: boolean;
  readonly severity: "success" | "warning" | "error";
} {
  if (result.status !== "saved")
    return {
      text: settingsMessageText(result.message, t),
      error: true,
      severity: "error",
    };
  if (!result.application.applied)
    return {
      text: t("settings.notApplied", {
        notice: settingsMessageText(result.application.notice, t),
      }),
      error: true,
      severity: "error",
    };
  return {
    text: [
      t("settings.saved"),
      ...result.lifetimes.map((lifetime) => t(lifetimes[lifetime])),
      ...result.application.notices.map((notice) =>
        settingsMessageText(notice, t),
      ),
    ].join(" "),
    error: false,
    severity: result.application.notices.length > 0 ? "warning" : "success",
  };
}
