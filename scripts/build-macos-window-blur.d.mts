import type { ExecFileSyncOptions } from "node:child_process";

export function buildMacOSWindowBlur(
  outputDirectory: string,
  options?: {
    platform?: string;
    arch?: string;
    execute?: (
      file: string,
      args: readonly string[],
      options: ExecFileSyncOptions,
    ) => unknown;
  },
): Promise<void>;
