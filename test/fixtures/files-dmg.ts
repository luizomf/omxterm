import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "./run-native-fixture";
import {
  bundleIdentity,
  copyDmgApplication,
  inspectDmgApplication,
  sha256,
} from "./snippets-dmg";

export const filesPublicCatalogUrl =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json";
const files06Sha256 =
  "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
function assertPublicCatalogIdentity(
  publicCatalog: string | undefined,
  version: string | undefined,
  digest: string,
) {
  if (!publicCatalog) return;
  assert.ok(
    ["0.5.0", "0.6.0"].includes(version ?? "0.5.0"),
    "unsupported public Files version",
  );
  if (version === "0.6.0")
    assert.equal(digest, files06Sha256, "Files0.6 archive digest");
}
const prefix = "OMXTERM_FILES_DMG_";
const names = [
  "DMG",
  "DMG_SHA256",
  "ARCHIVE",
  "ARCHIVE_SHA256",
  "VERSION",
  "EVIDENCE",
] as const;
export function filesDmgInputs(env = process.env) {
  if (
    !Object.keys(env).some(
      (key) => key.startsWith(prefix) && env[key] !== undefined,
    )
  )
    return undefined;
  assert.ok(
    !Object.keys(env).some(
      (key) =>
        /^(OMXTERM_FILES_PACKAGED_|OMXTERM_FILES_PRODUCTION_|OMXTERM_SNIPPETS_DMG_)/.test(
          key,
        ) && env[key] !== undefined,
    ),
    "Choose one native adapter",
  );
  const values = Object.fromEntries(
    names.map((name) => {
      const value = env[prefix + name];
      assert.ok(value, `${prefix}${name} required`);
      return [name, value];
    }),
  ) as Record<(typeof names)[number], string>;
  for (const name of ["DMG", "ARCHIVE", "EVIDENCE"] as const)
    assert.ok(path.isAbsolute(values[name]), `${name} must be absolute`);
  for (const name of ["DMG_SHA256", "ARCHIVE_SHA256"] as const)
    assert.match(values[name], /^[a-f0-9]{64}$/);
  const extensionVersion = env[prefix + "EXTENSION_VERSION"];
  if (extensionVersion !== undefined)
    assert.match(
      extensionVersion,
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      "EXTENSION_VERSION must be an explicit version",
    );
  const publicCatalog = env[prefix + "PUBLIC_CATALOG"];
  if (publicCatalog !== undefined) {
    assert.equal(
      publicCatalog,
      filesPublicCatalogUrl,
      "PUBLIC_CATALOG must name the fixed macOS endpoint",
    );
    assert.equal(
      env[prefix + "PUBLIC_LINK"],
      undefined,
      "Choose one public acquisition mode",
    );
    assertPublicCatalogIdentity(
      publicCatalog,
      extensionVersion,
      values.ARCHIVE_SHA256,
    );
  }
  const publicLink = env[prefix + "PUBLIC_LINK"];
  if (publicLink !== undefined) {
    const url = new URL(publicLink);
    assert.ok(
      url.origin === "https://github.com" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.href === publicLink &&
        /^\/luizomf\/omxterm\/releases\/download\/ext-files-v0\.5\.0\/[A-Za-z0-9._-]+\.omxext$/.test(
          url.pathname,
        ),
      "PUBLIC_LINK must name an immutable project Files0.5 HTTPS archive",
    );
  }
  return {
    ...values,
    ...(extensionVersion !== undefined
      ? { EXTENSION_VERSION: extensionVersion }
      : {}),
    ...(publicLink !== undefined ? { PUBLIC_LINK: publicLink } : {}),
    ...(publicCatalog !== undefined ? { PUBLIC_CATALOG: publicCatalog } : {}),
  };
}
export const filesPublicLinkChecks = [
  "exact-archive-trust-dormant-install",
  "packaged-backend-create-move-conflict",
  "explicit-reinstall-actual-retirement-dormant",
  "fresh-activation-disable-uninstall",
  "same-PTY-and-Surface",
  "third-consent-active-Files-at-Quit",
];
export const filesDmgChecks = [
  "exact-archive-trust-dormant-install",
  "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
  "source-terminal-closed-same-companion-distinct-surviving-PTY",
  "panel-outside-tabs-hide-reveal-settings-terminal-switch-selected-visible-close",
  "selected-visible-toggle-header-close-destroy-fresh-view-same-backend-PTY",
  "legacy-captured-initial-directory",
  "packaged-backend-create-move-conflict",
  "folder-confirm-cancel-delete-real-backend-trash-recovered",
  "retained-operation-draft-caret-same-view-backend",
  "explicit-reinstall-actual-retirement-dormant",
  "fresh-activation-disable-uninstall",
  "surviving-PTY-and-Surface",
  "third-consent-active-Files-at-Quit",
];

