import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "./run-native-fixture";
import {
  bundleIdentity,
  copyDmgApplication,
  dmgInputs,
  inspectDmgApplication,
  sha256,
} from "./snippets-dmg";

export async function runDmgCampaign(
  values: ReturnType<typeof dmgInputs>,
  testContext: NativeFixtureTestContext,
) {
  assert.ok(values);
  assert.equal(process.platform, "darwin");
  assert.equal(process.arch, "arm64");
  assert.notEqual(process.getuid?.(), 0);
  assert.ok(
    ["/bin/sh", "/bin/bash", "/bin/zsh"].includes(os.userInfo().shell ?? ""),
    "Prepared guest needs a sh/bash/zsh account shell",
  );
  const { verifyQuartzTool } = createRequire(import.meta.url)(
    "./snippets-quartz.cjs",
  ) as { verifyQuartzTool(manifest: string): unknown };
  const quartzTool = verifyQuartzTool(values.QUARTZ_TOOL);
  await mkdir(values.EVIDENCE, { recursive: true });
  const evidence = await mkdtemp(path.join(values.EVIDENCE, "run-"));
  // Fresh receipts share one configured lane's unresolved-owner guard.
  const supervisorEvidence = path.join(
    values.EVIDENCE,
    `supervisor-${path.basename(evidence)}.json`,
  );
  const root = path.join(evidence, "fixture");
  await mkdir(root);
  const json = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  await json("quartz-tool.json", quartzTool);
  await json("supervisor-location.json", { evidencePath: supervisorEvidence });
  let bundle: Awaited<ReturnType<typeof copyDmgApplication>> | undefined;
  const failures: unknown[] = [];
  try {
    assert.equal(sha256(await readFile(values.DMG)), values.DMG_SHA256);
    assert.equal(sha256(await readFile(values.ARCHIVE)), values.ARCHIVE_SHA256);
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
      version: values.VERSION,
    });
    for (const name of ["home", "profile", "state", "data", "config/omxterm"])
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
    for (const destination of [
      "config/omxterm/snippets.yaml",
      "snippets-catalog.json",
    ])
      await cp(
        "test/fixtures/snippets-catalog.json",
        path.join(root, destination),
      );
    for (const name of [
      "snippets-appimage.cjs",
      "snippets-process-identity.cjs",
      "snippets-observer.cjs",
      "snippets-scenario.cjs",
      "snippets-quartz.cjs",
      "snippets-quartz.swift",
    ])
      await cp(path.join("test/fixtures", name), path.join(root, name));
    await cp(values.ARCHIVE, path.join(root, "snippets.omxext"));
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
        archive: path.join(root, "snippets.omxext"),
        archiveSha256: values.ARCHIVE_SHA256,
        readiness: path.join(root, "shell.json"),
        quartzTool: values.QUARTZ_TOOL,
      }),
    );
    // Only this launcher scope is disposable. Failure profile, app and receipts
    // stay outside it, including when the Vitest worker is cancelled or killed.
    const launcher = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-snippets-dmg-"),
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
    const scenario = JSON.parse(
      await readFile(path.join(evidence, "scenario.json"), "utf8"),
    ) as unknown;
    assert.deepEqual(scenario, {
      checks: [
        "absent-package-management-no-activation",
        "selected-visible-toggle-and-header-close-destroy-fresh-view-same-backend-catalog-PTY",
        "ordinary-archive-trust-enabled-activation",
        "explicit-hide-independent-panel-toggle-retains-exact-view-query",
        "exact-insert-run-native-enter-repeat-release",
        "preview-overrides-both-intents-cancel-restores-focus",
        "retained-search-hide-reactivate",
        "live-en-US-pt-BR-retained-query",
        "disabled-package-management-no-enable",
        "disable-uninstall-unchanged-catalog-live-surface-pty",
      ],
      archiveSha256: values.ARCHIVE_SHA256,
      approvals: 1,
      input:
        "synthetic Quartz session input; tagged OS release and held-state observation; controlled native consent; production macOS ARM64 composition",
    });
    verifyQuartzTool(values.QUARTZ_TOOL); // A retained unsettled marker refuses PASS.
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
          "Packaged bundle changed",
        );
      } catch (error) {
        failures.push(error);
      }
    }
    // Never delete the useful profile: root owns later cleanup on every outcome.
    // Publish a non-success checkpoint before the final await. A cancellation
    // during identity checks or publication cannot leave a successful receipt.
    const outcome = () => ({
      passed: failures.length === 0 && !testContext.signal.aborted,
      failures: failures.map((error) =>
        error instanceof Error ? error.stack : String(error),
      ),
      profileRetained: true,
      scope:
        "Exact DMG-derived app; synthetic Quartz session input; native graphics/sandbox; controlled consent/plain-paste shell; not public HTTPS, physical keyboard, natural autorepeat, Kitty or compositor qualification",
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
    // No await between the final cancellation check and publication/return.
    // This is a completion-boundary snapshot, not immunity to later cancellation
    // or filesystem failure. Missing/truncated receipts are never PASS.
    writeFileSync(
      path.join(evidence, "result.json"),
      JSON.stringify(outcome(), null, 2),
    );
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Exact DMG qualification failed; evidence retained at ${evidence}`,
    );
}
