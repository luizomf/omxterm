export interface AsarInspection {
  readonly missing: string[];
  readonly forbidden: string[];
}

export function inspectAsarEntries(
  entries: string[],
  platform?: "darwin" | "linux" | "win32",
): AsarInspection;

export function inspectForbiddenPackagedEntries(entries: string[]): string[];

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

export function verifyPackagedApplication(applicationPath?: string): Promise<{
  readonly applicationPath: string;
  readonly records: number;
}>;
