export interface RepairNodePtySpawnHelperOptions {
  readonly platform?: NodeJS.Platform | string;
  readonly arch?: string;
  readonly helperPath?: string;
  readonly chmod?: (path: string, mode: number) => Promise<void>;
}

export function repairNodePtySpawnHelper(
  options?: RepairNodePtySpawnHelperOptions,
): Promise<boolean>;
