/* eslint-disable max-lines -- Legacy and installed public modes share one supervised owner. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "./run-native-fixture";
import { type windowsExactInputs } from "./snippets-windows-exact-inputs";
import {
  assertOutsideInstalledPrefix,
  type PublicNativeRun,
} from "./snippets-windows-public-fence";
import {
  digest,
  fileIdentity,
  inspectWindowsStage,
  SNIPPETS_SHA256,
  snapshotWindowsStage,
  verifySnippetsArchive,
} from "./snippets-windows-exact-identity";

const checks = [
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
];

const publicChecks = [
  "public-catalog-install-official-trust-dormant",
  "explicit-toggle-exact-run-child-receipt",
  "public-reinstall-old-backend-joined-dormant",
  "disable-enable-uninstall-unchanged-catalog",
  "same-surface-pty-usable-before-quit",
];

export type InstalledPublicMode = {
  kind: "installed-public";
  installedRoot: string;
  runNative: PublicNativeRun;
};

// eslint-disable-next-line max-lines-per-function, complexity -- Keep artifact checks and failure finalization around the same supervised campaign.
export async function runWindowsExactCampaign(
  values: NonNullable<ReturnType<typeof windowsExactInputs>>,
  testContext: NativeFixtureTestContext,
  mode?: InstalledPublicMode,
) {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "arm64");
  await mkdir(values.EVIDENCE, { recursive: true });
  const stageReal = await realpath(mode ? mode.installedRoot : values.STAGE);
  const evidenceReal = await realpath(values.EVIDENCE);
  const relation = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };
  assert.ok(
    !relation(stageReal, evidenceReal) && !relation(evidenceReal, stageReal),
    "stage and evidence must be separate",
  );
  const evidence = await mkdtemp(path.join(values.EVIDENCE, "run-"));
  const root = path.join(evidence, "fixture");
  await mkdir(root);
  const supervisorEvidence = path.join(
    values.EVIDENCE,
    `supervisor-${path.basename(evidence)}.json`,
  );
  const inputMarker = path.join(
    values.EVIDENCE,
    `windows-snippets-input-${randomUUID()}.json`,
  );
  const json = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  const failures: unknown[] = [];
  let stageBefore: Awaited<ReturnType<typeof snapshotWindowsStage>> | undefined;
  let archiveBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  let installerBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  let nodeBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  try {
    await json("supervisor-location.json", {
      evidencePath: supervisorEvidence,
      inputMarker,
    });
    if (mode) {
      assert.equal(
        process.versions.node.split(".")[0],
        "24",
        "Node 24 required",
      );
      assertOutsideInstalledPrefix(stageReal, [
        evidenceReal,
        process.execPath,
        await realpath(process.execPath),
        process.cwd(),
        await realpath(process.cwd()),
        await realpath(values.STAGE),
        await realpath(values.INSTALLER),
        await realpath(values.ARCHIVE),
      ]);
    }
    nodeBefore = await fileIdentity(process.execPath);
    await json("node-before.json", nodeBefore);
    stageBefore = await snapshotWindowsStage(stageReal);
    await json("stage-before.json", stageBefore);
    archiveBefore = await fileIdentity(values.ARCHIVE);
    await json("archive-before.json", archiveBefore);
    assert.deepEqual(
      await verifySnippetsArchive(values.ARCHIVE),
      archiveBefore,
      "archive changed during inspection",
    );
    installerBefore = await fileIdentity(values.INSTALLER);
    await json("installer-before.json", installerBefore);
    assert.equal(
      installerBefore.sha256,
      values.INSTALLER_SHA256,
      "installer identity mismatch",
    );
    testContext.signal.throwIfAborted();
    const stage = await inspectWindowsStage(stageReal, values.VERSION);
    assert.deepEqual(
      stage.snapshot,
      stageBefore,
      "stage changed during inspection",
    );
    if (mode) {
      assert.deepEqual(
        await fileIdentity(stage.asar),
        {
          bytes: 18_344_994,
          sha256:
            "d9d3b4d67ebfb7aed7dbbf50f2b74f7282637e720ba670d2c6e57c34f61ea709",
        },
        "installed public ASAR identity",
      );
      assert.equal(
        stage.asarSha256,
        "d9d3b4d67ebfb7aed7dbbf50f2b74f7282637e720ba670d2c6e57c34f61ea709",
      );
    }
    const lockBytes = await readFile("package-lock.json");
    const lock = JSON.parse(lockBytes.toString()) as {
      packages: Record<string, { version?: string }>;
    };
    const host = JSON.parse(await readFile("package.json", "utf8")) as {
      version: string;
    };
    const restty = JSON.parse(
      await readFile("node_modules/restty/package.json", "utf8"),
    ) as { version: string };
    const electronVersion = lock.packages["node_modules/electron"]?.version;
    assert.equal(
      host.version,
      values.VERSION,
      "source/packaged host version mismatch",
    );
    assert.equal(
      stage.nodePtyVersion,
      lock.packages["node_modules/node-pty"]?.version,
      "packaged node-pty differs from lock",
    );
    assert.equal(
      restty.version,
      lock.packages["node_modules/restty"]?.version,
      "fixture Restty differs from lock",
    );
    assert.equal(
      stage.resttyVersion,
      restty.version,
      "packaged Restty version differs from fixture",
    );
    // This runtime's instantiation boundary was checked with native ESM/CJS controls.
    // A dependency update needs fresh proof, not an unarmed resume to a later body.
    assert.equal(
      electronVersion,
      "43.8.1",
      "unverified Electron early-arm runtime",
    );
    for (const name of [
      "home",
      "profile",
      "appdata",
      "localappdata",
      "temp",
      "config/omxterm",
      "state",
      "data",
    ])
      await mkdir(path.join(root, name), { recursive: true });
    await writeFile(
      path.join(root, "config/omxterm/config.json"),
      JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
    );
    await cp(
      "test/fixtures/snippets-windows-catalog.json",
      path.join(root, "config/omxterm/snippets.yaml"),
    );
    if (mode)
      await cp(
        "test/fixtures/snippets-windows-public-scenario.cjs",
        path.join(root, "snippets-windows-public-scenario.cjs"),
      );
    for (const name of [
      "snippets-windows-exact-observer.cjs",
      "snippets-observer.cjs",
      "snippets-scenario.cjs",
      "snippets-windows-readiness.cjs",
      "snippets-windows-probe.cjs",
      "snippets-windows-cpr.cjs",
      "snippets-windows-input.cjs",
      "snippets-windows-input.ps1",
      "snippets-windows-catalog.json",
    ])
      await cp(path.join("test/fixtures", name), path.join(root, name));
    const parser = path.join(root, "snippets-windows-parser.cjs");
    const parserBuild = await build({
      entryPoints: ["test/fixtures/snippets-windows-parser.ts"],
      outfile: parser,
      bundle: true,
      platform: "node",
      format: "cjs",
      metafile: true,
      logLevel: "silent",
    });
    const parserInputs = await Promise.all(
      Object.keys(parserBuild.metafile.inputs)
        .sort()
        .map(async (file) => ({ file, sha256: digest(await readFile(file)) })),
    );
    await build({
      entryPoints: ["test/fixtures/native-fixture-processes.ts"],
      outfile: path.join(root, "fixture-processes.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    });
    await json("artifacts.json", {
      ...(mode
        ? { installed: stage, referenceStage: values.STAGE }
        : { stage }),
      installer: { path: values.INSTALLER, ...installerBefore },
      archive: { path: values.ARCHIVE, ...archiveBefore },
      parser: {
        version: restty.version,
        bundleSha256: digest(await readFile(parser)),
        lockSha256: digest(lockBytes),
        inputs: parserInputs,
      },
      controllerNode: {
        executable: process.execPath,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        ...nodeBefore,
      },
      electronVersion,
    });
    const options = path.join(evidence, "options.json");
    await writeFile(
      options,
      JSON.stringify({
        root,
        evidence,
        executable: stage.executable,
        asar: stage.asar,
        archive: values.ARCHIVE,
        archiveSha256: SNIPPETS_SHA256,
        version: values.VERSION,
        electronVersion,
        entrySha256: stage.entrySha256,
        earlyLoaderProof: {
          sourceSha256:
            "1a8f350a32ce47b4e45b2251fc15f4438d322b5b9d227dc74d5f9846fb0ccacf",
          lineNumber: 452,
          columnNumber: 8,
        },
        node: process.execPath,
        inputMarker,
        probe: values.probe,
        ...(mode ? { publicCatalog: true } : {}),
      }),
    );
    const launcher = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-snippets-win-exact-"),
    );
    if (mode) {
      assertOutsideInstalledPrefix(stageReal, [
        launcher,
        await realpath(launcher),
        root,
        await realpath(root),
      ]);
      await json("native-association.json", {
        installedRoot: stageReal,
        executable: stage.executable,
        asar: stage.asar,
        installedSnapshot: stage.snapshot.sha256,
        launcher,
        profileRoot: root,
        supervisorEvidence,
      });
    }
    const driver = path.join(launcher, "driver.cjs");
    let preparationOwned = false;
    const native = () =>
      runNativeFixture({
        executable: process.execPath,
        args: [driver, options],
        root: launcher,
        timeout: mode ? 240000 : 120000,
        evidencePath: supervisorEvidence,
        testContext,
        prepare: async () => {
          preparationOwned = true;
          await build({
            entryPoints: ["test/fixtures/snippets-windows-exact-main.ts"],
            outfile: driver,
            bundle: true,
            platform: "node",
            format: "cjs",
            logLevel: "silent",
          });
        },
      });
    const result = await (
      mode ? mode.runNative(supervisorEvidence, native) : native()
    ).catch(async (error: unknown) => {
      if (!preparationOwned)
        await rm(launcher, { recursive: true, force: true });
      throw error;
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
    if (values.probe) {
      const probe = JSON.parse(
        await readFile(path.join(evidence, "probe.json"), "utf8"),
      ) as {
        classification?: unknown;
        ready?: unknown;
        mainPid?: unknown;
        pty?: { pid?: unknown; identity?: unknown };
      };
      assert.equal(probe.classification, "early-arm-probe-not-qualification");
      assert.equal(probe.ready, true);
      assert.ok(
        Number.isSafeInteger(probe.mainPid) && Number(probe.mainPid) > 0,
      );
      assert.ok(
        Number.isSafeInteger(probe.pty?.pid) &&
          Number(probe.pty?.pid) > 0 &&
          typeof probe.pty?.identity === "string" &&
          probe.pty.identity.length > 0,
      );
    } else {
      assert.deepEqual(
        JSON.parse(
          await readFile(path.join(evidence, "scenario.json"), "utf8"),
        ),
        {
          checks: mode ? publicChecks : checks,
          archiveSha256: SNIPPETS_SHA256,
          approvals: mode ? 2 : 1,
          input: mode
            ? "synthetic Chromium input; controlled Official consent and Node ConPTY probe; production public HTTPS"
            : "synthetic Windows SendInput; independently observed held/released state; controlled native consent and ConPTY probe; production Windows ARM64 composition",
        },
      );
    }
    if (mode) {
      const attachment = JSON.parse(
        await readFile(path.join(evidence, "attachment.json"), "utf8"),
      ) as Record<string, unknown>;
      assert.ok(
        Number.isSafeInteger(attachment.pid) && Number(attachment.pid) > 0,
      );
      assert.deepEqual(
        Object.fromEntries(
          [
            "armed",
            "windows",
            "ptys",
            "packaged",
            "version",
            "executable",
            "asar",
            "electron",
            "node",
          ].map((key) => [key, attachment[key]]),
        ),
        {
          armed: true,
          windows: 0,
          ptys: 0,
          packaged: true,
          version: values.VERSION,
          executable: stage.executable,
          asar: stage.asar,
          electron: "43.8.1",
          node: "24.22.0",
        },
        "installed runtime attachment differs from pinned loader proof",
      );
      assert.deepEqual(
        await readFile(path.join(root, "config/omxterm/snippets.yaml")),
        await readFile("test/fixtures/snippets-windows-catalog.json"),
        "Snippets YAML changed",
      );
    }
    const controller = JSON.parse(
      await readFile(path.join(evidence, "controller.json"), "utf8"),
    ) as unknown;
    assert.ok(controller && typeof controller === "object");
    assert.deepEqual(
      Object.fromEntries(
        [
          "outcome",
          "closed",
          "stdoutEnded",
          "stderrEnded",
          "truncated",
          "failures",
        ].map((key) => [key, (controller as Record<string, unknown>)[key]]),
      ),
      {
        outcome: { code: 0, signal: null },
        closed: true,
        stdoutEnded: true,
        stderrEnded: true,
        truncated: false,
        failures: [],
      },
    );
    const quit = JSON.parse(
      await readFile(path.join(evidence, "quit.json"), "utf8"),
    ) as {
      joined?: unknown;
      ptys?: Array<{ pid?: unknown; exited?: unknown }>;
      children?: Array<{ pid?: unknown; closed?: unknown; exit?: unknown }>;
      identities?: Array<{
        pid?: unknown;
        identity?: unknown;
        alive?: unknown;
      }>;
    };
    assert.equal(quit.joined, true);
    if (mode) {
      assert.equal(quit.ptys?.length, 1, "one joined PTY required");
      assert.equal(quit.ptys[0]?.exited, true, "PTY onExit required");
      assert.equal(quit.children?.length, 2, "two joined backends required");
      for (const child of quit.children) {
        assert.equal(child.closed, true, "backend close required");
        assert.deepEqual(
          child.exit,
          { code: 0, signal: null },
          "backend exit required",
        );
      }
      assert.equal(
        quit.identities?.length,
        3,
        "three creation identities required",
      );
      const observed = [quit.ptys[0], ...quit.children];
      const keys = new Set<string>();
      for (const [index, owned] of quit.identities.entries()) {
        assert.ok(Number.isSafeInteger(owned.pid) && Number(owned.pid) > 0);
        assert.equal(owned.pid, observed[index]?.pid);
        assert.ok(
          typeof owned.identity === "string" &&
            owned.identity.length > 0 &&
            owned.identity !== "exited",
        );
        assert.equal(owned.alive, false);
        keys.add(`${owned.pid}:${owned.identity}`);
      }
      assert.equal(keys.size, 3, "distinct creation identities required");
    }
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      const after = await snapshotWindowsStage(stageReal);
      await json("stage-after.json", after);
      assert.equal(
        await realpath(mode ? mode.installedRoot : values.STAGE),
        stageReal,
        "stage path changed",
      );
      assert.ok(stageBefore, "no initial stage snapshot");
      assert.deepEqual(after, stageBefore, "stage changed");
    } catch (error) {
      failures.push(error);
    }
    try {
      const after = await fileIdentity(values.ARCHIVE);
      await json("archive-after.json", after);
      assert.deepEqual(
        await verifySnippetsArchive(values.ARCHIVE),
        after,
        "archive changed during final inspection",
      );
      assert.ok(archiveBefore, "no initial archive identity");
      assert.deepEqual(after, archiveBefore, "archive changed");
    } catch (error) {
      failures.push(error);
    }
    try {
      const after = await fileIdentity(values.INSTALLER);
      await json("installer-after.json", after);
      assert.equal(after.sha256, values.INSTALLER_SHA256, "installer changed");
      assert.ok(installerBefore, "no initial installer identity");
      assert.deepEqual(after, installerBefore, "installer changed");
    } catch (error) {
      failures.push(error);
    }
    try {
      const after = await fileIdentity(process.execPath);
      await json("node-after.json", after);
      assert.ok(nodeBefore, "no initial Node identity");
      assert.deepEqual(after, nodeBefore, "controlled Node changed");
    } catch (error) {
      failures.push(error);
    }
    const outcome = () => ({
      passed:
        !mode &&
        !values.probe &&
        failures.length === 0 &&
        !testContext.signal.aborted,
      probeComplete:
        values.probe && failures.length === 0 && !testContext.signal.aborted,
      failures: failures.map((error) =>
        error instanceof Error ? error.stack : String(error),
      ),
      profileRetained: true,
      scope: mode
        ? "Installed Windows ARM64 public catalog checkpoint; transaction cleanup and final public result owned by outer campaign"
        : "Exact staged Windows ARM64 executable; synthetic SendInput and controlled Node ConPTY probe; no installed-path, public acquisition, physical keyboard, natural autorepeat or compositor qualification",
    });
    try {
      await json("result.json", {
        ...outcome(),
        passed: false,
        probeComplete: false,
        finalizing: true,
      });
    } catch (error) {
      failures.push(error);
    }
    if (testContext.signal.aborted) failures.push(testContext.signal.reason);
    try {
      writeFileSync(
        path.join(evidence, "result.json"),
        JSON.stringify(outcome(), null, 2),
      );
    } catch (error) {
      if (!mode) throw error;
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Exact Windows Snippets campaign failed; evidence retained at ${evidence}`,
    );
  return { evidence };
}
