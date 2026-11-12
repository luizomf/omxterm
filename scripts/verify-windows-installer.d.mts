export interface WindowsInstallationRegistration {
  readonly hive: "CurrentUser" | "LocalMachine";
  readonly view: "Registry32" | "Registry64";
  readonly kind: "install" | "uninstall";
  readonly location: string | null;
  readonly uninstall: string | null;
  readonly shortcut: string | null;
  readonly menu: string | null;
}
export interface WindowsInstallationState {
  readonly existing: boolean;
  readonly processes: boolean;
  readonly registrations: readonly WindowsInstallationRegistration[];
  readonly paths: readonly {
    readonly path: string;
    readonly scope: "user" | "machine";
    readonly kind: "install" | "shortcut" | "cache";
    readonly target: string | null;
  }[];
}
export function inspectWindowsInstallerInputs(
  configuration: string,
  builderVersion: string,
  packageName: string,
  nsisInclude: string,
): void;
export function inspectWindowsInstallation(
  execute?: (
    file: string,
    args: string[],
    options: { timeout: number; maxBuffer: number },
  ) => Promise<{ stdout: string }>,
  transactionRoot?: string,
): Promise<WindowsInstallationState>;
export function verifyWindowsInstaller(options: {
  readonly disposableVm?: boolean;
  readonly io: {
    inspect(): Promise<unknown>;
    install(): Promise<unknown>;
    verify(): Promise<unknown>;
    uninstall(): Promise<unknown>;
  };
}): Promise<{ replacedExisting: boolean }>;
