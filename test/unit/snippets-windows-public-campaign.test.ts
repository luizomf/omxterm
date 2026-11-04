/* eslint-disable max-lines -- One shared transaction harness exercises guarded and diagnostic outcomes. */
import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { runWindowsPublicCampaign } from "../fixtures/snippets-windows-public-campaign";
import { PUBLIC_INSTALLER_SHA256 } from "../fixtures/snippets-windows-public-inputs";
import * as identity from "../fixtures/snippets-windows-exact-identity";
import * as runner from "../fixtures/run-native-fixture";

vi.mock("node:fs/promises", { spy: true });
vi.mock("node:fs", { spy: true });
vi.mock("../fixtures/snippets-windows-exact-identity", { spy: true });
vi.mock("../fixtures/run-native-fixture", { spy: true });
const checks = [
  "public-catalog-install-official-trust-dormant",
  "explicit-toggle-exact-run-child-receipt",
  "public-reinstall-old-backend-joined-dormant",
  "disable-enable-uninstall-unchanged-catalog",
  "same-surface-pty-usable-before-quit",
];
const outcome = {
  exitCode: 0,
  signal: null,
  reason: "exit",
  stdout: "",
  stderr: "",
  cleanupErrors: [],
  cleanupAssistance: "none" as const,
};
let root: string,
  installed: string,
  relocated: string,
  mode: string,
  registered: boolean,
  abort: AbortController;
let values: NonNullable<
  ReturnType<
    typeof import("../fixtures/snippets-windows-public-inputs").windowsPublicInputs
  >
>;
const nodeDescriptor = Object.getOwnPropertyDescriptor(
  process.versions,
  "node",
)!;
const versionDescriptor = Object.getOwnPropertyDescriptor(process, "version")!;
let oldPlatform: string,
  oldArch: string,
  oldLocal: string | undefined,
  oldSystem: string | undefined;
let execute: ReturnType<typeof makeExecute>;
let enteredNative: Promise<void>,
  releaseNative: () => void,
  signalNative: () => void,
  nativeGate: Promise<void>;
let enteredUninstall: Promise<void>,
  releaseUninstall: () => void,
  signalUninstall: () => void,
  uninstallGate: Promise<void>;
