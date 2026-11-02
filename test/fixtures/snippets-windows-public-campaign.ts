import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { writeFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { verifyExactWindowsInstaller } from "../../scripts/windows-installer-transaction.mjs";
import type { NativeFixtureTestContext } from "./run-native-fixture";
import { runWindowsExactCampaign } from "./snippets-windows-exact-campaign";
import {
  fileIdentity,
  snapshotWindowsStage,
  verifySnippetsArchive,
} from "./snippets-windows-exact-identity";
import { createPublicInstallerFence } from "./snippets-windows-public-fence";
import {
  PUBLIC_INSTALLER_BYTES,
  PUBLIC_INSTALLER_SHA256,
  PUBLIC_VERSION,
  type windowsPublicInputs,
} from "./snippets-windows-public-inputs";

type Values = NonNullable<ReturnType<typeof windowsPublicInputs>>;
type Execute = NonNullable<
  Parameters<typeof verifyExactWindowsInstaller>[0]["execute"]
>;
const execFile = promisify(execFileCallback);

function describeFailure(error: unknown): unknown {
  if (error instanceof AggregateError)
    return {
      message: error.message,
      errors: error.errors.map(describeFailure),
    };
  return error instanceof Error
    ? { message: error.message, stack: error.stack }
    : String(error);
}

async function prospectiveRealPath(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await lstat(file);
      throw new Error("Unresolvable evidence path");
    } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code !== "ENOENT") throw missing;
    }
    const parent = path.dirname(file);
    assert.notEqual(parent, file, "Unresolvable evidence parent");
    return path.join(await prospectiveRealPath(parent), path.basename(file));
  }
}

function assertSeparateStageAndLane(stage: string, lane: string) {
  const contains = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };
  assert.ok(
    !contains(stage, lane) && !contains(lane, stage),
    "reference stage and evidence lane must be separate",
  );
}

