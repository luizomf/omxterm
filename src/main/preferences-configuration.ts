import { readFile } from "node:fs/promises";
import type { PreferencesServiceOptions } from "./preferences-service";
import {
  loadUserConfiguration,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

// How the Preferences dialog reaches config.json: its path, and validation of
// candidate bytes through the same loader a reload uses.
export function preferencesConfiguration(
  loadOptions: LoadUserConfigurationOptions,
  active: PreferencesServiceOptions["active"],
): Pick<
  PreferencesServiceOptions,
  "configurationPath" | "platform" | "validate" | "active"
> {
  const configurationPath = resolveUserConfigurationPath(
    loadOptions.environment,
    loadOptions.homeDirectory,
  );
  return {
    configurationPath,
    platform: loadOptions.platform ?? process.platform,
    active,
    validate: (bytes) =>
      loadUserConfiguration({
        ...loadOptions,
        read: (async (filePath: Parameters<typeof readFile>[0]) =>
          filePath === configurationPath
            ? bytes
            : readFile(filePath)) as typeof readFile,
      }),
  };
}
