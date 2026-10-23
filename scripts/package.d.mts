export function packagingArchitecture(arch?: string): "arm64" | "x64";
export interface PackagingStep {
  readonly builder?: readonly string[];
  readonly task?: "prepare-linux-launcher" | "package-linux-assets";
}
export function packagingPlan(
  platform: string,
  arch: string,
  version: string,
): { readonly steps: PackagingStep[]; readonly artifacts: string[] };
export function checksumListName(platform: string, arch: string): string;
export function writeChecksums(
  platform: string,
  arch: string,
  artifacts: readonly string[],
  root: string,
): Promise<string>;
export function packageRelease(
  platform: string,
  arch?: string,
): Promise<{ readonly artifacts: string[]; readonly checksums: string }>;