beforeAll(async () => {
  await build({ stdin: { contents: "" }, write: false, logLevel: "silent" });
});
function makeExecute() {
  return vi.fn(async (file: string, args: string[]) => {
    if (file === values.INSTALLER) {
      installed = args[1]!.slice(3);
      await fs.cp(values.STAGE, installed, { recursive: true });
      if (mode === "precallback")
        await fs.writeFile(
          path.join(installed, "OMXTerm.exe"),
          "wrong payload",
        );
      await fs.writeFile(
        path.join(installed, "Uninstall OMXTerm.exe"),
        "uninstaller",
      );
      const cache = path.join(process.env.LOCALAPPDATA!, "omxterm-updater");
      await fs.mkdir(cache, { recursive: true });
      await fs.copyFile(file, path.join(cache, "installer.exe"));
      registered = true;
    } else if (path.basename(file) === "Uninstall OMXTerm.exe") {
      relocated = file;
      signalUninstall();
      if (mode === "uninstall-pending") await uninstallGate;
      if (mode === "cleanup-failure" || mode === "primary-cleanup")
        throw new Error("uninstall failed deliberately");
      registered = false;
      await fs.rm(installed, { recursive: true });
    } else {
      return {
        stdout: JSON.stringify({
          registrations: registered
            ? [
                {
                  hive: "CurrentUser",
                  view: "Registry64",
                  kind: "install",
                  location: installed,
                  uninstall: null,
                  shortcut: "OMXTerm",
                  menu: null,
                },
                {
                  hive: "CurrentUser",
                  view: "Registry64",
                  kind: "uninstall",
                  location: null,
                  uninstall: `"${path.win32.join(installed, "Uninstall OMXTerm.exe")}" /currentuser`,
                  shortcut: null,
                  menu: null,
                },
              ]
            : [],
          paths: [],
          processes: false,
        }),
      };
    }
    return { stdout: "" };
  });
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "public-composition-")),
  );
  await fs.mkdir(path.join(root, "tmp"));
  await fs.mkdir(path.join(root, "stage/resources"), { recursive: true });
  await fs.writeFile(path.join(root, "stage/OMXTerm.exe"), "payload");
  await fs.writeFile(path.join(root, "stage/resources/app.asar"), "asar");
  await fs.writeFile(path.join(root, "installer.exe"), "installer");
  await fs.writeFile(path.join(root, "archive"), "archive");
  values = {
    STAGE: path.join(root, "stage"),
    INSTALLER: path.join(root, "installer.exe"),
    INSTALLER_SHA256: PUBLIC_INSTALLER_SHA256,
    ARCHIVE: path.join(root, "archive"),
    VERSION: "0.24.0-dev.36",
    EVIDENCE: path.join(root, "lane"),
    DISPOSABLE_VM: "1",
  };
  installed = "";
  relocated = "";
  registered = false;
  mode = "normal";
  abort = new AbortController();
  enteredNative = new Promise((resolve) => {
    signalNative = resolve;
  });
  nativeGate = new Promise((resolve) => {
    releaseNative = resolve;
  });
  enteredUninstall = new Promise((resolve) => {
    signalUninstall = resolve;
  });
  uninstallGate = new Promise((resolve) => {
    releaseUninstall = resolve;
  });
  oldPlatform = process.platform;
  oldArch = process.arch;
  oldLocal = process.env.LOCALAPPDATA;
  oldSystem = process.env.SystemRoot;
  vi.spyOn(os, "tmpdir").mockReturnValue(path.join(root, "tmp"));
  Object.defineProperty(process.versions, "node", { value: "24.22.0" });
  Object.defineProperty(process, "version", { value: "v24.22.0" });
  process.env.LOCALAPPDATA = path.join(root, "local");
  process.env.SystemRoot = path.join(root, "Windows");
  Object.defineProperty(process, "platform", {
    value: "win32",
    configurable: true,
  });
  Object.defineProperty(process, "arch", {
    value: "arm64",
    configurable: true,
  });
  const actual = await vi.importActual<typeof identity>(
    "../fixtures/snippets-windows-exact-identity",
  );
  vi.mocked(identity.fileIdentity).mockImplementation(async (file) => {
    if (file === values.INSTALLER)
      return {
        bytes: mode === "bad-installer" ? 155134580 : 155134581,
        sha256: PUBLIC_INSTALLER_SHA256,
      };
    if (file === path.join(installed, "resources/app.asar"))
      return {
        bytes: 18344994,
        sha256:
          "d9d3b4d67ebfb7aed7dbbf50f2b74f7282637e720ba670d2c6e57c34f61ea709",
      };
    return actual.fileIdentity(file);
  });
  const actualFs = await vi.importActual<typeof fs>("node:fs/promises");
  // Supply this frozen fixture's source metadata independently of the checkout
  // version; integration onto stable main must not invalidate these controls.
  vi.mocked(fs.readFile).mockImplementation(async (...args) => {
    if (args[0] === "package.json")
      return JSON.stringify({
        version: mode === "bad-source-version" ? "0.24.0" : values.VERSION,
      });
    return actualFs.readFile(...args);
  });
  vi.mocked(fs.mkdtemp).mockImplementation(async (...args) => {
    const directory = await actualFs.mkdtemp(...args);
    if (mode === "stale" && path.basename(directory).startsWith("run-"))
      await actualFs.writeFile(
        path.join(
          values.EVIDENCE,
          `supervisor-${path.basename(directory)}.json`,
        ),
        JSON.stringify(outcome),
      );
    return directory;
  });
  vi.mocked(identity.verifySnippetsArchive).mockImplementation(
    actual.fileIdentity,
  );
  vi.mocked(identity.inspectWindowsStage).mockImplementation(async (stage) => ({
    version: values.VERSION,
    executable: path.join(stage, "OMXTerm.exe"),
    asar: path.join(stage, "resources/app.asar"),
    snapshot: await actual.snapshotWindowsStage(stage),
    executableSha256: "exe",
    asarSha256:
      "d9d3b4d67ebfb7aed7dbbf50f2b74f7282637e720ba670d2c6e57c34f61ea709",
    entrySha256: "entry",
    backendSha256: "backend",
    nodePtyVersion: "1.2.0-beta.18",
    resttyVersion: "0.3.0",
    runtime: [],
  }));
  vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
    signalNative();
    if (mode === "native-pending") await nativeGate;
    const config = JSON.parse(await fs.readFile(options.args[1]!, "utf8")) as {
      evidence: string;
      executable: string;
      asar: string;
      publicCatalog: boolean;
      publicChildInputDiagnostic?: boolean;
      root: string;
    };
    expect(config.executable).toBe(path.join(installed, "OMXTerm.exe"));
    expect(config.asar).toBe(path.join(installed, "resources/app.asar"));
    expect(config.publicCatalog).toBe(true);
    expect(config.publicChildInputDiagnostic).toBe(
      values.childInputDiagnostic ? true : undefined,
    );
    if (values.childInputDiagnostic)
      expect(
        await fs.readFile(
          path.join(config.root, "snippets-child-input-diagnostic.cjs"),
          "utf8",
        ),
      ).toContain("startChildInputDiagnostic");
    expect(options.timeout).toBe(240000);
    await fs.writeFile(
      path.join(config.evidence, "attachment.json"),
      JSON.stringify({
        pid: 10,
        armed: true,
        windows: 0,
        ptys: 0,
        packaged: true,
        version: values.VERSION,
        executable: config.executable,
        asar: config.asar,
        electron: "43.8.1",
        node: mode === "bad-loader-runtime" ? "24.21.0" : "24.22.0",
      }),
    );
    await fs.writeFile(
      path.join(config.evidence, "scenario.json"),
      JSON.stringify({
        checks: mode === "scenario" || mode === "primary-cleanup" ? [] : checks,
        archiveSha256: identity.SNIPPETS_SHA256,
        approvals: 2,
        input:
          "synthetic Chromium input; controlled Official consent and Node ConPTY probe; production public HTTPS",
      }),
    );
    await fs.writeFile(
      path.join(config.evidence, "controller.json"),
      JSON.stringify({
        outcome: { code: 0, signal: null },
        closed: true,
        stdoutEnded: true,
        stderrEnded: true,
        truncated: false,
        failures: [],
      }),
    );
    await fs.writeFile(
      path.join(config.evidence, "quit.json"),
      JSON.stringify({
        joined: true,
        ptys: [{ pid: 11, exited: true }],
        children: [
          { pid: 12, closed: true, exit: { code: 0, signal: null } },
          {
            pid: 13,
            closed: mode !== "bad-quit",
            exit: { code: 0, signal: null },
          },
        ],
        identities: [
          { pid: 11, identity: "p1", alive: false },
          { pid: 12, identity: "p2", alive: false },
          { pid: 13, identity: "p3", alive: false },
        ],
      }),
    );
    const classified =
      mode === "assisted"
        ? { ...outcome, cleanupAssistance: "attempted" as const }
        : mode === "unknown-assistance"
          ? { ...outcome, cleanupAssistance: "unknown" as const }
          : mode === "historical"
            ? (Object.fromEntries(
                Object.entries(outcome).filter(
                  ([key]) => key !== "cleanupAssistance",
                ),
              ) as unknown as runner.NativeFixtureResult)
            : outcome;
    if (mode !== "missing")
      await fs.writeFile(
        options.evidencePath!,
        mode === "malformed"
          ? "{"
          : JSON.stringify(
              mode === "mismatch"
                ? { ...outcome, stdout: "mismatch" }
                : mode === "timeout"
                  ? { ...outcome, exitCode: 1, reason: "timeout" }
                  : classified,
            ),
      );
    if (mode === "rejected") throw new Error("native rejected despite receipt");
    if (mode === "cancel") abort.abort(new Error("cancelled"));
    if (mode === "receipt-only")
      return undefined as unknown as runner.NativeFixtureResult;
    if (mode === "invalid-return")
      return { ...outcome, stdout: 1 } as unknown as runner.NativeFixtureResult;
    if (mode === "timeout")
      return { ...outcome, exitCode: 1, reason: "timeout" };
    return mode === "cleanup-errors"
      ? { ...outcome, cleanupErrors: ["uncertain"] }
      : classified;
  });
  execute = makeExecute();
});
afterEach(async () => {
  Object.defineProperty(process, "platform", {
    value: oldPlatform,
    configurable: true,
  });
  Object.defineProperty(process, "arch", {
    value: oldArch,
    configurable: true,
  });
  Object.defineProperty(process.versions, "node", nodeDescriptor);
  Object.defineProperty(process, "version", versionDescriptor);
  for (const [key, value] of [
    ["LOCALAPPDATA", oldLocal],
    ["SystemRoot", oldSystem],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
async function run() {
  return runWindowsPublicCampaign(
    values,
    { signal: abort.signal, onTestFinished: () => {} },
    execute,
  );
}
async function publicResult() {
  const dir = (await fs.readdir(values.EVIDENCE)).find((x) =>
    x.startsWith("public-"),
  )!;
  return JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, dir, "result.json"), "utf8"),
  ) as { passed: boolean; failures: unknown[] };
}
it("awaits the installed-root public run and stock guarded cleanup before PASS", async () => {
  await run();
  expect((await publicResult()).passed).toBe(true);
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  expect(
    execute.mock.calls.some(
      ([file]) => path.basename(file) === "Uninstall OMXTerm.exe",
    ),
  ).toBe(true);
  await expect(fs.stat(installed)).rejects.toMatchObject({ code: "ENOENT" });
});
it("keeps a diagnostic observation non-qualifying after guarded cleanup", async () => {
  values.childInputDiagnostic = true;
  await expect(run()).rejects.toThrow(
    "Public Windows Snippets campaign failed",
  );
  const result = await publicResult();
  expect(result.passed).toBe(false);
  expect(JSON.stringify(result.failures)).toContain(
    "PUBLIC_CHILD_STDIN_DIAGNOSTIC_NOT_QUALIFICATION",
  );
  expect(
    execute.mock.calls.some(
      ([file]) => path.basename(file) === "Uninstall OMXTerm.exe",
    ),
  ).toBe(true);
});

it("does not let child diagnostics turn a scenario failure into success", async () => {
  values.childInputDiagnostic = true;
  mode = "scenario";
  await expect(run()).rejects.toThrow(
    "Public Windows Snippets campaign failed",
  );
  const result = await publicResult();
  expect(result.passed).toBe(false);
  expect(result.failures.length).toBeGreaterThan(0);
  expect(JSON.stringify(result.failures)).not.toContain(
    "PUBLIC_CHILD_STDIN_DIAGNOSTIC_NOT_QUALIFICATION",
  );
});

it("controls controller metadata independently of the headless runtime", async () => {
  expect(process.versions.node).toBe("24.22.0");
  expect(process.version).toBe("v24.22.0");
  await run();
  expect((await publicResult()).passed).toBe(true);
});
it("keeps mock transaction directories controlled despite host temp variables", async () => {
  const other = path.join(root, "other-temp");
  await fs.mkdir(other);
  const names = ["TEMP", "TMP", "TMPDIR"] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) process.env[name] = other;
    await run();
    expect(path.dirname(path.dirname(relocated))).toBe(path.join(root, "tmp"));
    expect(await fs.readdir(other)).toEqual([]);
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
it("refuses an unsupported actual controller major before installation", async () => {
  Object.defineProperty(process.versions, "node", { value: "26.12.1" });
  await expect(run()).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
  expect((await publicResult()).passed).toBe(false);
});
it("refuses an evidence lane inside the reference stage before creating it", async () => {
  values.EVIDENCE = path.join(values.STAGE, "evidence");
  await expect(run()).rejects.toThrow("separate");
  await expect(fs.stat(values.EVIDENCE)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(execute).not.toHaveBeenCalled();
});
it("rejects an independently mismatched NSIS before any stock command", async () => {
  mode = "bad-installer";
  await expect(run()).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect((await publicResult()).passed).toBe(false);
});
it("awaits the native return before starting uninstall", async () => {
  mode = "native-pending";
  const operation = run();
  await enteredNative;
  expect(relocated).toBe("");
  expect((await publicResult()).passed).toBe(false);
  releaseNative();
  await operation;
  expect(relocated).not.toBe("");
});
it("does not leave PASS if final publication fails", async () => {
  const actual = await vi.importActual<typeof syncFs>("node:fs");
  vi.mocked(syncFs.writeFileSync).mockImplementation((file, data, options) => {
    if (
      String(file).endsWith("result.json") &&
      path.basename(path.dirname(String(file))).startsWith("public-")
    )
      throw new Error("final publication failed");
    actual.writeFileSync(file, data, options);
  });
  try {
    await expect(run()).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ message: "final publication failed" }),
      ],
    });
    expect((await publicResult()).passed).toBe(false);
  } finally {
    vi.mocked(syncFs.writeFileSync).mockImplementation(actual.writeFileSync);
  }
});
it("retains a prior scenario failure when final publication also fails", async () => {
  mode = "scenario";
  const actual = await vi.importActual<typeof syncFs>("node:fs");
  vi.mocked(syncFs.writeFileSync).mockImplementation((file, data, options) => {
    if (path.basename(path.dirname(String(file))).startsWith("public-"))
      throw new Error("publication failure");
    actual.writeFileSync(file, data, options);
  });
  try {
    await expect(run()).rejects.toMatchObject({
      errors: [
        expect.any(AggregateError),
        expect.objectContaining({ message: "publication failure" }),
      ],
    });
    expect((await publicResult()).passed).toBe(false);
  } finally {
    vi.mocked(syncFs.writeFileSync).mockImplementation(actual.writeFileSync);
  }
});
it("withholds PASS through pending uninstall and honors cancellation", async () => {
  mode = "uninstall-pending";
  const operation = run();
  await enteredUninstall;
  expect((await publicResult()).passed).toBe(false);
  abort.abort(new Error("cancelled during uninstall"));
  releaseUninstall();
  await expect(operation).rejects.toThrow();
  expect((await publicResult()).passed).toBe(false);
});
it.each([
  "missing",
  "malformed",
  "mismatch",
  "cleanup-errors",
  "rejected",
  "receipt-only",
  "invalid-return",
  "stale",
])(
  "retains installation and relocated copy for %s settlement",
  async (selected) => {
    mode = selected;
    await expect(run()).rejects.toThrow();
    expect((await publicResult()).passed).toBe(false);
    expect(
      execute.mock.calls.some(
        ([file]) => path.basename(file) === "Uninstall OMXTerm.exe",
      ),
    ).toBe(false);
    const copies = (await fs.readdir(path.join(root, "tmp"))).filter((x) =>
      x.startsWith("omxterm-uninstaller-"),
    );
    expect(copies).toHaveLength(1);
    expect(
      await fs.readFile(
        path.join(root, "tmp", copies[0]!, "Uninstall OMXTerm.exe"),
        "utf8",
      ),
    ).toBe("uninstaller");
    expect(await fs.readFile(path.join(installed, "OMXTerm.exe"), "utf8")).toBe(
      "payload",
    );
  },
);
it("allows stock rollback before callback on payload failure", async () => {
  mode = "precallback";
  await expect(run()).rejects.toThrow();
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
  expect(
    execute.mock.calls.some(
      ([file]) => path.basename(file) === "Uninstall OMXTerm.exe",
    ),
  ).toBe(true);
  expect((await publicResult()).passed).toBe(false);
});
it("permits cleanup after clean settlement even when scenario assertion fails", async () => {
  mode = "scenario";
  await expect(run()).rejects.toThrow();
  expect(relocated).not.toBe("");
  expect((await publicResult()).passed).toBe(false);
});
it("refuses a later stable source version instead of relabeling dev36", async () => {
  mode = "bad-source-version";
  await expect(run()).rejects.toThrow();
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
  expect(relocated).toBe("");
  expect((await publicResult()).passed).toBe(false);
});
it("rejects a runtime that differs from the pinned loader proof", async () => {
  mode = "bad-loader-runtime";
  await expect(run()).rejects.toThrow();
  expect(relocated).not.toBe("");
  expect((await publicResult()).passed).toBe(false);
});
it("rejects an incomplete backend Quit even after supervisor settlement", async () => {
  mode = "bad-quit";
  await expect(run()).rejects.toThrow();
  expect(relocated).not.toBe("");
  expect((await publicResult()).passed).toBe(false);
});
it("allows joined timeout cleanup without claiming normal success", async () => {
  mode = "timeout";
  await expect(run()).rejects.toThrow();
  expect(relocated).not.toBe("");
  expect((await publicResult()).passed).toBe(false);
});
it.each(["assisted", "unknown-assistance", "historical"])(
  "allows owned cleanup but withholds normal-Quit success for %s evidence",
  async (classification) => {
    mode = classification;
    await expect(run()).rejects.toThrow();
    expect(relocated).not.toBe("");
    expect((await publicResult()).passed).toBe(false);
  },
);
it("preserves primary and cleanup failures", async () => {
  mode = "primary-cleanup";
  await expect(run()).rejects.toThrow();
  const result = await publicResult();
  const text = JSON.stringify(result.failures);
  expect(text).toContain("uninstall failed deliberately");
  expect(text).toContain("Expected values to be strictly deep-equal");
  expect(result.passed).toBe(false);
});
it("cancellation after settlement cannot publish PASS", async () => {
  mode = "cancel";
  await expect(run()).rejects.toThrow();
  expect((await publicResult()).passed).toBe(false);
  expect(relocated).not.toBe("");
});
