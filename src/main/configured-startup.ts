import type { UserConfiguration } from "../shared/user-configuration";
import {
  loadUserConfiguration,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

export async function startWithUserConfiguration<Result>(
  options: LoadUserConfigurationOptions,
  start: (configuration: UserConfiguration) => Result | Promise<Result>,
): Promise<Result> {
  const configuration = await loadUserConfiguration(options);
  return start(configuration);
}
