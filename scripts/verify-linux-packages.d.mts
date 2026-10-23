export function systemPackageVersion(version: string): string;
export function parseDebControl(contents: string): Map<string, string>;
export function inspectDebMetadata(
  fields: ReadonlyMap<string, string>,
  expected: { readonly arch: string; readonly version: string },
): void;
export function inspectRpmMetadata(
  metadata: {
    readonly name?: string;
    readonly version?: string;
    readonly arch?: string;
    readonly requires: readonly string[];
    readonly recommends: readonly string[];
  },
  expected: { readonly arch: string; readonly version: string },
): void;
export function inspectPrivilegedModes(listing: string): string[];
export function inspectMaintainerScripts(scripts: string): void;
export function inspectDesktopEntry(contents: string): void;
export function inspectSystemPackageFiles(files: readonly string[]): string[];
export function verifyLinuxSystemPackage(
  format: "deb" | "rpm",
  file: string,
  options: {
    readonly arch: string;
    readonly version: string;
    readonly unpackedRoot: string;
  },
): Promise<void>;
export function verifyLinuxSystemPackages(options?: {
  readonly releaseRoot?: string;
  readonly arch?: string;
}): Promise<string[]>;
