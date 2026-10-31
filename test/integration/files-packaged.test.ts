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
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { launchLinuxPackagedProcess } from "../../scripts/linux-packaged-process.mjs";
import { inspector, until } from "../fixtures/packaged-inspector.js";

const execute = promisify(execFile);
const appImage = process.env.OMXTERM_FILES_PACKAGED_APPIMAGE;
const archive = process.env.OMXTERM_FILES_PACKAGED_ARCHIVE;
const attachOnly = process.env.OMXTERM_FILES_PACKAGED_ATTACH_ONLY === "1";
const terminalOnly = process.env.OMXTERM_FILES_PACKAGED_TERMINAL_ONLY === "1";
const catalogMode = process.env.OMXTERM_FILES_PACKAGED_CATALOG;
assert.ok(
  !catalogMode || ["controlled", "public"].includes(catalogMode),
  "Unknown catalog qualification mode",
);
assert.ok(
  !catalogMode || (!attachOnly && !terminalOnly),
  "Catalog mode requires the full lifecycle",
);
const scope = catalogMode
  ? `Files-catalog-${catalogMode}`
  : attachOnly
    ? "observer-attachment-only"
    : terminalOnly
      ? "terminal-entry-only"
      : "Files-lifecycle";
assert.ok(
  !(attachOnly && terminalOnly),
  "Choose only one diagnostic stopping point",
);
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function prepareCatalog(root: string) {
  if (catalogMode !== "controlled") return;
  await cp(
    "test/fixtures/files-catalog-transport.cjs",
    path.join(root, "files-catalog-transport.cjs"),
  );
  assert.ok(
    process.env.OMXTERM_FILES_PACKAGED_CATALOG_FILE,
    "Controlled catalog candidate required",
  );
  await cp(
    process.env.OMXTERM_FILES_PACKAGED_CATALOG_FILE,
    path.join(root, "catalog.json"),
  );
  await execute(
    "/usr/bin/openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(root, "catalog.key"),
      "-out",
      path.join(root, "catalog.crt"),
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { timeout: 15000 },
  );
}
async function captureListingFailure(
  client: Awaited<ReturnType<typeof inspector>> | undefined,
  observer: string | undefined,
  root: string,
  evidence: string,
) {
  if (!client || !observer) return;
  let snapshot: unknown = { snapshotError: "observer-unavailable" };
  try {
    snapshot = await client.evaluate(
      `${observer}.diagnoseListing(${JSON.stringify(root)})`,
      3000,
    );
  } catch {
    // A diagnostic failure must not replace the original scenario failure.
  }
  try {
    await writeFile(
      path.join(evidence, "listing-failure.json"),
      JSON.stringify(snapshot, null, 2),
    );
  } catch {
    // Preserve the primary failure even if its evidence directory is unavailable.
  }
}

async function closeObserver(
  client: Awaited<ReturnType<typeof inspector>> | undefined,
  observer: string | undefined,
): Promise<unknown> {
  if (!client || !observer) return;
  try {
    await client.evaluate(`${observer}.cleanup()`, 5000);
  } catch (error) {
    return error;
  }
}
async function observeScenario(
  client: Awaited<ReturnType<typeof inspector>>,
  observer: string,
  options: Record<string, unknown>,
  evidence: string,
) {
  const attached = await client.evaluate(
    `${observer}.inspect(${JSON.stringify(options)})`,
    5000,
  );
  expect(attached).toEqual({
    packaged: true,
    version: options.version,
    appPath: options.asar,
    executable: options.executable,
    observer: "CommonJS",
    runType: "function",
  });
  await writeFile(
    path.join(evidence, "attachment.json"),
    JSON.stringify(attached, null, 2),
  );
  if (attachOnly) return;
  const result = await client.evaluate(
    `${observer}.run(${JSON.stringify(options)})`,
  );
  await writeFile(
    path.join(evidence, terminalOnly ? "terminal-entry.json" : "scenario.json"),
    JSON.stringify(result, null, 2),
  );
  if (catalogMode)
    expect(result).toMatchObject({
      catalog: {
        mode: catalogMode,
        transportClosed: catalogMode === "controlled" ? true : null,
      },
    });
  if (terminalOnly)
    expect(result).toMatchObject({
      check: "terminal-entry-only",
      correctedSameShell: true,
      approvals: 0,
      children: 0,
    });
  else
    expect(result).toMatchObject({
      approvals: 2,
      checks: [
        "exact-archive-trust-dormant-install",
        "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
        "panel-outside-tabs-hide-reveal-settings-terminal-switch-selected-visible-close",
        "selected-visible-toggle-header-close-destroy-fresh-view-same-backend-PTY",
        "legacy-captured-initial-directory",
        "packaged-backend-create-move-conflict",
        "explicit-reinstall-actual-retirement-dormant",
        "fresh-activation-disable-uninstall",
        "same-PTY-and-Surface",
      ],
    });
}

