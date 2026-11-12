export function executableUuid(
  bundleIdentifier: string,
  relativePath: string,
  buildDigest: string,
  architecture: string,
): Buffer;

export function replaceMachOUuid(
  binary: Buffer,
  uuidFor: (architecture: string) => Buffer,
): void;

export function bundleExecutables(
  applicationPath: string,
  productName: string,
): Promise<string[]>;

export default function afterPack(
  context: Record<string, unknown>,
): Promise<void>;
