import assert from "node:assert/strict";
import { extractFile } from "@electron/asar";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { it } from "vitest";
import { launchLinuxPackagedProcess } from "../../scripts/linux-packaged-process.mjs";
import { inspector, until } from "../fixtures/packaged-inspector";
import {
  assertAbsentRoots,
  assertColdPause,
  assertDormant,
  assertNoNetwork,
  hash,
  ordinaryInputs,
  packageSource,
  snippetsSha256,
  type ColdPause,
} from "../fixtures/snippets-ordinary";

const values = ordinaryInputs();
const execute = promisify(execFile);
type Snapshot = {
  ptys: Array<{ pid: number; output: string; exited: boolean }>;
  forks: unknown[];
  views: string[];
  urls: string[];
  yamlWrites: string[];
  approvals: number;
  identity: { pid: number };
};

it.skipIf(!values)(
  "qualifies ordinary default Snippets in one exact Linux ARM64 package",
  { timeout: 360000 },
  // eslint-disable-next-line max-lines-per-function -- One owner retains both ordinary histories, exact bytes and process settlement across restart.
  async () => {
    assert.ok(values);
    // Every ordinary root is task-owned from verified absence. Never adopt an
    // existing developer profile or remove/reset a consumed witness for a retry.
    assertAbsentRoots([values.profile, values.state]);
    await mkdir(values.evidence, { recursive: true });
    const evidence = await mkdtemp(path.join(values.evidence, "ordinary-"));
    const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-ordinary-"));
    const json = (file: string, data: unknown) =>
      writeFile(path.join(evidence, file), JSON.stringify(data, null, 2));
    const appBytes = await readFile(values.appImage);
    assert.equal(hash(appBytes), values.digest);
    await execute(values.appImage, ["--appimage-extract"], {
      cwd: root,
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const executable = path.join(root, "squashfs-root/omxterm");
    const asar = path.join(root, "squashfs-root/resources/app.asar");
    const archive = path.join(
      root,
      "squashfs-root/resources/bundled-snippets/snippets-0.1.0.omxext",
    );
    const asarDigest = hash(await readFile(asar));
    const entryBytes = extractFile(asar, "dist/main/index.js");
    assert.equal(
      (
        JSON.parse(extractFile(asar, "package.json").toString()) as {
          version: string;
        }
      ).version,
      "0.25.0",
    );
    assert.equal(hash(await readFile(archive)), snippetsSha256);
    await cp(
      "test/fixtures/snippets-ordinary.cjs",
      path.join(root, "observer.cjs"),
    );
    const shell = path.join(root, "shell.sh");
    await writeFile(
      shell,
      'printf \'{"mainPid":%s,"probePid":%s}\' "$PPID" "$$" > "$1"\nprintf "ORDINARY_SHELL_READY\\n"\nexec /bin/sh -i\n',
    );
    const registryFile = path.join(values.profile, "extensions/registry.json");
    const witness = path.join(values.profile, "provisioning/default-snippets");
    const yaml = path.join(values.config, "snippets.yaml");
    const exists = async (file: string) =>
      lstat(file).then(
        () => true,
        (e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") return false;
          throw e;
        },
      );
    const registry = async () =>
      JSON.parse(await readFile(registryFile, "utf8")) as {
        installations: Array<{
          generation: number;
          enabled: boolean;
          digest: string | null;
          id: string;
        }>;
      };
    const expectRegistry = async (generation: number, enabled: boolean) => {
      const entries = (await registry()).installations;
      assert.equal(entries.length, generation === 0 ? 0 : 1);
      if (generation)
        assert.deepEqual(
          entries.map(({ id, generation: g, enabled: e, digest }) => ({
            id,
            generation: g,
            enabled: e,
            digest,
          })),
          [
            {
              id: "omxterm.snippets",
              generation,
              enabled,
              digest: generation === 3 ? null : snippetsSha256,
            },
          ],
        );
    };
    const retained: Record<string, string> = {};
    const checkSentinels = async () => {
      for (const [file, bytes] of Object.entries(retained))
        assert.equal(await readFile(file, "utf8"), bytes);
    };
    const phases: unknown[] = [];
    let completed = false;
    async function phase(
      name: string,
      generation: number,
      enabled: boolean,
      seeded: boolean,
      action?: "install-disable" | "Disable" | "Uninstall",
    ) {
      const directory = path.join(evidence, name);
      await mkdir(directory);
      const readiness = path.join(directory, "readiness.json");
      const netlog = path.join(directory, "netlog.json");
      const env = { ...process.env };
      for (const key of [
        "NODE_OPTIONS",
        "NODE_INSPECT_RESUME_ON_START",
        "ELECTRON_RUN_AS_NODE",
        "APPIMAGE",
        "APPDIR",
      ])
        delete env[key];
      const owner = await launchLinuxPackagedProcess({
        executable,
        expectedExecutable: executable,
        args: [
          "--no-sandbox",
          "--ozone-platform=x11",
          "--inspect-brk=127.0.0.1:0",
          `--log-net-log=${netlog}`,
          "-e",
          "/bin/sh",
          shell,
          readiness,
        ],
        env,
        readinessFile: readiness,
        profileRoot: directory,
      });
      let client: Awaited<ReturnType<typeof inspector>> | undefined;
      let closed = false;
      owner.child.once("close", () => {
        closed = true;
      });
      let stopped = false;
      let phaseFailure: unknown;
      const observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(asar, "package.json"))})(${JSON.stringify(path.join(root, "observer.cjs"))})`;
      const call = (expression: string) => {
        assert.ok(client);
        return client.evaluate(`${observer}.current().${expression}`, 20000);
      };
      try {
        await until(
          () =>
            /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(
              owner.stderrText(),
            ),
          "cold inspector endpoint",
        );
        const endpoint =
          /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/.exec(
            owner.stderrText(),
          )![1]!;
        client = await inspector(endpoint);
        await client.request("Debugger.enable", {}, 5000);
        await client.request("Runtime.runIfWaitingForDebugger", {}, 5000);
        const pause = (await client.nextEvent(
          "Debugger.paused",
          5000,
        )) as ColdPause;
        const entryUrl = pathToFileURL(
          path.join(asar, "dist/main/index.js"),
        ).href;
        const getSource = async (id: string) =>
          (
            (await client!.request(
              "Debugger.getScriptSource",
              { scriptId: id },
              5000,
            )) as { scriptSource: string }
          ).scriptSource;
        const loader = pause.callFrames.find(
          (f) =>
            client!.scriptUrl(f.location.scriptId) ===
            "node:internal/modules/esm/module_job",
        );
        assert.ok(loader, "pre-evaluation loader frame");
        const loaderSource = await getSource(loader.location.scriptId);
        assertColdPause(pause, client.scriptUrl, entryUrl, hash(loaderSource));
        assert.equal(
          hash(await getSource(pause.callFrames[0]!.location.scriptId)),
          hash(entryBytes),
        );
        await writeFile(
          path.join(directory, "pause.json"),
          JSON.stringify(
            {
              pause,
              entryUrl,
              entrySha256: hash(entryBytes),
              loaderSha256: hash(loaderSource),
            },
            null,
            2,
          ),
        );
        const armed = (await client.request(
          "Debugger.evaluateOnCallFrame",
          {
            callFrameId: pause.callFrames[0]!.callFrameId,
            expression: `${observer}.arm(${JSON.stringify({ asar, executable, profile: values!.profile, archive, archiveSha256: snippetsSha256, version: "0.25.0", evidence: directory, manualInstall: action === "install-disable" })})`,
            returnByValue: true,
          },
          5000,
        )) as {
          result: {
            value: {
              armed: boolean;
              pid: number;
              ready: boolean;
              ptys: number;
            };
          };
        };
        assert.deepEqual(armed.result.value, {
          armed: true,
          pid: owner.child.pid,
          ready: false,
          windows: 0,
          ptys: 0,
        });
        await client.request("Debugger.resume", {}, 5000);
        await client.request("Debugger.disable", {}, 5000);
        await until(
          async () => (await call("ready()")) === true,
          "real production Surface and PTY readiness",
        );
        await owner.verifyMain();
        const initial = (await call("snapshot()")) as Snapshot;
        assertDormant(initial);
        assert.equal(initial.ptys.length, 1);
        assert.equal(initial.ptys[0]!.exited, false);
        await expectRegistry(generation, enabled);
        assert.equal(await exists(witness), seeded);
        if (seeded)
          assert.equal(
            await readFile(witness, "utf8"),
            "snippets-default-attempt-v1\n",
          );
        if (!Object.keys(retained).length)
          assert.equal(await exists(yaml), false);
        await checkSentinels();
        const marker = `ORDINARY_${name.replaceAll("-", "_").toUpperCase()}`;
        await call(`terminal(${JSON.stringify(marker)})`);
        await until(
          async () =>
            ((await call("snapshot()")) as Snapshot).ptys[0]!.output.includes(
              `\r\n${marker}\r\n`,
            ),
          "retained PTY synthetic output",
        );
        await call(
          `capture(${JSON.stringify(path.join(directory, "terminal.png"))})`,
        );
        const waitRegistry = async (g: number, e: boolean) =>
          until(async () => {
            try {
              await expectRegistry(g, e);
              return true;
            } catch {
              return false;
            }
          }, "ordinary management registry publication");
        if (action === "install-disable") {
          await call('management("Install local .omxext…")');
          await waitRegistry(1, true);
          await call('management("Disable")');
          await waitRegistry(2, false);
        } else if (action) {
          await call(`management(${JSON.stringify(action)})`);
          await waitRegistry(action === "Disable" ? 2 : 3, false);
        } else await call("management()");
        const capturedGeneration =
          action === "Disable" || action === "install-disable"
            ? 2
            : action === "Uninstall"
              ? 3
              : generation;
        await call(
          `captureManagement(${JSON.stringify(path.join(directory, "management.png"))}, ${capturedGeneration}, ${action ? false : enabled})`,
        );
        const final = (await call("snapshot()")) as Snapshot;
        assertDormant(final);
        assert.equal(final.ptys[0]!.pid, initial.ptys[0]!.pid);
        assert.equal(final.ptys[0]!.exited, false);
        assert.equal(final.approvals, action === "install-disable" ? 1 : 0);
        await writeFile(
          path.join(directory, "snapshot.json"),
          JSON.stringify(
            { initial, final, registry: await registry() },
            null,
            2,
          ),
        );
        await call("closeSettings()");
        await owner.verifyMain();
        await call("quit()");
        await until(
          () => exists(path.join(directory, "quit.json")),
          "natural Quit receipt",
        );
        client.close();
        client = undefined;
        await until(() => closed, "actual main exit and streams closed", 5000);
        const outcome = await owner.stop();
        stopped = true;
        assert.deepEqual(outcome, { code: 0, signal: null });
        const quit = JSON.parse(
          await readFile(path.join(directory, "quit.json"), "utf8"),
        ) as { joined: boolean; natural: boolean; quitApprovals: number };
        assert.equal(quit.joined, true);
        assert.equal(quit.natural, true);
        assert.equal(
          quit.quitApprovals,
          1,
          "one controlled normal-Quit consent",
        );
        assertNoNetwork(
          JSON.parse(await readFile(netlog, "utf8")) as Parameters<
            typeof assertNoNetwork
          >[0],
        );
        await checkSentinels();
        const result = {
          name,
          passed: true,
          outcome,
          closed,
          cleanupAssistance: "none",
          initialGeneration: generation,
          finalRegistry: await registry(),
          seeded,
          pty: initial.ptys[0]!.pid,
          stderr: owner.stderrText(),
        };
        await writeFile(
          path.join(directory, "result.json"),
          JSON.stringify(result, null, 2),
        );
        phases.push(result);
      } catch (error) {
        phaseFailure = error;
        await writeFile(
          path.join(directory, "failure.json"),
          JSON.stringify(
            { error: String(error), stderr: owner.stderrText(), closed },
            null,
            2,
          ),
        );
        throw error;
      } finally {
        client?.close();
        if (!stopped) {
          try {
            await owner.stop();
          } catch (cleanup) {
            throw new AggregateError(
              [phaseFailure, cleanup],
              "Ordinary fixture failure and recovery outcome",
            );
          }
        }
      }
    }
    const hold = async (prefix: string) => {
      for (const [name, file] of [
        ["config", values.config],
        ["state", values.state],
      ]) {
        if (await exists(file!))
          await rename(file!, path.join(evidence, `${prefix}-${name}`));
      }
    };
    try {
      await json("inputs.json", {
        packageSource,
        fixtureSource: process.env.OMXTERM_FIXTURE_SOURCE ?? "uncommitted",
        ...values,
        evidence,
        bytes: appBytes.length,
        asarDigest,
        entrySha256: hash(entryBytes),
        archiveSha256: snippetsSha256,
        scope:
          "ordinary guest account roots; no user-data-dir; pre-evaluation passive observer; Chromium synthetic input/capture; extracted AppImage, not FUSE/helper qualification",
      });
      // Existing-history controls come first. They never consume a witness, and
      // their complete owned roots are held before a distinct absent-root history.
      await mkdir(values.config);
      await phase("existing-empty", 0, false, false, "install-disable");
      // Ordinary startup creates config/theme defaults. Preserve their actual
      // bytes as existing-user inputs rather than assuming those files are absent.
      for (const name of ["config.json", "themes/omtheme.json"]) {
        const file = path.join(values.config, name);
        retained[file] = await readFile(file, "utf8");
      }
      retained[yaml] = JSON.stringify({ version: 1, snippets: [] });
      await writeFile(yaml, retained[yaml], { flag: "wx" });
      await phase("existing-disabled", 2, false, false, "Uninstall");
      await phase("existing-tombstone", 3, false, false);
      await hold("held-existing");
      for (const key of Object.keys(retained)) delete retained[key];
      assertAbsentRoots([values.profile, values.state]);
      await json("fresh-absence.json", {
        profile: values.profile,
        config: values.config,
        state: values.state,
        observedAbsent: true,
        priorHistory:
          "complete fixture-owned existing profile held with no witness; not an enrollment retry",
      });
      await phase("fresh-default", 1, true, true);
      await phase("fresh-restart", 1, true, true, "Disable");
      await phase("fresh-disabled", 2, false, true, "Uninstall");
      await phase("fresh-tombstone", 3, false, true);
      await hold("held-fresh");
      assertAbsentRoots([values.profile, values.state]);
      completed = true;
    } finally {
      assert.equal(hash(await readFile(values.appImage)), values.digest);
      assert.equal(hash(await readFile(asar)), asarDigest);
      await json("result.json", {
        passed: completed,
        phases,
        root,
        ownedOrdinaryRootsRetainedOnFailure: !completed,
        noConsumedWitnessReset: true,
      });
      if (completed) await rm(root, { recursive: true, force: true });
    }
  },
);
