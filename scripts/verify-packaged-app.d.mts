export interface AsarInspection {
  readonly missing: string[];
  readonly forbidden: string[];
}

export function inspectAsarEntries(
  entries: string[],
  platform?: "darwin" | "linux" | "win32",
  arch?: "arm64" | "x64",
): AsarInspection;

export function inspectForbiddenPackagedEntries(entries: string[]): string[];

export function inspectElfDynamicDependencies(dynamicSection: string): string[];

export function inspectChecksumRecord(
  contents: string,
  filename: string,
  digest: string,
): void;

export interface IcnsRepresentation {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export function inspectIcnsRepresentations(
  representations: IcnsRepresentation[],
): {
  readonly missing: string[];
  readonly wrongDimensions: string[];
};

export interface ApplicationVersions {
  readonly sourceVersion: string;
  readonly packagedVersion: string;
  readonly bundleVersion: string;
}

export function inspectApplicationVersions(versions: ApplicationVersions): void;

export type ExecuteFile = (
  file: string,
  args: string[],
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export function inspectAdHocApplication(
  applicationPath: string,
  execute?: ExecuteFile,
): Promise<void>;

export function provisionLinuxHelper(
  helper: string,
  arguments_: string[],
  installationRoot: string,
  options?: { readonly timeoutMs?: number },
): Promise<{ readonly stdout: string; readonly stderr: string }>;

export function packagedExplicitCommand(
  platform: NodeJS.Platform | string,
  argumentCanary: string,
  systemRoot?: string,
): {
  readonly executable: string;
  readonly arguments: readonly string[];
};

export function signalProcessGroup(
  processGroupId: number,
  signal: NodeJS.Signals | 0,
): boolean;

export function verifyPackagedStartupWithCleanup<T>(operations: {
  verify(): Promise<T>;
  stop(): Promise<unknown>;
  removeProfile(): Promise<unknown>;
  retainProfileOnFailure?: boolean;
}): Promise<T>;

export function verifyPackagedApplication(
  applicationPath?: string,
  options?: {
    readonly inspectionOnly?: boolean;
    readonly windowsUnpackedOnly?: boolean;
    readonly disposableVm?: boolean;
  },
): Promise<{
  readonly applicationPath: string;
  readonly records: number;
  readonly verification: string;
  readonly installerVerification?: {
    readonly replacedExisting: boolean;
    readonly sha256: string;
  };
}>;
