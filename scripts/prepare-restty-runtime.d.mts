export interface PrepareResttyRuntimeOptions {
  readonly runtimePath?: string;
  readonly corePath?: string;
  readonly scrollbackCorePath?: string;
}

export function prepareResttyRuntime(
  options?: PrepareResttyRuntimeOptions,
): Promise<void>;
