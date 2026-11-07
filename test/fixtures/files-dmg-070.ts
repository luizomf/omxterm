import assert from "node:assert/strict";

export const files070Sha256 =
  "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef";
export const stable025DmgSha256 =
  "eab799c16150ddb0852299a669df53cf7eb098cf223978cc30aa34ea8a20f32c";
export const files070MacChecks = [
  "exact-archive-trust-dormant-install",
  "loaded-filter-retains-ancestor-clears-selection-no-recursive-search",
  "Chromium-Tab-End-F2-Cancel-focus-hide-reveal-query-retained",
  "cancelled-directory-move-no-effects",
  "confirmed-directory-conflict-no-clobber-source-destination-preserved",
  "one-explicit-confirmed-directory-move-same-inode-and-bytes",
];
export function assertFilesOnlyInputs(values: {
  FILES_070_ONLY?: boolean;
  VERSION: string;
  EXTENSION_VERSION?: string;
  ARCHIVE_SHA256: string;
  DMG_SHA256: string;
  PUBLIC_LINK?: string;
  PUBLIC_CATALOG?: string;
}) {
  if (!values.FILES_070_ONLY) return;
  assert.equal(values.VERSION, "0.25.0");
  assert.equal(values.EXTENSION_VERSION, "0.7.0");
  assert.equal(values.ARCHIVE_SHA256, files070Sha256);
  assert.equal(values.DMG_SHA256, stable025DmgSha256);
  assert.equal(values.PUBLIC_LINK, undefined);
}
export const files070MacCatalogChecks = [
  "exact-archive-trust-dormant-install",
  "catalog-activation-active-Files-at-Quit",
];
export function verifyFilesOnlyScenario(
  scenario: Record<string, unknown>,
  digest: string,
  catalog?: string,
) {
  assert.deepEqual(
    scenario.checks,
    catalog ? files070MacCatalogChecks : files070MacChecks,
  );
  assert.equal(scenario.approvals, 1);
  assert.equal(scenario.archiveSha256, digest);
  assert.equal(scenario.publicLink, undefined);
  if (catalog) {
    assert.deepEqual(scenario.publicCatalog, {
      url: catalog,
      installs: ["Install"],
    });
    assert.deepEqual(scenario.catalog, {
      mode: "public",
      requests: null,
      transportClosed: null,
    });
  } else {
    assert.equal(scenario.publicCatalog, undefined);
  }
}

// Keep the existing local/public lanes intact; this mode adds no trash helper.
export function filesDmgMode(
  filesOnly: boolean,
  publicAcquisition: boolean,
  lookup: string,
) {
  if (filesOnly)
    return {
      files: ["files-070-consumer.mjs", "files-070-macos-adapter.cjs"],
      options: {
        macosLifecycle: false,
        consumer070: true,
        filesOnly: true,
        linuxExpectedIdentity: true,
        extensionName: "Files — ARM64 preview",
      },
      compileTrash: false,
    };
  return {
    files: publicAcquisition ? [] : ["files-trash-recovery.cjs"],
    options: {
      macosLifecycle: !publicAcquisition,
      ...(publicAcquisition ? {} : { trashLookup: lookup }),
    },
    compileTrash: !publicAcquisition,
  };
}
