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
import {
  assertCompletePublicStderr,
  publicNativeDiagnostics,
} from "../fixtures/linux-packaged-diagnostics.js";
import {
  assertLinuxFilesHost,
  assertLinuxFilesScenario,
  linuxFilesInputs,
  linuxFilesPublicEndpoint,
  prepareLinuxFiles,
} from "../fixtures/files-packaged-linux-options.js";

const execute = promisify(execFile);
const inputs = linuxFilesInputs(process.env);
const appImage = inputs?.appImage;
const archive = inputs?.archive;
const attachOnly = inputs?.attachOnly ?? false;
const terminalOnly = inputs?.terminalOnly ?? false;
const catalogMode = inputs?.catalogMode;
const linuxPublicCatalog = inputs?.linuxPublicCatalog ?? false;
const linuxHistoricalPublic = inputs?.linuxHistoricalPublic ?? false;
const scope = linuxPublicCatalog
  ? "Files0.6-stable-public-HTTPS"
  : linuxHistoricalPublic
    ? "Files0.4-historical-public"
    : catalogMode
      ? `Files-catalog-${catalogMode}`
      : attachOnly
        ? "observer-attachment-only"
        : terminalOnly
          ? "terminal-entry-only"
          : "Files-lifecycle";
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
function publicObserverOptions() {
  if (linuxPublicCatalog)
    return {
      linuxPublicCatalog: true,
      publicCatalog: linuxFilesPublicEndpoint,
      catalogSha256: inputs!.catalogSha256!,
    };
  return linuxHistoricalPublic ? { linuxHistoricalPublic: true } : {};
}

async function prepareEvidence(root: string) {
  const directory = path.resolve(
    process.env.OMXTERM_FILES_PACKAGED_EVIDENCE ?? path.join(root, "evidence"),
  );
  await mkdir(directory, { recursive: true });
  // Never accept an older run's Quit receipt as this public run's result.
  return linuxPublicCatalog ? mkdtemp(path.join(directory, "run-")) : directory;
}

async function prepareObserver(root: string, archiveBytes: Buffer) {
  const localArchive = linuxPublicCatalog
    ? undefined
    : path.join(root, "files.omxext");
  if (localArchive) await writeFile(localArchive, archiveBytes);
  for (const [source, target] of [
    ["files-packaged.cjs", "observer.cjs"],
    ["snippets-process-identity.cjs", "snippets-process-identity.cjs"],
    ...(linuxPublicCatalog
      ? [["public-catalog-observer.cjs", "public-catalog-observer.cjs"]]
      : []),
  ])
    await cp(path.join("test/fixtures", source!), path.join(root, target!));
  await prepareCatalog(root);
  return localArchive;
}

async function verifyPublicQuit(evidence: string) {
  if (!linuxPublicCatalog) return;
  assert.ok(inputs?.catalogSha256);
  const quit = JSON.parse(
    await readFile(path.join(evidence, "quit.json"), "utf8"),
  ) as {
    joined: boolean;
    quit: string;
    baselineExited: boolean;
    children: {
      closed: boolean;
      exit: { code: number; signal: string | null };
    }[];
  };
  assertLinuxFilesScenario(quit, {
    version: inputs.version,
    archiveSha256: inputs.archiveSha256,
    extensionVersion: inputs.extensionVersion,
    extensionName: inputs.extensionName,
    currentUi: false,
    catalogSha256: inputs.catalogSha256,
  });
  assert.equal(quit.joined, true);
  assert.equal(quit.quit, "joined");
  assert.equal(quit.baselineExited, true);
  assert.equal(quit.children.length, 3);
  for (const child of quit.children) {
    assert.equal(child.closed, true);
    assert.deepEqual(child.exit, { code: 0, signal: null });
  }
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
  options: Record<string, unknown> & {
    version: string;
    archiveSha256: string;
    extensionVersion: string;
    extensionName: string;
    linuxCurrentFilesUi: boolean;
    catalogSha256?: string;
  },
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
    linuxPublicCatalog ? 330000 : 90000,
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
    assertLinuxFilesScenario(result, {
      version: options.version,
      archiveSha256: options.archiveSha256,
      extensionVersion: options.extensionVersion,
      extensionName: options.extensionName,
      currentUi: options.linuxCurrentFilesUi,
      ...(linuxPublicCatalog ? { catalogSha256: options.catalogSha256! } : {}),
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
  { timeout: 420000 },
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-files-packaged-"),
    );
    const evidence = await prepareEvidence(root);
    let owner:
      Awaited<ReturnType<typeof launchLinuxPackagedProcess>> | undefined;
    let client: Awaited<ReturnType<typeof inspector>> | undefined;
    let observer: string | undefined;
    let outcome: unknown;
    let nativeStderr = "";
    let nativeStderrTruncated = false;
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
      assert.equal(identities.appImage.sha256, inputs!.appImageSha256);
      assert.equal(identities.archive.sha256, inputs!.archiveSha256);
      if (linuxPublicCatalog)
        assert.equal(
          identities.archive.bytes,
          17331,
          "original Files archive size",
        );
      await writeFile(
        path.join(evidence, "artifacts.json"),
        JSON.stringify(
          {
            ...identities,
            expectedHostVersion: inputs!.version,
            expectedExtensionVersion: inputs!.extensionVersion,
            expectedExtensionName: inputs!.extensionName,
            expectedCatalogSha256: inputs!.catalogSha256,
            currentUi: inputs!.currentUi,
          },
          null,
          2,
        ),
      );
      await execute(path.resolve(appImage!), ["--appimage-extract"], {
        cwd: root,
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const executable = path.join(root, "squashfs-root/omxterm");
      const asar = path.join(root, "squashfs-root/resources/app.asar");
      const embedded: unknown = JSON.parse(
        extractFile(asar, "package.json").toString("utf8"),
      );
      assertLinuxFilesHost(embedded, inputs!.version);
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
      const localArchive = await prepareObserver(root, archiveBytes);
      await prepareLinuxFiles(
        path.join(root, "owned-files"),
        inputs!.currentUi,
      );
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
        version: inputs!.version,
        extensionVersion: inputs!.extensionVersion,
        extensionName: inputs!.extensionName,
        linuxExpectedIdentity: true,
        linuxCurrentFilesUi: inputs!.currentUi,
        files: path.join(root, "owned-files"),
        readiness,
        terminalOnly,
        catalogMode,
        ...publicObserverOptions(),
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
      await verifyPublicQuit(evidence);
      client.close();
      client = undefined;
      await until(
        () => exited,
        "actual main exit after debugger disconnect",
        5000,
      );
      outcome = await owner.stop();
      nativeStderr = owner.stderrText();
      nativeStderrTruncated = owner.stderrTruncated();
      owner = undefined;
      assertCompletePublicStderr(linuxPublicCatalog, nativeStderrTruncated);
      expect(outcome).toEqual({ code: 0, signal: null });
      expect(digest(await readFile(asar))).toBe(readonlyAsarHash);
      expect(digest(await readFile(appImage!))).toBe(
        identities.appImage.sha256,
      );
      expect(digest(await readFile(archive!))).toBe(identities.archive.sha256);
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
        nativeStderrTruncated = owner.stderrTruncated();
      }
      await writeFile(
        path.join(evidence, "supervisor.json"),
        JSON.stringify(
          {
            passed,
            outcome,
            nativeStderr,
            nativeDiagnostics: publicNativeDiagnostics(
              linuxPublicCatalog,
              nativeStderrTruncated,
            ),
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
