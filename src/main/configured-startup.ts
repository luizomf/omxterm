import {
  loadUserConfiguration,
  type LoadUserConfigurationOptions,
  type UserConfigurationLoad,
} from "./user-configuration";

export async function startWithUserConfiguration<Result>(
  options: LoadUserConfigurationOptions,
  start: (load: UserConfigurationLoad) => Result | Promise<Result>,
): Promise<Result> {
  const load = await loadUserConfiguration(options);
  return start(load);
}
