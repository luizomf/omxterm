import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";

const prefix = "OMXTERM_FILES_PACKAGED_";
export const linuxFilesPublicEndpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
export const linuxFilesPublicArchive =
  "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.6.0/files-0.6.0.omxext";
export const linuxFilesPublicDigest =
  "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
export const linuxFilesPublicChecks = [
  "exact-archive-trust-dormant-install",
  "packaged-backend-create-move-conflict",
  "explicit-reinstall-actual-retirement-dormant",
  "fresh-activation-disable-uninstall",
  "same-PTY-and-Surface",
  "third-consent-active-Files-at-Quit",
] as const;

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
    catalogSha256?: string;
  },
) {
  assert.ok(result && typeof result === "object");
  const receipt = result as Record<string, unknown>;
  assert.equal(receipt.approvals, expected.catalogSha256 ? 3 : 2);
  assert.deepEqual(
    receipt.checks,
    expected.catalogSha256
      ? [...linuxFilesPublicChecks]
      : expected.currentUi
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
  if (expected.catalogSha256) {
    assert.deepEqual(receipt.publicCatalog, {
      url: linuxFilesPublicEndpoint,
      installs: ["Install", "Reinstall", "Install"],
    });
    assert.deepEqual(receipt.catalog, {
      mode: "public",
      requests: null,
      transportClosed: null,
    });
    assert.ok(
      receipt.publicBinding && typeof receipt.publicBinding === "object",
    );
    const binding = receipt.publicBinding as {
      catalogGeneration: unknown;
      selection: string;
      catalogSha256: unknown;
      catalogBytes: number;
      archiveSha256: unknown;
      approvals: unknown;
      installed: unknown;
      attempts: unknown;
      offer: {
        id: unknown;
        name: unknown;
        version: unknown;
        targets: unknown;
        archive: unknown;
      };
    };
    assert.equal(binding.catalogGeneration, 1);
    assert.match(binding.selection, /^[a-f0-9-]{36}$/);
    assert.equal(binding.catalogSha256, expected.catalogSha256);
    assert.ok(
      Number.isSafeInteger(binding.catalogBytes) &&
        binding.catalogBytes > 0 &&
        binding.catalogBytes <= 256 * 1024,
    );
    assert.equal(binding.archiveSha256, linuxFilesPublicDigest);
    assert.equal(binding.approvals, 3);
    assert.equal(binding.installed, 3);
    assert.equal(binding.offer?.id, "omxterm.files");
    assert.equal(binding.offer?.name, "Files — ARM64 preview");
    assert.equal(binding.offer?.version, "0.6.0");
    assert.deepEqual(binding.offer?.targets, ["linux-arm64"]);
    assert.deepEqual(binding.offer?.archive, {
      url: linuxFilesPublicArchive,
      bytes: 17331,
      sha256: linuxFilesPublicDigest,
    });
    assert.deepEqual(
      binding.attempts,
      [0, 1, 5].map((expectedGeneration) => ({
        selection: binding.selection,
        catalogGeneration: 1,
        expectedGeneration,
        sha256: linuxFilesPublicDigest,
        bytes: 17331,
      })),
    );
  }
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
  const linuxPublicCatalog = catalogMode === "public" && stablePair;
  const linuxHistoricalPublic =
    catalogMode === "public" &&
    version === "0.24.0-dev.11" &&
    extensionVersion === "0.4.0" &&
    extensionName === "Files — Linux ARM64 preview" &&
    archiveSha256 ===
      "384de7da4cc2fafe7e42cd4ccf19a455a2e634036069160c75e15b7371d2eb6e";
  const catalogSha256 = env[prefix + "CATALOG_SHA256"];
  if (catalogMode === "public") {
    assert.ok(
      linuxPublicCatalog || linuxHistoricalPublic,
      "Unsupported public pair",
    );
    assert.equal(
      env[prefix + "CATALOG_FILE"],
      undefined,
      "Public mode forbids controlled catalog",
    );
  }
  if (linuxPublicCatalog) {
    assert.equal(
      archiveSha256,
      linuxFilesPublicDigest,
      "Original Files 0.6.0 archive digest",
    );
    assert.match(
      catalogSha256 ?? "",
      /^[a-f0-9]{64}$/,
      "Expected catalog SHA-256 required",
    );
  } else
    assert.equal(
      catalogSha256,
      undefined,
      "Catalog digest requires public mode",
    );
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
    catalogSha256,
    linuxPublicCatalog,
    linuxHistoricalPublic,
    currentUi:
      stablePair && !attachOnly && !terminalOnly && catalogMode !== "public",
  };
}
