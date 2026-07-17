export interface AsarInspection {
  readonly missing: string[];
  readonly forbidden: string[];
}

export function inspectAsarEntries(entries: string[]): AsarInspection;

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

export function verifyPackagedApplication(applicationPath?: string): Promise<{
  readonly applicationPath: string;
  readonly records: number;
}>;