// The outer owner publishes success only after the stock transaction and all final checks.
export async function runWindowsPublicCampaign(
  values: Values,
  testContext: NativeFixtureTestContext,
  execute: Execute = execFile,
) {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "arm64");
  assert.equal(values.DISPOSABLE_VM, "1");
  assert.equal(values.VERSION, PUBLIC_VERSION);
  for (const value of [
    values.STAGE,
    values.INSTALLER,
    values.ARCHIVE,
    values.EVIDENCE,
  ])
    assert.ok(path.isAbsolute(value), "Public fixture paths must be absolute");
  const initialStage = await realpath(values.STAGE);
  assertSeparateStageAndLane(
    initialStage,
    await prospectiveRealPath(values.EVIDENCE),
  );
  await mkdir(values.EVIDENCE, { recursive: true });
  const lane = await realpath(values.EVIDENCE);
  assertSeparateStageAndLane(initialStage, lane);
  const evidence = await mkdtemp(path.join(lane, "public-"));
  const resultFile = path.join(evidence, "result.json");
  const failures: unknown[] = [];
  let stageBefore: Awaited<ReturnType<typeof snapshotWindowsStage>> | undefined;
  let installerBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  let archiveBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  let nodeBefore: Awaited<ReturnType<typeof fileIdentity>> | undefined;
  let stage = "";
  let transaction:
    Awaited<ReturnType<typeof verifyExactWindowsInstaller>> | undefined;
  let innerEvidence: string | undefined;
  const result = (passed: boolean, finalizing: boolean) => ({
    passed,
    finalizing,
    failures: failures.map(describeFailure),
    innerEvidence,
    transaction,
    scope:
      "Installed public Windows ARM64 Snippets checkpoint; controlled consent and synthetic Node ConPTY input, not physical keyboard or general descendant containment",
  });
  await writeFile(resultFile, JSON.stringify(result(false, true), null, 2));
  try {
    assert.equal(process.versions.node.split(".")[0], "24", "Node 24 required");
    stage = await realpath(values.STAGE);
    assert.equal(stage, initialStage, "reference stage path changed");
    const installer = await realpath(values.INSTALLER);
    const archive = await realpath(values.ARCHIVE);
    const projectRoot = await realpath(process.cwd());
    const temporaryDirectory = await realpath(os.tmpdir());
    const systemRoot = process.env.SystemRoot;
    assert.ok(
      systemRoot && path.isAbsolute(systemRoot),
      "absolute SystemRoot required",
    );
    stageBefore = await snapshotWindowsStage(stage);
    installerBefore = await fileIdentity(installer);
    assert.deepEqual(
      installerBefore,
      { bytes: PUBLIC_INSTALLER_BYTES, sha256: PUBLIC_INSTALLER_SHA256 },
      "public NSIS identity",
    );
    assert.equal(values.INSTALLER_SHA256, PUBLIC_INSTALLER_SHA256);
    archiveBefore = await verifySnippetsArchive(archive);
    nodeBefore = await fileIdentity(process.execPath);
    await writeFile(
      path.join(evidence, "inputs.json"),
      JSON.stringify(
        {
          referenceStage: stage,
          referenceStageSnapshot: stageBefore,
          installer: { path: installer, ...installerBefore },
          archiveIdentityReferenceOnly: { path: archive, ...archiveBefore },
          controllerNode: {
            path: await realpath(process.execPath),
            version: process.version,
            ...nodeBefore,
          },
          sourceProjectRoot: projectRoot,
          fixtureSourceBase: "afc07106edb25c7ab277588bb092f6358654a4a0",
          publishedProductTagCommit: "c04a350fcd5d5a411b1993300cb62eab4a0feace",
          provenanceNote:
            "Assigned fixture base and immutable product tag are distinct; source may contain subsequent fixture changes.",
        },
        null,
        2,
      ),
    );
    const fence = createPublicInstallerFence({
      installer,
      temporaryDirectory,
      projectRoot,
      systemRoot,
      evidenceDirectory: lane,
      execute,
    });
    testContext.signal.throwIfAborted();
    transaction = await verifyExactWindowsInstaller({
      installer,
      unpackedRoot: stage,
      projectRoot,
      disposableVm: true,
      temporaryDirectory,
      execute: fence.execute,
      verifyInstalled: (installedRoot) =>
        fence.verifyInstalled(installedRoot, async (runNative) => {
          const run = await runWindowsExactCampaign(
            {
              ...values,
              STAGE: stage,
              INSTALLER: installer,
              ARCHIVE: archive,
              EVIDENCE: lane,
              probe: false,
            },
            testContext,
            { kind: "installed-public", installedRoot, runNative },
          );
          innerEvidence = run.evidence;
        }),
    });
  } catch (error) {
    failures.push(error);
  } finally {
    for (const check of [
      async () => {
        assert.ok(stageBefore);
        assert.equal(await realpath(values.STAGE), stage);
        assert.deepEqual(
          await snapshotWindowsStage(stage),
          stageBefore,
          "reference stage changed",
        );
      },
      async () => {
        assert.ok(installerBefore);
        assert.deepEqual(
          await fileIdentity(values.INSTALLER),
          installerBefore,
          "installer changed",
        );
      },
      async () => {
        assert.ok(archiveBefore);
        assert.deepEqual(
          await verifySnippetsArchive(values.ARCHIVE),
          archiveBefore,
          "archive changed",
        );
      },
      async () => {
        assert.ok(nodeBefore);
        assert.deepEqual(
          await fileIdentity(process.execPath),
          nodeBefore,
          "Node changed",
        );
      },
    ])
      try {
        await check();
      } catch (error) {
        failures.push(error);
      }
    if (testContext.signal.aborted) failures.push(testContext.signal.reason);
    try {
      await writeFile(resultFile, JSON.stringify(result(false, true), null, 2));
    } catch (error) {
      failures.push(error);
    }
    if (
      testContext.signal.aborted &&
      !failures.includes(testContext.signal.reason)
    )
      failures.push(testContext.signal.reason);
    try {
      writeFileSync(
        resultFile,
        JSON.stringify(
          result(
            failures.length === 0 &&
              !!transaction &&
              !testContext.signal.aborted,
            false,
          ),
          null,
          2,
        ),
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Public Windows Snippets campaign failed; evidence retained at ${evidence}`,
    );
  return { evidence, innerEvidence };
}
