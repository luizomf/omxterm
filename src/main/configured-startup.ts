import {
  loadUserConfiguration,
  type LoadUserConfigurationOptions,
  type LoadedUserConfiguration,
} from "./user-configuration";

export async function startWithUserConfiguration<Result>(
  options: LoadUserConfigurationOptions,
  start: (configuration: LoadedUserConfiguration) => Result | Promise<Result>,
): Promise<Result> {
  const configuration = await loadUserConfiguration(options);
  return start(configuration);
}
