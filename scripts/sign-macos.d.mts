export const releaseCertificateSHA1: string;
export const releaseDesignatedRequirement: string;
export const signingKeychainVariable: string;
export const signingPasswordFileVariable: string;

export function releaseSigningKeychain(
  environment?: Record<string, string | undefined>,
): { keychain: string; passwordFile: string } | null;

export default function sign(options: Record<string, unknown>): Promise<void>;
