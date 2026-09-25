import { createInitialConfigurationKit } from "./initial-configuration-kit";
import {
  loadUserConfiguration,
  type LoadUserConfigurationOptions,
  type UserConfigurationLoad,
} from "./user-configuration";

export async function startWithUserConfiguration<Result>(
  options: LoadUserConfigurationOptions,
  start: (load: UserConfigurationLoad) => Result | Promise<Result>,
): Promise<Result> {
  const notice = await createInitialConfigurationKit(options);
  const load = await loadUserConfiguration(options);
  return start(
    notice ? { ...load, warnings: [...(load.warnings ?? []), notice] } : load,
  );
}
