import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

// macOS release builds are signed with one stable, self-signed certificate so
// privacy permissions survive updates (ADR 0046). Its fingerprint is public;
// the private key lives only in a dedicated keychain on the release machine.
export const releaseCertificateSHA1 =
  "7208E52002B019F6F948788CE6D095C117405ED3";
export const releaseDesignatedRequirement = `identifier "com.otaviomiranda.omxterm" and certificate root = H"${releaseCertificateSHA1.toLowerCase()}"`;

export const signingKeychainVariable = "OMXTERM_MACOS_SIGNING_KEYCHAIN";
export const signingPasswordFileVariable =
  "OMXTERM_MACOS_SIGNING_KEYCHAIN_PASSWORD_FILE";

/**
 * Returns the release keychain to sign with, or null for an ad-hoc build.
 * Setting only one of the two variables is a configuration error, never a
 * silent ad-hoc fallback.
 */
export function releaseSigningKeychain(environment = process.env) {
  const keychain = environment[signingKeychainVariable];
  const passwordFile = environment[signingPasswordFileVariable];
  if (!keychain && !passwordFile) return null;
  if (!keychain || !passwordFile)
    throw new Error(
      `Set both ${signingKeychainVariable} and ${signingPasswordFileVariable} to sign a macOS release, or neither for an ad-hoc build`,
    );
  if (!path.isAbsolute(keychain) || !path.isAbsolute(passwordFile))
    throw new Error("macOS signing keychain paths must be absolute");
  return { keychain, passwordFile };
}

// electron-builder custom sign hook (mac.sign). It receives the ad-hoc
// options electron-builder prepared for `identity: "-"`.
export default async function sign(options) {
  const { signAsync } = await import("@electron/osx-sign");
  const release = releaseSigningKeychain();
  if (release === null) return signAsync(options);

  // Unlock first so codesign never meets a locked keychain, which would ask
  // for the password in a graphical dialog.
  const password = (await readFile(release.passwordFile, "utf8")).trim();
  await execFile("security", [
    "unlock-keychain",
    "-p",
    password,
    release.keychain,
  ]);
  const { optionsForFile } = options;
  return signAsync({
    ...options,
    identity: releaseCertificateSHA1,
    identityValidation: false,
    keychain: release.keychain,
    // No timestamp server: the certificate is not Apple-issued and the build
    // must not depend on the network. electron-builder's per-file options
    // take precedence over top-level ones, so set it there.
    optionsForFile: (file) => ({
      ...(typeof optionsForFile === "function" ? optionsForFile(file) : {}),
      timestamp: "none",
    }),
  });
}
