export interface PrepareResttyRuntimeOptions {
  readonly runtimePath?: string;
  readonly corePath?: string;
  readonly eventTypesPath?: string;
  readonly correctedCorePath?: string;
  /** @deprecated Use correctedCorePath. */
  readonly scrollbackCorePath?: string;
}

export function prepareResttyRuntime(
  options?: PrepareResttyRuntimeOptions,
): Promise<void>;