// The exact AppImage is extracted, not rebuilt or patched. No default_app.asar,
// development Electron or replacement application entry is used. The main
// inspector is loopback-only, controlled by this disposable fixture, and closed.
it.skipIf(
  process.platform !== "linux" ||
    process.arch !== "arm64" ||
    !appImage ||
    !archive,
)(
  attachOnly
    ? "loads the observer in the exact packaged application without running Files"
    : terminalOnly
      ? "discriminates single-terminal renderer entry without running Files"
      : "uses separate Files through the exact packaged application and joins normal Quit",
  { timeout: 240000 },
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-files-packaged-"),
    );
    const evidence = path.resolve(
      process.env.OMXTERM_FILES_PACKAGED_EVIDENCE ??
        path.join(root, "evidence"),
    );
    await mkdir(evidence, { recursive: true });
    let owner:
      Awaited<ReturnType<typeof launchLinuxPackagedProcess>> | undefined;
    let client: Awaited<ReturnType<typeof inspector>> | undefined;
    let observer: string | undefined;
    let outcome: unknown;
    let nativeStderr = "";
    let failure: unknown;
    let cleanupFailure: unknown;
    let passed = false;
    try {
      assert.notEqual(process.getuid?.(), 0);
      const appBytes = await readFile(appImage!);
      const archiveBytes = await readFile(archive!);
      const identities = {
        appImage: { bytes: appBytes.length, sha256: digest(appBytes) },
        archive: { bytes: archiveBytes.length, sha256: digest(archiveBytes) },
      };
      assert.equal(
        identities.appImage.sha256,
        process.env.OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256,
      );
      assert.equal(
        identities.archive.sha256,
        process.env.OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256,
      );
      await writeFile(
        path.join(evidence, "artifacts.json"),
        JSON.stringify(identities, null, 2),
      );
      await execute(path.resolve(appImage!), ["--appimage-extract"], {
        cwd: root,
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const executable = path.join(root, "squashfs-root/omxterm");
      const asar = path.join(root, "squashfs-root/resources/app.asar");
      const readonlyAsarHash = digest(await readFile(asar));
      for (const name of [
        "home",
        "profile",
        "state",
        "data",
        "bin",
        "owned-files",
        "config/omxterm",
      ])
        await mkdir(path.join(root, name), { recursive: true });
      // No Node, npm, Python or compiler on the application/user PATH. Core's
      // X11 background facility may use xprop; the explicit shell is absolute.
      await symlink("/usr/bin/xprop", path.join(root, "bin/xprop"));
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
      const readiness = path.join(root, "shell.json");
      await writeFile(
        path.join(root, "shell.sh"),
        'printf \'{"mainPid":%s,"probePid":%s}\' "$PPID" "$$" > "$1"\nexec /bin/sh -i\n',
      );
      const localArchive = path.join(root, "files.omxext");
      await writeFile(localArchive, archiveBytes);
      await writeFile(path.join(root, "owned-files/source.txt"), "source");
      await writeFile(path.join(root, "owned-files/conflict.txt"), "preserved");
      await cp(
        "test/fixtures/files-packaged.cjs",
        path.join(root, "observer.cjs"),
      );
      await cp(
        "test/fixtures/snippets-process-identity.cjs",
        path.join(root, "snippets-process-identity.cjs"),
      );
      await prepareCatalog(root);
      const env: NodeJS.ProcessEnv = {
        HOME: path.join(root, "home"),
        PATH: path.join(root, "bin"),
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
        XDG_DATA_HOME: path.join(root, "data"),
      };
      for (const key of [
        "DISPLAY",
        "XAUTHORITY",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_RUNTIME_DIR",
        "LANG",
        "USER",
        "LOGNAME",
      ])
        if (process.env[key]) env[key] = process.env[key];
      owner = await launchLinuxPackagedProcess({
        executable,
        args: [
          "--no-sandbox",
          "--ozone-platform=x11",
          "--inspect=127.0.0.1:0",
          "--trace-warnings",
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
      const child = owner.child;
      assert.ok(child.pid && child.pid > 0);
      const launchStat = await readFile(`/proc/${child.pid}/stat`, "utf8");
      const launchFields = launchStat
        .slice(launchStat.lastIndexOf(")") + 2)
        .split(" ");
      await writeFile(
        path.join(evidence, "launch.json"),
        JSON.stringify(
          {
            pid: child.pid,
            parent: Number(launchFields[1]),
            group: Number(launchFields[2]),
            start: launchFields[19],
            executable,
            root,
          },
          null,
          2,
        ),
      );
      let exited = false;
      child.once("exit", () => {
        exited = true;
      });
      await until(
        async () =>
          (await readFile(readiness, "utf8").catch(() => "")).length > 0,
        "real shell readiness",
      );
      await owner.verifyMain();
      await until(
        () =>
          /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(
            owner!.stderrText(),
          ),
        "main inspector",
      );
      const url =
        /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/.exec(
          owner.stderrText(),
        )?.[1];
      assert.ok(url);
      client = await inspector(url);
      const options = {
        root,
        evidence,
        asar,
        executable,
        archive: localArchive,
        archiveSha256: identities.archive.sha256,
        version: (
          JSON.parse(extractFile(asar, "package.json").toString("utf8")) as {
            version: string;
          }
        ).version,
        files: path.join(root, "owned-files"),
        readiness,
        terminalOnly,
        catalogMode,
        catalogFile: path.join(root, "catalog.json"),
        catalogCertificate: path.join(root, "catalog.crt"),
        catalogKey: path.join(root, "catalog.key"),
      };
      observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(asar, "package.json"))})(${JSON.stringify(path.join(root, "observer.cjs"))})`;
      await observeScenario(client, observer, options, evidence);
      await owner.verifyMain();
      await client.evaluate(`${observer}.quit(); true`, 5000);
      if (!attachOnly && !terminalOnly)
        await until(
          async () =>
            (
              await readFile(path.join(evidence, "quit.json"), "utf8").catch(
                () => "",
              )
            ).length > 0,
          "normal Quit receipt",
        );
      client.close();
      client = undefined;
      await until(
        () => exited,
        "actual main exit after debugger disconnect",
        5000,
      );
      outcome = await owner.stop();
      nativeStderr = owner.stderrText();
      owner = undefined;
      expect(outcome).toEqual({ code: 0, signal: null });
      expect(digest(await readFile(asar))).toBe(readonlyAsarHash);
      expect(digest(await readFile(appImage!))).toBe(
        identities.appImage.sha256,
      );
      passed = true;
    } catch (error) {
      failure = error;
      await captureListingFailure(client, observer, root, evidence);
      if (client) {
        try {
          const state = await client.evaluate(
            "JSON.stringify(globalThis.__omxtermPackagedState ?? {})",
            3000,
          );
          await writeFile(
            path.join(evidence, "observer-failure.json"),
            String(state),
          );
        } catch {
          /* Preserve the primary failure if the debugger is unavailable. */
        }
      }
    } finally {
      cleanupFailure = await closeObserver(client, observer);
      client?.close();
      if (owner) {
        try {
          outcome = await owner.stop();
        } catch (error) {
          cleanupFailure = error;
        }
        nativeStderr = owner.stderrText();
      }
      await writeFile(
        path.join(evidence, "supervisor.json"),
        JSON.stringify(
          {
            passed,
            outcome,
            nativeStderr,
            failure: failure instanceof Error ? failure.stack : failure,
            cleanupFailure:
              cleanupFailure instanceof Error
                ? cleanupFailure.stack
                : cleanupFailure,
            root,
            mode: "exact AppImage extraction; no FUSE/helper installation",
            scope,
            sourceFallback:
              "no developer entry/import; packaged appPath/bootstrap; no build tools on PATH",
          },
          null,
          2,
        ),
      );
      if (passed && !cleanupFailure && !evidence.startsWith(root + path.sep))
        await rm(root, { recursive: true, force: true });
    }
    if (failure || cleanupFailure)
      throw new AggregateError(
        [failure, cleanupFailure].filter(Boolean),
        "Packaged Files vertical failed; retained evidence/profile",
      );
  },
);
