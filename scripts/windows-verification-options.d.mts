export const disposableVmFlag: string;
export function windowsVerificationOptions(
  args: readonly string[],
  platform?: string,
): {
  inspectionOnly?: boolean;
  release?: boolean;
  windowsUnpackedOnly: boolean;
  disposableVm: boolean;
};
