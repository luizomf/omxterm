export interface AsarInspection {
  readonly missing: string[];
  readonly forbidden: string[];
}

export function inspectAsarEntries(entries: string[]): AsarInspection;

export function verifyPackagedApplication(applicationPath?: string): Promise<{
  readonly applicationPath: string;
  readonly records: number;
}>;
