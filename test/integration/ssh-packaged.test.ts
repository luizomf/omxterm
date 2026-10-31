import assert from "node:assert/strict";
import { extractFile } from "@electron/asar";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { it } from "vitest";
import { valid } from "semver";
import { launchLinuxPackagedProcess } from "../../scripts/linux-packaged-process.mjs";
import { inspector, until } from "../fixtures/packaged-inspector.js";
import {
  CATALOG_BYTES,
  OFFICIAL_CATALOG_URL,
  parseCatalog,
} from "../../src/main/extension-catalog.js";
import { downloadExtension } from "../../src/main/extension-download.js";

const prefix = "OMXTERM_SSH_PACKAGED_";
const names = [
  "APPIMAGE",
  "ARCHIVE",
  "APPIMAGE_SHA256",
  "ARCHIVE_SHA256",
  "VERSION",
  "EVIDENCE",
] as const;
const source = process.env.OMXTERM_SSH_PACKAGED_SOURCE;
const combined = process.env.OMXTERM_SSH_PACKAGED_COMBINED;
const placement = process.env.OMXTERM_SSH_PACKAGED_PLACEMENT;
assert.ok(placement === undefined || placement === "1");
if (placement) {
  assert.ok(source, "placement requires production source");
  for (const mode of ["COMBINED", "CATALOG", "CATALOG_SHA256", "APPEARANCE"])
    assert.equal(
      process.env[prefix + mode],
      undefined,
      "exclusive placement mode",
    );
}
assert.ok(combined === undefined || combined === "1");
if (combined)
  assert.ok(source, "combined checkpoint requires production source");
const enabled =
  !!source ||
  [
    ...names,
    "CATALOG",
    "CATALOG_SHA256",
    "EXTENSION_VERSION",
    "APPEARANCE",
  ].some((name) => process.env[prefix + name] !== undefined);
const execute = promisify(execFile);
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

function publicCatalogMode() {
  const mode = process.env.OMXTERM_SSH_PACKAGED_CATALOG;
  const sha256 = process.env.OMXTERM_SSH_PACKAGED_CATALOG_SHA256;
  assert.ok(mode === undefined || mode === "public");
  if (mode) assert.match(sha256 ?? "", /^[a-f0-9]{64}$/);
  else assert.equal(sha256, undefined);
  return {
    mode,
    timeout: mode ? 180000 : 120000,
    scope: mode
      ? "unchanged extracted AppImage; public SSH catalog consumption; controlled input/consent; no SSH client execution"
      : "unchanged extracted AppImage; separate SSH; synthetic client, no connectivity",
  };
}
function checkpointOptions() {
  const extensionVersion = process.env[prefix + "EXTENSION_VERSION"] ?? "0.1.0";
  assert.equal(
    valid(extensionVersion),
    extensionVersion,
    "canonical extension SemVer required",
  );
  const appearance = process.env[prefix + "APPEARANCE"];
  assert.ok(
    appearance === undefined || appearance === "1",
    "APPEARANCE must be 1 or unset",
  );
  const { mode: catalogMode, timeout, scope } = publicCatalogMode();
  if (appearance) {
    assert.equal(
      extensionVersion,
      "0.3.0",
      "appearance/language checkpoint targets SSH 0.3.0",
    );
    assert.equal(
      catalogMode,
      undefined,
      "appearance checkpoint must continue the synthetic Connect campaign",
    );
  }
  return {
    extensionVersion,
    appearance: !!appearance,
    catalogMode,
    timeout: appearance ? 240000 : timeout,
    scope,
  };
}
async function prepareAppearance(appearance: boolean, root: string) {
  if (appearance)
    await cp("docs/omtheme.json", path.join(root, "theme-template.json"));
}
async function recordPublicCatalog(
  mode: string | undefined,
  receipts: string,
  archiveSha256: string,
  extensionVersion: string,
) {
  if (!mode) return;
  const url = OFFICIAL_CATALOG_URL;
  const bytes = await downloadExtension(
    url,
    AbortSignal.timeout(60000),
    CATALOG_BYTES,
  );
  const release = parseCatalog(bytes).find(
    (entry) => entry.id === "omxterm.ssh",
  );
  assert.equal(release?.archive.sha256, archiveSha256);
  assert.equal(release?.version, extensionVersion);
  assert.equal(digest(bytes), process.env.OMXTERM_SSH_PACKAGED_CATALOG_SHA256);
  await writeFile(path.join(receipts, "public-catalog.json"), bytes);
  await writeFile(
    path.join(receipts, "public-readback.json"),
    JSON.stringify(
      {
        url,
        sha256: digest(bytes),
        bytes: bytes.length,
        scope:
          "separate public readback; production Settings independently fetches the fixed endpoint",
      },
      null,
      2,
    ),
  );
}