async function verifyScenario(
  values: NonNullable<ReturnType<typeof filesDmgInputs>>,
  evidence: string,
) {
  const scenario = JSON.parse(
    await readFile(path.join(evidence, "scenario.json"), "utf8"),
  ) as Record<string, unknown>;
  const publicAcquisition = !!(values.PUBLIC_LINK || values.PUBLIC_CATALOG);
  assert.deepEqual(
    scenario.checks,
    publicAcquisition
      ? filesPublicLinkChecks
      : values.EXTENSION_VERSION === "0.6.0"
        ? [...filesDmgChecks, "current-Files-toolbar-dotfiles-draft"]
        : filesDmgChecks,
  );
  assert.equal(scenario.approvals, 3);
  assert.equal(scenario.archiveSha256, values.ARCHIVE_SHA256);
  if (values.PUBLIC_CATALOG) {
    assert.deepEqual(scenario.publicCatalog, {
      url: values.PUBLIC_CATALOG,
      installs: ["Install", "Reinstall", "Install"],
    });
    assert.deepEqual(scenario.catalog, {
      mode: "public",
      requests: null,
      transportClosed: null,
    });
    assert.equal(scenario.publicLink, undefined);
  } else if (values.PUBLIC_LINK) {
    assert.deepEqual(scenario.publicLink, {
      url: values.PUBLIC_LINK,
      installs: [values.PUBLIC_LINK, values.PUBLIC_LINK, values.PUBLIC_LINK],
    });
  } else {
    assert.equal(scenario.sourceExited, true);
    const recovery = JSON.parse(
      await readFile(path.join(evidence, "trash-recovery.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(recovery.verified, true);
    assert.equal(recovery.restored, true);
    assert.equal(recovery.phase, "restored");
  }
}

function extensionVersion(
  values: NonNullable<ReturnType<typeof filesDmgInputs>>,
) {
  return values.EXTENSION_VERSION ?? "0.5.0";
}
async function prepareOwnedFiles(
  root: string,
  values: NonNullable<ReturnType<typeof filesDmgInputs>>,
) {
  await writeFile(path.join(root, "owned-files/source.txt"), "source");
  await writeFile(path.join(root, "owned-files/conflict.txt"), "preserved");
  if (
    !values.PUBLIC_LINK &&
    !values.PUBLIC_CATALOG &&
    values.EXTENSION_VERSION === "0.6.0"
  )
    await writeFile(path.join(root, "owned-files/.release-dotfile"), "dotfile");
}

// Preparation/ownership/observer paths are the same ones exercised by headless
// tests. No alternate application entry, stock Node backend or Quartz input.
export async function runFilesDmgCampaign(
  values: NonNullable<ReturnType<typeof filesDmgInputs>>,
  testContext: NativeFixtureTestContext,
) {
  const publicAcquisition = !!(values.PUBLIC_LINK || values.PUBLIC_CATALOG);
  assert.ok(
    !(values.PUBLIC_LINK && values.PUBLIC_CATALOG),
    "Choose one public acquisition mode",
  );
  if (values.PUBLIC_CATALOG)
    assert.equal(values.PUBLIC_CATALOG, filesPublicCatalogUrl);
  assertPublicCatalogIdentity(
    values.PUBLIC_CATALOG,
    values.EXTENSION_VERSION,
    values.ARCHIVE_SHA256,
  );
  assert.equal(process.platform, "darwin");
  assert.equal(process.arch, "arm64");
  assert.notEqual(process.getuid?.(), 0);
  assert.ok(
    ["/bin/sh", "/bin/bash", "/bin/zsh"].includes(os.userInfo().shell ?? ""),
  );
  await mkdir(values.EVIDENCE, { recursive: true });
  const evidence = await mkdtemp(
    path.join(await realpath(values.EVIDENCE), "run-"),
  );
  const root = path.join(evidence, "fixture");
  await mkdir(root);
  const json = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  const supervisorEvidence = path.join(
    values.EVIDENCE,
    `supervisor-${path.basename(evidence)}.json`,
  );
  await json("supervisor-location.json", { evidencePath: supervisorEvidence });
  const failures: unknown[] = [];
  let bundle: Awaited<ReturnType<typeof copyDmgApplication>> | undefined;
  const lookup = path.join(evidence, "trash-directory");
  let lookupHash: string | undefined;
  try {
    assert.equal(sha256(await readFile(values.DMG)), values.DMG_SHA256);
    const archiveBytes = await readFile(values.ARCHIVE);
    if (values.PUBLIC_CATALOG && values.EXTENSION_VERSION === "0.6.0")
      assert.equal(archiveBytes.length, 17331, "Files0.6 archive size");
    assert.equal(sha256(archiveBytes), values.ARCHIVE_SHA256);
    testContext.signal.throwIfAborted();
    bundle = await copyDmgApplication(values.DMG, evidence);
    const identity = await inspectDmgApplication(
      bundle.application,
      values.VERSION,
    );
    await json("artifacts.json", {
      ...identity,
      bundleSha256: bundle.binding,
      dmgSha256: values.DMG_SHA256,
      archiveSha256: values.ARCHIVE_SHA256,
      extensionVersion: extensionVersion(values),
      version: values.VERSION,
    });
    for (const name of [
      "home",
      "profile",
      "state",
      "data",
      "owned-files",
      "config/omxterm",
    ])
      await mkdir(path.join(root, name), { recursive: true });
    await writeFile(
      path.join(root, "config/omxterm/config.json"),
      JSON.stringify({
        version: 1,
        language: "en-US",
        confirmClose: false,
        window: { blur: false },
      }),
    );
    for (const name of [
      "files-packaged.cjs",
      "snippets-process-identity.cjs",
      ...(publicAcquisition ? [] : ["files-trash-recovery.cjs"]),
    ])
      await cp(path.join("test/fixtures", name), path.join(root, name));
    // Public mode retains only the external digest oracle, never local chooser bytes.
    if (!publicAcquisition)
      await cp(values.ARCHIVE, path.join(root, "files.omxext"));
    await prepareOwnedFiles(root, values);
    await writeFile(
      path.join(root, "shell.sh"),
      'printf \'{"mainPid":%s,"probePid":%s}\' "$PPID" "$$" > "$1"\nexec /bin/sh -i\n',
    );
    const options = path.join(evidence, "options.json");
    await writeFile(
      options,
      JSON.stringify({
        ...identity,
        root,
        evidence,
        version: values.VERSION,
        archive: path.join(root, "files.omxext"),
        archiveSha256: values.ARCHIVE_SHA256,
        extensionVersion: extensionVersion(values),
        readiness: path.join(root, "shell.json"),
        files: path.join(root, "owned-files"),
        observer: "files-packaged.cjs",
        macosLifecycle: !publicAcquisition,
        ...(values.PUBLIC_CATALOG
          ? { publicCatalog: values.PUBLIC_CATALOG, catalogMode: "public" }
          : values.PUBLIC_LINK
            ? { publicLink: values.PUBLIC_LINK }
            : { trashLookup: lookup }),
      }),
    );
    const launcher = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-files-dmg-"),
    );
    const driver = path.join(launcher, "driver.cjs");
    const result = await runNativeFixture({
      executable: process.execPath,
      args: [driver, options],
      root: launcher,
      timeout: 180000,
      evidencePath: supervisorEvidence,
      testContext,
      prepare: async () => {
        // Runs only on the assigned native lane, after its unresolved-owner guard.
        if (!publicAcquisition) {
          await promisify(execFile)(
            "/usr/bin/xcrun",
            [
              "clang++",
              "-std=c++17",
              "-mmacosx-version-min=12.0",
              "-framework",
              "Foundation",
              "test/fixtures/files-trash-directory.mm",
              "-o",
              lookup,
            ],
            { timeout: 60000, maxBuffer: 1024 * 1024 },
          );
          lookupHash = sha256(await readFile(lookup));
          await json("trash-lookup.json", {
            sourceSha256: sha256(
              await readFile("test/fixtures/files-trash-directory.mm"),
            ),
            binarySha256: lookupHash,
          });
        }
        await build({
          entryPoints: ["test/fixtures/snippets-dmg-main.ts"],
          outfile: driver,
          bundle: true,
          platform: "node",
          format: "cjs",
          logLevel: "silent",
        });
      },
    });
    assert.deepEqual(
      {
        code: result.exitCode,
        signal: result.signal,
        reason: result.reason,
        cleanup: result.cleanupErrors,
      },
      { code: 0, signal: null, reason: "exit", cleanup: [] },
      result.stderr,
    );
    await verifyScenario(values, evidence);
  } catch (error) {
    failures.push(error);
  } finally {
    for (const [file, expected] of [
      [values.DMG, values.DMG_SHA256],
      [values.ARCHIVE, values.ARCHIVE_SHA256],
    ] as const) {
      try {
        assert.equal(
          sha256(await readFile(file)),
          expected,
          "Artifact changed",
        );
      } catch (error) {
        failures.push(error);
      }
    }
    if (bundle) {
      try {
        assert.equal(
          await bundleIdentity(bundle.application),
          bundle.binding,
          "Copied bundle changed",
        );
      } catch (error) {
        failures.push(error);
      }
    }
    if (lookupHash) {
      try {
        assert.equal(
          sha256(await readFile(lookup)),
          lookupHash,
          "Lookup tool changed",
        );
      } catch (error) {
        failures.push(error);
      }
    }
    const outcome = () => ({
      passed: failures.length === 0 && !testContext.signal.aborted,
      failures: failures.map((error) =>
        error instanceof Error ? error.stack : String(error),
      ),
      profileRetained: true,
      scope: values.PUBLIC_CATALOG
        ? "Exact DMG-derived app and Files public catalog; synthetic Chromium input; controlled Official consent; configured endpoint, not a passive network trace; no trash matrix or native-I/O cancellation qualification"
        : values.PUBLIC_LINK
          ? "Exact DMG-derived app and Files public HTTPS link; synthetic Chromium input; controlled consent; no catalog, trash matrix or native-I/O cancellation qualification"
          : "Exact DMG-derived app and separate Files; synthetic Chromium input; controlled consent; local same-device trash recovery; not public installation or native-I/O cancellation",
    });
    try {
      await json("result.json", {
        ...outcome(),
        passed: false,
        finalizing: true,
      });
    } catch (error) {
      failures.push(error);
    }
    if (testContext.signal.aborted) failures.push(testContext.signal.reason);
    writeFileSync(
      path.join(evidence, "result.json"),
      JSON.stringify(outcome(), null, 2),
    );
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Files DMG campaign failed; evidence retained at ${evidence}`,
    );
}
