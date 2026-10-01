export interface PrepareNodePtyRuntimeOptions {
  readonly platform?: NodeJS.Platform | string;
  readonly arch?: string;
  readonly helperPath?: string;
  readonly unixRuntimePath?: string;
  readonly windowsRuntimePath?: string;
  readonly rebuild?: () => Promise<void>;
  readonly chmod?: (path: string, mode: number) => Promise<void>;
}

export function prepareNodePtyRuntime(
  options?: PrepareNodePtyRuntimeOptions,
): Promise<"corrected-and-rebuilt" | "corrected">;
