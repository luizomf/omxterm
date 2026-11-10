import assert from "node:assert/strict";
import { extractFile } from "@electron/asar";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { it } from "vitest";
import { launchLinuxPackagedProcess } from "../../scripts/linux-packaged-process.mjs";
import { inspector, until } from "../fixtures/packaged-inspector.js";
import {
  appImageEnvironment,
  appImageInputs,
} from "../fixtures/snippets-appimage-inputs";

const values = appImageInputs();
const execute = promisify(execFile);
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const scope = values?.publicUpdate
  ? "unchanged extracted stable AppImage; production public catalog update; synthetic Chromium/X11; ANGLE SwiftShader; controlled consent; no FUSE/helper installation"
  : "unchanged extracted AppImage; synthetic Chromium/X11; ANGLE SwiftShader; controlled consent; no FUSE/helper installation or public acquisition";

type Inputs = NonNullable<ReturnType<typeof appImageInputs>>;
const targetDigest =
  "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b";
async function publicTargetIdentity(
  values: Inputs,
  app: Buffer,
  baseline: Buffer,
) {
  if (!values.publicUpdate) return undefined;
  assert.equal(app.length, 128279456);
  assert.equal(baseline.length, 76653);
  const target = await readFile(values.targetArchive);
  assert.equal(target.length, 82635);
  assert.equal(digest(target), targetDigest);
  return { sha256: digest(target), bytes: target.length };
}
function scenarioTimeout(values: Inputs) {
  return values.publicUpdate ? 240000 : 120000;
}
function observerFiles(values: Inputs) {
  return values.publicUpdate
    ? [
        "snippets-public-update.cjs",
        "public-catalog-observer.cjs",
        "ssh-packaged.cjs",
      ]
    : [];
}
// Bind the retained card to this run: a missing, empty or trivial capture is a
// claim without evidence, not a pass.
async function assertRetainedCard(values: Inputs, receipts: string) {
  if (!values.publicUpdate) return;
  const card = await stat(path.join(receipts, "public-update-card.png")).catch(
    () => undefined,
  );
  assert.ok(card, "public update card capture missing");
  assert.ok(card.size > 1024, "public update card capture is trivial");
}
function assertScenario(values: Inputs, scenario: unknown) {
  if (values.publicUpdate) {
    assert.deepEqual(scenario, {
      checks: [
        "local-baseline-generation-1",
        "baseline-activated",
        "public-update-retired-dormant-generation-2",
        "fresh-activation-same-terminal-yaml",
      ],
      approvals: 2,
      input: values.input,
    });
  } else {
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
      input: values.input,
    });
  }
}

