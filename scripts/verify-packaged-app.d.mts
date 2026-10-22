export interface AsarInspection {
  readonly missing: string[];
  readonly forbidden: string[];
}

export type PackagedArchitecture = "arm64" | "x64";

export function packagedArchitecture(arch?: string): PackagedArchitecture;

export function unpackedDirectoryName(platform: string, arch: string): string;

export function inspectAsarEntries(
  entries: string[],
  platform?: "darwin" | "linux" | "win32",
  arch?: string,
): AsarInspection;

export function inspectPeMachine(
  machine: number,
  label: string,
  arch: string,
): void;

export function inspectArchitectureDescription(
  description: string,
  label: string,
  platform: string,
  arch: string,
): void;

export function nativeBinaryKind(header: Buffer): string | undefined;

export function inspectLinuxNativeBinaries(
  binaries: readonly { readonly entry: string; readonly kind?: string }[],
  arch: string,
): string[];

export function verifyLinuxNativeTree(
  root: string,
  arch: string,
): Promise<void>;

export function verifyLicenseResources(resources: string): Promise<void>;

export function verifyChecksum(file: string): Promise<void>;

export function assertNoUpdateMetadata(resources: string): Promise<void>;

export function assertSameFile(source: string, packaged: string): Promise<void>;

export function sourceVersion(): Promise<string>;

export const staticOnlyFlag: string;
export const softwareGlFlag: string;

export function packageVerificationOptions(
  args: readonly string[],
  platform?: string,
): {
  windowsUnpackedOnly: boolean;
  disposableVm: boolean;
  staticOnly: boolean;
  softwareGl: boolean;
};

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
}): Promise<T>;

export function verifyPackagedApplication(
  applicationPath?: string,
  options?: {
    readonly windowsUnpackedOnly?: boolean;
    readonly disposableVm?: boolean;
    readonly staticOnly?: boolean;
  },
): Promise<{
  readonly applicationPath: string;
  readonly arch: PackagedArchitecture;
  readonly records: number;
  readonly verification: string;
  readonly installerVerification?: {
    readonly replacedExisting: boolean;
    readonly sha256: string;
  };
}>;
