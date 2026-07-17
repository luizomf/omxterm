import type { UserConfigurationError } from "./user-configuration";

interface UserConfigurationFailureHost {
  readonly writeStderr: (diagnostic: string) => void;
  readonly showErrorBox: (title: string, message: string) => void;
  readonly quit: () => void;
}

export function reportUserConfigurationFailure(
  failure: UserConfigurationError,
  host: UserConfigurationFailureHost,
): void {
  host.writeStderr(`${failure.message}\n`);
  host.showErrorBox("User Configuration Error", failure.message);
  host.quit();
}
