export function linuxHelperName(): string;
export function linuxAppImageName(
  version: string,
  arch?: "arm64" | "x64",
): string;
export function renderLinuxHelper(source: string, version: string): string;
export function checksumContents(
  filename: string,
  contents: string | NodeJS.ArrayBufferView,
): string;
export function packageLinuxAssets(
  outputRoot?: string,
  arch?: "arm64" | "x64",
): Promise<{
  appImage: string;
  helper: string;
}>;
