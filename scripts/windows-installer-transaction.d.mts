export function assertOwnedRegistration(
  state: {
    readonly processes: boolean;
    readonly paths?: readonly {
      readonly path: string;
      readonly scope: string;
      readonly kind: string;
      readonly target: string | null;
    }[];
    readonly registrations: readonly {
      readonly hive: string;
      readonly view: string;
      readonly kind: string;
      readonly location: string | null;
      readonly uninstall: string | null;
      readonly shortcut?: string | null;
      readonly menu?: string | null;
    }[];
  },
  root: string,
  cacheDirectory?: string,
): void;
export function verifyExactWindowsInstaller(options: {
  readonly installer: string;
  readonly unpackedRoot: string;
  readonly projectRoot: string;
  readonly disposableVm: boolean;
  readonly verifyInstalled: (root: string) => Promise<unknown>;
  readonly execute?: (
    file: string,
    args: string[],
    options: { timeout: number; maxBuffer?: number },
  ) => Promise<{ stdout: string }>;
  readonly temporaryDirectory?: string;
  readonly localAppData?: string;
}): Promise<{
  replacedExisting: boolean;
  sha256: string;
}>;
