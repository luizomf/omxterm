import type { SettingsThemesResult } from "../../src/shared/settings-themes";

export const emptyThemes: SettingsThemesResult = {
  status: "ok",
  themes: [],
  invalid: [],
  truncated: false,
  hasConfiguredTheme: false,
};
