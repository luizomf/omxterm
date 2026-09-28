export function linuxHelperName(): string;
export function linuxAppImageName(version: string): string;
export function renderLinuxHelper(source: string, version: string): string;
export function checksumContents(
  filename: string,
  contents: string | NodeJS.ArrayBufferView,
): string;
export function packageLinuxAssets(outputRoot?: string): Promise<{
  appImage: string;
  helper: string;
}>;