// Opt-in on a Linux ARM64/x64 desktop (a VM is safest). The shared
// scenario observes the untouched package, not a replacement application entry.
it.skipIf(!values)(
  "qualifies separate Snippets in the exact Linux AppImage",
  { timeout: 360000 },
  async () => {
    assert.ok(values);
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-snippets-appimage-"),
    );
    const evidence = values.EVIDENCE;
    await mkdir(evidence, { recursive: true });
    // Never allow an earlier successful Quit receipt to qualify this run.
    const receipts = await mkdtemp(path.join(evidence, "run-"));
    const asar = path.join(root, "squashfs-root/resources/app.asar");
    const executable = path.join(root, "squashfs-root/omxterm");
    let asarBefore: string | undefined;
    let owner:
      Awaited<ReturnType<typeof launchLinuxPackagedProcess>> | undefined;
    let client: Awaited<ReturnType<typeof inspector>> | undefined;
    let observer: string | undefined;
    const failures: unknown[] = [];
    let outcome: unknown;
    let stderr = "";
    let passed = false;
    const json = (name: string, value: unknown) =>
      writeFile(path.join(receipts, name), JSON.stringify(value, null, 2));
    try {
      const appBytes = await readFile(values.APPIMAGE);
      const archiveBytes = await readFile(values.ARCHIVE);
      assert.equal(digest(appBytes), values.APPIMAGE_SHA256);
      assert.equal(digest(archiveBytes), values.ARCHIVE_SHA256);
      const targetIdentity = await publicTargetIdentity(
        values,
        appBytes,
        archiveBytes,
      );
      await json("artifacts.json", {
        appImage: { sha256: values.APPIMAGE_SHA256, bytes: appBytes.length },
        archive: { sha256: values.ARCHIVE_SHA256, bytes: archiveBytes.length },
        targetIdentity,
        version: values.VERSION,
      });
      await execute(values.APPIMAGE, ["--appimage-extract"], {
        cwd: root,
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      });
      asarBefore = digest(await readFile(asar));
      assert.equal(
        (
          JSON.parse(extractFile(asar, "package.json").toString()) as {
            version: string;
          }
        ).version,
        values.VERSION,
      );
      for (const name of [
        "home",
        "profile",
        "state",
        "data",
        "bin",
        "config/omxterm",
      ])
        await mkdir(path.join(root, name), { recursive: true });
      await writeFile(
        path.join(root, "home/.snippets-plain-inputrc"),
        "set enable-bracketed-paste off\n",
        { flag: "wx", mode: 0o600 },
      );
      await symlink("/usr/bin/xprop", path.join(root, "bin/xprop"));
      await symlink("/usr/bin/bwrap", path.join(root, "bin/bwrap"));
      await symlink("/bin/sh", path.join(root, "bin/sh"));
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
      const readiness = path.join(root, "shell.json");
      await writeFile(
        path.join(root, "shell.sh"),
        'printf \'{"mainPid":%s,"probePid":%s}\' "$PPID" "$$" > "$1"\nexec /bin/sh -i\n',
      );
      const archive = path.join(root, "snippets.omxext");
      await writeFile(archive, archiveBytes);
      await cp(
        "test/fixtures/snippets-appimage.cjs",
        path.join(root, "observer.cjs"),
      );
      for (const name of [
        "snippets-scenario.cjs",
        "snippets-observer.cjs",
        "snippets-process-identity.cjs",
        ...observerFiles(values),
      ])
        await cp(path.join("test/fixtures", name), path.join(root, name));
      const env = appImageEnvironment(root);
      owner = await launchLinuxPackagedProcess({
        executable,
        args: [
          "--no-sandbox",
          "--ozone-platform=x11",
          "--enable-unsafe-swiftshader",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--inspect=127.0.0.1:0",
          `--user-data-dir=${path.join(root, "profile")}`,
          "-e",
          "/bin/sh",
          path.join(root, "shell.sh"),
          readiness,
        ],
        env,
        expectedExecutable: executable,
        readinessFile: readiness,
        profileRoot: root,
      });
      let exited = false;
      owner.child.once("exit", () => {
        exited = true;
      });
      await json("launch.json", { pid: owner.child.pid, executable, root });
      await until(
        async () =>
          (await readFile(readiness, "utf8").catch(() => "")).length > 0,
        "initial PTY readiness",
      );
      await owner.verifyMain();
      await until(
        () =>
          /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(
            owner!.stderrText(),
          ),
        "loopback inspector",
      );
      const url =
        /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/.exec(
          owner.stderrText(),
        )?.[1];
      assert.ok(url);
      client = await inspector(url);
      observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(asar, "package.json"))})(${JSON.stringify(path.join(root, "observer.cjs"))})`;
      const options = {
        root,
        evidence: receipts,
        executable,
        asar,
        archive,
        archiveSha256: values.ARCHIVE_SHA256,
        version: values.VERSION,
        readiness,
        controlledPlainShell: true,
        ...(values.publicUpdate
          ? { publicUpdate: true, catalogSha256: values.catalogSha256 }
          : {}),
      };
      await json(
        "attachment.json",
        await client.evaluate(
          `${observer}.inspect(${JSON.stringify(options)})`,
          5000,
        ),
      );
      const scenario = await client.evaluate(
        `${observer}.run(${JSON.stringify(options)})`,
        scenarioTimeout(values),
      );
      await json("scenario.json", scenario);
      assertScenario(values, scenario);
      await assertRetainedCard(values, receipts);
      await owner.verifyMain();
      await client.evaluate(`${observer}.quit(); true`, 5000);
      await until(
        async () =>
          (
            await readFile(path.join(receipts, "quit.json"), "utf8").catch(
              () => "",
            )
          ).length > 0,
        "normal Quit receipt",
      );
      const quit = JSON.parse(
        await readFile(path.join(receipts, "quit.json"), "utf8"),
      ) as { joined: boolean; baselineExited: boolean };
      assert.equal(quit.joined, true);
      assert.equal(quit.baselineExited, true);
      client.close();
      client = undefined;
      await until(() => exited, "actual Electron main exit", 5000);
      outcome = await owner.stop();
      stderr = owner.stderrText();
      owner = undefined;
      assert.deepEqual(outcome, { code: 0, signal: null });
      passed = true;
    } catch (error) {
      failures.push(error);
      if (client && observer) {
        try {
          await json(
            "observer-failure.json",
            await client.evaluate(`${observer}.diagnose()`, 3000),
          );
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      if (client && observer) {
        try {
          // Keep controlled consent installed until native shutdown joins.
          await client.evaluate(`${observer}.abort(); true`, 5000);
        } catch (error) {
          failures.push(error);
        }
      }
      client?.close();
      if (owner) {
        try {
          outcome = await owner.stop();
        } catch (error) {
          failures.push(error);
        }
        stderr = owner.stderrText();
      }
      for (const [file, expected] of [
        [asar, asarBefore],
        [values.APPIMAGE, values.APPIMAGE_SHA256],
        [values.ARCHIVE, values.ARCHIVE_SHA256],
        ...(values.publicUpdate
          ? [[values.targetArchive, targetDigest] as const]
          : []),
      ] as const) {
        if (!expected) continue;
        try {
          assert.equal(
            digest(await readFile(file)),
            expected,
            "artifact changed",
          );
        } catch (error) {
          failures.push(error);
        }
      }
      await json("supervisor.json", {
        passed: passed && failures.length === 0,
        outcome,
        stderr,
        root,
        asarSha256: asarBefore,
        failures: failures.map((error) =>
          error instanceof Error ? error.stack : String(error),
        ),
        scope,
      });
      if (passed && failures.length === 0)
        await rm(root, { recursive: true, force: true });
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `Packaged Snippets failed; retained ${root}; receipts ${receipts}`,
      );
  },
);
