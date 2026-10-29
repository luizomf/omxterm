import type { FilesBuildReceipt } from "./build-files-extension.mjs";

export function buildMirrorTypingExtension(
  output?: string,
  suppliedCommit?: string,
): Promise<FilesBuildReceipt>;
