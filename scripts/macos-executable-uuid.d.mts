export function executableUuid(
  bundleIdentifier: string,
  relativePath: string,
): Buffer;

export function replaceMachOUuid(binary: Buffer, uuid: Buffer): void;

export default function afterPack(
  context: Record<string, unknown>,
): Promise<void>;