type Values = Record<(typeof names)[number], string>;
async function inputValues(): Promise<Values> {
  const values = Object.fromEntries(
    names.map((name) => {
      if (source && (name === "APPIMAGE" || name === "APPIMAGE_SHA256"))
        return [name, ""];
      const value = process.env[prefix + name];
      assert.ok(value, `${prefix}${name} is required`);
      return [name, value];
    }),
  ) as Values;
  for (const name of ["ARCHIVE", "EVIDENCE"] as const)
    assert.ok(path.isAbsolute(values[name]), `${name} must be absolute`);
  assert.match(values.ARCHIVE_SHA256, /^[a-f0-9]{64}$/);
  if (source) {
    assert.ok(path.isAbsolute(source));
    assert.equal(await realpath(source), source, "canonical source root");
    for (const name of ["APPIMAGE", "APPIMAGE_SHA256", "CATALOG"])
      assert.equal(process.env[prefix + name], undefined);
  } else {
    assert.ok(path.isAbsolute(values.APPIMAGE));
    assert.match(values.APPIMAGE_SHA256, /^[a-f0-9]{64}$/);
  }
  return values;
}
async function hostIdentity(root: string, version: string) {
  const asar = source ?? path.join(root, "squashfs-root/resources/app.asar");
  const executable = source
    ? await realpath(path.join(source, "node_modules/electron/dist/electron"))
    : path.join(root, "squashfs-root/omxterm");
  const executableSha256 = source
    ? digest(await readFile(executable))
    : undefined;
  const sourceHashes: Record<string, string> = {};
  if (source) {
    for (const name of [
      "package.json",
      "dist/main/index.js",
      "dist/extension-runtime/bootstrap.mjs",
    ])
      sourceHashes[name] = digest(await readFile(path.join(source, name)));
    const manifest = JSON.parse(
      await readFile(path.join(source, "package.json"), "utf8"),
    ) as { version: string };
    assert.equal(manifest.version, version);
  }
  return { asar, executable, executableSha256, sourceHashes };
}
async function combinedInputs(root: string, receipts: string) {
  if (!combined && !placement) return {};
  assert.ok(source);
  const manifest = JSON.parse(
    await readFile(
      path.join(source, "extensions/files/extension.json"),
      "utf8",
    ),
  ) as { name: string; version: string };
  const filesArchive = path.join(
    source,
    `dist/extensions/files-${manifest.version}.omxext`,
  );
  const filesArchiveSha256 = digest(await readFile(filesArchive));
  for (const helper of placement
    ? [
        "companion-placement.cjs",
        "companion-placement-input.cjs",
        "companion-placement-contract.cjs",
      ]
    : [
        "companion-combined.cjs",
        "companion-native-input.cjs",
        "companion-shortcuts.cjs",
        "companion-shortcut-input.cjs",
      ])
    await cp(path.join("test/fixtures", helper), path.join(root, helper));
  const inputs = {
    filesArchive,
    filesArchiveSha256,
    filesTitle: `${manifest.name} · ${manifest.version}`,
  };
  await writeFile(
    path.join(receipts, "combined-artifacts.json"),
    JSON.stringify(inputs, null, 2),
  );
  return inputs;
}
async function preparePackage(values: Values, root: string, asar: string) {
  if (source) return undefined;
  assert.equal(digest(await readFile(values.APPIMAGE)), values.APPIMAGE_SHA256);
  await execute(values.APPIMAGE, ["--appimage-extract"], {
    cwd: root,
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const manifest = JSON.parse(extractFile(asar, "package.json").toString()) as {
    version: string;
  };
  assert.equal(manifest.version, values.VERSION);
  return digest(await readFile(asar));
}
async function unchangedInputs(
  values: Values,
  host: Awaited<ReturnType<typeof hostIdentity>>,
  asarBefore: string | undefined,
) {
  if (asarBefore)
    assert.equal(digest(await readFile(host.asar)), asarBefore, "asar changed");
  if (!source)
    assert.equal(
      digest(await readFile(values.APPIMAGE)),
      values.APPIMAGE_SHA256,
    );
  else
    assert.equal(
      digest(await readFile(host.executable)),
      host.executableSha256,
      "source Electron executable changed",
    );
  for (const [name, hash] of Object.entries(host.sourceHashes))
    assert.equal(
      digest(await readFile(path.join(host.asar, name))),
      hash,
      `source changed: ${name}`,
    );
  assert.equal(digest(await readFile(values.ARCHIVE)), values.ARCHIVE_SHA256);
}

// Opt-in, assigned idle Linux ARM64 desktop ONLY. Package mode keeps its exact
// asar/bootstrap. Source mode honestly launches the built production directory.
it.skipIf(!enabled)(
  "qualifies separate SSH in the selected Linux ARM64 production host",
  { timeout: 360000 },
  async () => {
    assert.equal(process.platform, "linux");
    assert.equal(process.arch, "arm64");
    assert.notEqual(process.getuid?.(), 0);
    const values = await inputValues();
    // Default Shell comes from the OS account, not HOME. Keep that real policy;
    // these shells use our isolated HOME for startup files. No account mutation.
    assert.ok(
      ["/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh"].includes(
        os.userInfo().shell ?? "",
      ),
      "Prepared guest needs a POSIX sh/bash account shell",
    );
    const { extensionVersion, appearance, catalogMode, timeout, scope } =
      checkpointOptions();
    const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-ssh-packaged-"));
    const evidence = values.EVIDENCE;
    await mkdir(evidence, { recursive: true });
    // A new receipt directory prevents a stale successful Quit from qualifying.
    const receipts = await mkdtemp(path.join(evidence, "run-"));
    const host = await hostIdentity(root, values.VERSION);
    const { asar, executable, executableSha256, sourceHashes } = host;
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
      await recordPublicCatalog(
        catalogMode,
        receipts,
        values.ARCHIVE_SHA256,
        extensionVersion,
      );
      const archiveBytes = await readFile(values.ARCHIVE);
      asarBefore = await preparePackage(values, root, asar);
      assert.equal(digest(archiveBytes), values.ARCHIVE_SHA256);
      await json("artifacts.json", {
        appImage: source ? undefined : values.APPIMAGE_SHA256,
        source,
        sourceHashes,
        executableSha256,
        archive: values.ARCHIVE_SHA256,
        version: values.VERSION,
        extensionVersion,
        appearance: !!appearance,
      });
      for (const name of [
        "home/.ssh",
        "profile",
        "state",
        "data",
        "bin",
        "remote-cwd",
        "config/omxterm",
      ])
        await mkdir(path.join(root, name), { recursive: true });
      await symlink("/usr/bin/xprop", path.join(root, "bin/xprop"));
      // GTK's installed image loader needs this OS helper even with an isolated PATH.
      await symlink("/usr/bin/bwrap", path.join(root, "bin/bwrap"));
      await symlink("/bin/sh", path.join(root, "bin/sh"));
      await cp(
        "test/fixtures/ssh-packaged-client.py",
        path.join(root, "bin/ssh"),
      );
      await chmod(path.join(root, "bin/ssh"), 0o700);
      await writeFile(
        path.join(root, "home/.ssh/config"),
        "Host fixture-fast\n  HostName example.invalid\n",
      );
      await writeFile(
        path.join(root, "config/omxterm/config.json"),
        JSON.stringify({
          version: 1,
          language: "en-US",
          confirmClose: true,
          window: { blur: false },
        }),
      );
      await prepareAppearance(appearance, root);
      const readiness = path.join(root, "shell.json");
      await writeFile(
        path.join(root, "shell.sh"),
        'printf \'{"mainPid":%s,"probePid":%s}\' "$PPID" "$$" > "$1"\nexec /bin/sh -i\n',
      );
      const archive = path.join(root, "ssh.omxext");
      await writeFile(archive, archiveBytes);
      await cp(
        "test/fixtures/ssh-packaged.cjs",
        path.join(root, "observer.cjs"),
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
          ...(source ? [source] : []),
          "--no-sandbox",
          "--ozone-platform=x11",
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
      const combinedOptions = await combinedInputs(root, receipts);
      const options = {
        root,
        evidence: receipts,
        executable,
        asar,
        archive,
        archiveSha256: values.ARCHIVE_SHA256,
        version: values.VERSION,
        readiness,
        catalogMode,
        extensionVersion,
        appearance: !!appearance,
        source,
        sourceHashes,
        placement: placement === "1",
        ...combinedOptions,
        executableSha256,
      };
      await json(
        "attachment.json",
        await client.evaluate(
          `${observer}.inspect(${JSON.stringify(options)})`,
          5000,
        ),
      );
      await json(
        "scenario.json",
        await client.evaluate(
          `${observer}.run(${JSON.stringify(options)})`,
          timeout,
        ),
      );
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
      ) as { joined: boolean; busyQuit: number };
      assert.equal(quit.joined, true);
      assert.equal(quit.busyQuit, 1);
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
      if (client) {
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
          // Keep controlled dialog responses until native shutdown has joined.
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
      try {
        await unchangedInputs(values, host, asarBefore);
      } catch (error) {
        failures.push(error);
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
        scope: source
          ? "built production source; synthetic SSH client; not packaged qualification"
          : scope,
      });
      if (passed && failures.length === 0)
        await rm(root, { recursive: true, force: true });
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `Production SSH failed; retained ${root}; receipts ${receipts}`,
      );
  },
);
