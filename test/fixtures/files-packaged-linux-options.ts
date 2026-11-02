import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";

const prefix = "OMXTERM_FILES_PACKAGED_";

export const linuxFilesChecks = [
  "exact-archive-trust-dormant-install",
  "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
  "panel-outside-tabs-hide-reveal-settings-terminal-switch-selected-visible-close",
  "selected-visible-toggle-header-close-destroy-fresh-view-same-backend-PTY",
  "legacy-captured-initial-directory",
  "packaged-backend-create-move-conflict",
  "explicit-reinstall-actual-retirement-dormant",
  "fresh-activation-disable-uninstall",
  "same-PTY-and-Surface",
] as const;

export function assertLinuxFilesScenario(
  result: unknown,
  expected: {
    currentUi: boolean;
    archiveSha256: string;
    version: string;
    extensionVersion: string;
    extensionName: string;
  },
) {
  assert.ok(result && typeof result === "object");
  const receipt = result as Record<string, unknown>;
  assert.equal(receipt.approvals, 2);
  assert.deepEqual(
    receipt.checks,
    expected.currentUi
      ? [
          ...linuxFilesChecks,
          "current-Files-toolbar-dotfiles-draft",
          "linux-Files-Ctrl-H-dotfiles-draft-focus",
        ]
      : [...linuxFilesChecks],
    "Linux Files scenario checks",
  );
  assert.equal(receipt.archiveSha256, expected.archiveSha256);
  assert.equal(receipt.host, expected.version);
  assert.equal(receipt.extensionVersion, expected.extensionVersion);
  assert.equal(receipt.extensionName, expected.extensionName);
}

export function assertLinuxFilesHost(
  metadata: unknown,
  expectedVersion: string,
) {
  assert.ok(metadata && typeof metadata === "object");
  assert.equal(
    (metadata as { version?: unknown }).version,
    expectedVersion,
    "expected host version",
  );
}

export async function prepareLinuxFiles(directory: string, currentUi: boolean) {
  await writeFile(path.join(directory, "source.txt"), "source");
  await writeFile(path.join(directory, "conflict.txt"), "preserved");
  if (currentUi)
    await writeFile(path.join(directory, ".release-dotfile"), "dotfile");
}

export function linuxFilesInputs(env: NodeJS.ProcessEnv) {
  if (
    !Object.keys(env).some(
      (key) => key.startsWith(prefix) && env[key] !== undefined,
    )
  )
    return undefined;
  const required = (name: string) => {
    const value = env[prefix + name];
    assert.ok(value, `${prefix}${name} required`);
    return value;
  };
  const appImage = required("APPIMAGE");
  const archive = required("ARCHIVE");
  const version = required("VERSION");
  const extensionVersion = required("EXTENSION_VERSION");
  const extensionName = required("EXTENSION_NAME");
  const appImageSha256 = required("APPIMAGE_SHA256");
  const archiveSha256 = required("ARCHIVE_SHA256");
  for (const [name, value] of [
    ["APPIMAGE", appImage],
    ["ARCHIVE", archive],
  ] as const)
    assert.ok(path.isAbsolute(value), `${prefix}${name} must be absolute`);
  for (const [name, value] of [
    ["APPIMAGE_SHA256", appImageSha256],
    ["ARCHIVE_SHA256", archiveSha256],
  ] as const)
    assert.match(value, /^[a-f0-9]{64}$/, `${prefix}${name} must be SHA-256`);
  for (const [name, value] of [
    ["VERSION", version],
    ["EXTENSION_VERSION", extensionVersion],
  ] as const)
    assert.equal(
      valid(value),
      value,
      `${prefix}${name} must be canonical SemVer`,
    );
  assert.equal(
    extensionName.trim(),
    extensionName,
    "Expected Files name must be exact",
  );
  const attachOnly = env[prefix + "ATTACH_ONLY"] === "1";
  const terminalOnly = env[prefix + "TERMINAL_ONLY"] === "1";
  const catalogMode = env[prefix + "CATALOG"] || undefined;
  assert.ok(
    !catalogMode || ["controlled", "public"].includes(catalogMode),
    "Unknown catalog qualification mode",
  );
  assert.ok(
    !catalogMode || (!attachOnly && !terminalOnly),
    "Catalog mode requires the full lifecycle",
  );
  assert.ok(
    !(attachOnly && terminalOnly),
    "Choose only one diagnostic stopping point",
  );
  const stablePair = version === "0.24.0" && extensionVersion === "0.6.0";
  if (stablePair)
    assert.equal(
      extensionName,
      "Files — ARM64 preview",
      "Expected stable Files name",
    );
  return {
    appImage,
    archive,
    version,
    extensionVersion,
    extensionName,
    appImageSha256,
    archiveSha256,
    attachOnly,
    terminalOnly,
    catalogMode,
    currentUi: stablePair && !attachOnly && !terminalOnly,
  };
}
