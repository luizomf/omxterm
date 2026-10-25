import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../../shared/i18n";
import type { SettingsResult } from "../../shared/settings";
import { settingsMessageText } from "../../shared/settings-messages";

const lifetimes = {
  "new-tabs": "settings.lifetime.tabs",
  "new-windows": "settings.lifetime.windows",
  restart: "settings.lifetime.restart",
} as const;

export function describeSettingsResult(
  result: SettingsResult,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): { readonly text: string; readonly error: boolean } {
  if (result.status !== "saved")
    return { text: settingsMessageText(result.message, t), error: true };
  if (!result.application.applied)
    return {
      text: t("settings.notApplied", {
        notice: settingsMessageText(result.application.notice, t),
      }),
      error: true,
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
  };
}
