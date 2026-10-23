import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { writeAtomically } from "./application-data";
import { completeConfigurationFile } from "./complete-configuration";
import { createInitialConfigurationKit } from "./initial-configuration-kit";
import {
  loadUserConfiguration,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
  type UserConfigurationLoad,
} from "./user-configuration";

export async function startWithUserConfiguration<Result>(
  options: LoadUserConfigurationOptions,
  start: (load: UserConfigurationLoad) => Result | Promise<Result>,
): Promise<Result> {
  const notice = await createInitialConfigurationKit(options);
  const load = await loadUserConfiguration(options);
  // A valid config.json gains the settings it does not list yet.
  if (!load.fallback)
    await completeConfigurationFile(
      resolveUserConfigurationPath(options.environment, options.homeDirectory),
      load.configuration,
      {
        read: (filePath) => readFile(filePath),
        write: (filePath, text) =>
          writeAtomically({ mkdir, open, rename, rm }, filePath, text),
      },
    ).catch(() => false);
  return start(
    notice ? { ...load, warnings: [...(load.warnings ?? []), notice] } : load,
  );
}
