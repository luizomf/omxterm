export function linuxHelperName(): string;
export function linuxArtifactName(
  version: string,
  arch: string,
  extension: "AppImage" | "deb" | "rpm",
): string;
export function linuxAppImageName(version: string, arch: string): string;
export function renderLinuxHelper(source: string, version: string): string;
export function checksumContents(
  filename: string,
  contents: string | NodeJS.ArrayBufferView,
): string;
export function writeChecksum(file: string): Promise<void>;
export function packageLinuxAssets(
  outputRoot?: string,
  arch?: string,
): Promise<{
  appImage: string;
  helper: string;
}>;
