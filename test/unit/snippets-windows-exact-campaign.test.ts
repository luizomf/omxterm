import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { runWindowsExactCampaign } from "../fixtures/snippets-windows-exact-campaign";
import * as identity from "../fixtures/snippets-windows-exact-identity";
import * as runner from "../fixtures/run-native-fixture";

vi.mock("node:fs", { spy: true });
vi.mock("../fixtures/snippets-windows-exact-identity", { spy: true });
vi.mock("../fixtures/run-native-fixture", { spy: true });
let root: string;
let abort: AbortController;
let mode: string;
let values: NonNullable<
  ReturnType<
    typeof import("../fixtures/snippets-windows-exact-inputs").windowsExactInputs
  >
>;
const originalPlatform = process.platform,
  originalArch = process.arch;
beforeAll(async () => {
  // Start the real host esbuild before emulating only the campaign's target gate.
  await build({ stdin: { contents: "" }, write: false, logLevel: "silent" });
});
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
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "windows-exact-campaign-"));
  abort = new AbortController();
  mode = "stage-change";
  Object.defineProperty(process, "platform", { value: "win32" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  await fs.mkdir(path.join(root, "stage"));
  await fs.writeFile(path.join(root, "stage/OMXTerm.exe"), "stage-before");
  await fs.writeFile(path.join(root, "installer.exe"), "installer");
  await fs.writeFile(path.join(root, "archive.omxext"), "archive");
  const source = JSON.parse(await fs.readFile("package.json", "utf8")) as {
    version: string;
  };
  values = {
    STAGE: path.join(root, "stage"),
    INSTALLER: path.join(root, "installer.exe"),
    INSTALLER_SHA256: createHash("sha256").update("installer").digest("hex"),
    ARCHIVE: path.join(root, "archive.omxext"),
    VERSION: source.version,
    EVIDENCE: path.join(root, "lane"),
    probe: false,
  };
  vi.mocked(identity.verifySnippetsArchive).mockImplementation(
    identity.fileIdentity,
  );
  vi.mocked(identity.inspectWindowsStage).mockImplementation(async () => ({
    version: values.VERSION,
    executable: path.join(values.STAGE, "OMXTerm.exe"),
    asar: path.join(values.STAGE, "resources/app.asar"),
    snapshot: await identity.snapshotWindowsStage(values.STAGE),
    executableSha256: "exe",
    asarSha256: "asar",
    entrySha256: "entry",
    backendSha256: "backend",
    nodePtyVersion: "1.2.0-beta.18",
    resttyVersion: "0.3.0",
    runtime: [],
  }));
  vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
    const config = JSON.parse(await fs.readFile(options.args[1]!, "utf8")) as {
      evidence: string;
      probe?: boolean;
    };
    if (config.probe)
      await fs.writeFile(
        path.join(config.evidence, "probe.json"),
        JSON.stringify({
          classification: "early-arm-probe-not-qualification",
          ready: true,
          mainPid: 41,
          pty: { pid: 42, identity: "123" },
        }),
      );
    else if (mode === "truncated-scenario")
      await fs.writeFile(
        path.join(config.evidence, "scenario.json"),
        '{"checks":',
      );
    else if (mode !== "missing-scenario")
      await fs.writeFile(
        path.join(config.evidence, "scenario.json"),
        JSON.stringify({
          checks,
          archiveSha256: identity.SNIPPETS_SHA256,
          approvals: 1,
          input:
            "synthetic Windows SendInput; independently observed held/released state; controlled native consent and ConPTY probe; production Windows ARM64 composition",
        }),
      );
    await fs.writeFile(
      path.join(config.evidence, "controller.json"),
      JSON.stringify({
        outcome: { code: 0, signal: null },
        closed: true,
        stdoutEnded: true,
        stderrEnded: mode !== "no-eof",
        truncated: mode === "truncated",
        failures: [],
      }),
    );
    await fs.writeFile(
      path.join(config.evidence, "quit.json"),
      JSON.stringify({ joined: mode !== "forced-cleanup" }),
    );
    if (mode === "stage-change" || mode === "failure-and-change")
      await fs.writeFile(
        path.join(values.STAGE, "OMXTerm.exe"),
        "changed-after-launch",
      );
    if (mode === "archive-change")
      await fs.writeFile(values.ARCHIVE, "changed-after-launch");
    if (mode === "installer-change")
      await fs.writeFile(values.INSTALLER, "changed-after-launch");
    if (mode === "cancelled") abort.abort(new Error("cancelled"));
    return {
      exitCode: 0,
      signal: null,
      reason: ["supervisor-lost", "failure-and-change"].includes(mode)
        ? "parent-disconnected"
        : "exit",
      cleanupErrors: [],
      cleanupAssistance: "none",
      stdout: "",
      stderr: "",
    };
  });
});
afterEach(async () => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
  Object.defineProperty(process, "arch", { value: originalArch });
  for (const call of vi.mocked(runner.runNativeFixture).mock.calls)
    await fs.rm(call[0].root, { recursive: true, force: true });
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

it("rejects a stage changed after the controlled normal campaign and preserves a non-success result", async () => {
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain("stage changed");
});

it("still rechecks and retains a changed stage after a supervisor failure", async () => {
  mode = "failure-and-change";
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const dir = path.join(values.EVIDENCE, run);
  const result = JSON.parse(
    await fs.readFile(path.join(dir, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain("stage changed");
  expect(result.failures.join("\n")).toContain("parent-disconnected");
  expect((await fs.stat(path.join(dir, "stage-after.json"))).isFile()).toBe(
    true,
  );
  expect((await fs.stat(path.join(dir, "archive-after.json"))).isFile()).toBe(
    true,
  );
  expect((await fs.stat(path.join(dir, "installer-after.json"))).isFile()).toBe(
    true,
  );
});

it("requires the controlled normal result and retains the profile and identity manifest", async () => {
  mode = "normal";
  await runWindowsExactCampaign(values, {
    signal: abort.signal,
    onTestFinished: () => {},
  });
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const dir = path.join(values.EVIDENCE, run);
  expect(
    JSON.parse(await fs.readFile(path.join(dir, "result.json"), "utf8")),
  ).toMatchObject({ passed: true, profileRetained: true });
  expect((await fs.stat(path.join(dir, "fixture"))).isDirectory()).toBe(true);
  const artifacts = JSON.parse(
    await fs.readFile(path.join(dir, "artifacts.json"), "utf8"),
  ) as {
    stage: { snapshot: { files: unknown } };
    parser: { version: string; bundleSha256: string };
    controllerNode: { sha256: string };
  };
  expect(Array.isArray(artifacts.stage.snapshot.files)).toBe(true);
  expect(artifacts.parser.version).toBe("0.3.0");
  expect(artifacts.parser.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(artifacts.controllerNode.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    path.dirname(
      vi.mocked(runner.runNativeFixture).mock.calls[0]![0].evidencePath!,
    ),
  ).toBe(values.EVIDENCE);
});

it("rejects a changed controlled-Node executable identity after a normal run", async () => {
  mode = "normal";
  const actual = await vi.importActual<typeof identity>(
    "../fixtures/snippets-windows-exact-identity",
  );
  let nodeReads = 0;
  vi.mocked(identity.fileIdentity).mockImplementation(async (file) => {
    const result = await actual.fileIdentity(file);
    if (file === process.execPath && ++nodeReads > 1)
      return { ...result, sha256: "f".repeat(64) };
    return result;
  });
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  expect(nodeReads).toBe(2);
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain("controlled Node changed");
});

it("refuses a packaged/runtime identity mismatch before starting the supervisor", async () => {
  const inspect = vi
    .mocked(identity.inspectWindowsStage)
    .getMockImplementation()!;
  vi.mocked(identity.inspectWindowsStage).mockImplementation(
    async (...args) => ({
      ...(await inspect(...args)),
      resttyVersion: "wrong",
    }),
  );
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(identity.inspectWindowsStage).toHaveBeenCalledExactlyOnceWith(
    await fs.realpath(values.STAGE),
    values.VERSION,
  );
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain(
    "packaged Restty version differs",
  );
});

it("refuses an explicit source/packaged version mismatch before the supervisor", async () => {
  values.VERSION = "999.0.0";
  const source = JSON.parse(await fs.readFile("package.json", "utf8")) as {
    version: string;
  };
  expect(source.version).not.toBe(values.VERSION);
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow("Exact Windows Snippets campaign failed");
  expect(identity.inspectWindowsStage).toHaveBeenCalledExactlyOnceWith(
    await fs.realpath(values.STAGE),
    values.VERSION,
  );
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const dir = path.join(values.EVIDENCE, run);
  const result = JSON.parse(
    await fs.readFile(path.join(dir, "result.json"), "utf8"),
  ) as {
    passed: boolean;
    failures: string[];
  };
  expect(result.passed).toBe(false);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toContain("source/packaged host version mismatch");
  for (const file of [
    "stage-after.json",
    "archive-after.json",
    "installer-after.json",
    "node-after.json",
  ])
    expect((await fs.stat(path.join(dir, file))).isFile()).toBe(true);
  await expect(fs.stat(path.join(dir, "artifacts.json"))).rejects.toMatchObject(
    { code: "ENOENT" },
  );
});

it("records a completed readiness-only probe without claiming qualification", async () => {
  mode = "normal";
  values.probe = true;
  await runWindowsExactCampaign(values, {
    signal: abort.signal,
    onTestFinished: () => {},
  });
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const dir = path.join(values.EVIDENCE, run);
  expect(
    JSON.parse(await fs.readFile(path.join(dir, "result.json"), "utf8")),
  ).toMatchObject({ passed: false, probeComplete: true });
  expect(
    JSON.parse(await fs.readFile(path.join(dir, "probe.json"), "utf8")),
  ).toMatchObject({
    classification: "early-arm-probe-not-qualification",
    ready: true,
  });
  await expect(fs.stat(path.join(dir, "scenario.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("rejects cancellation during the final stage identity check", async () => {
  mode = "normal";
  const actual = await vi.importActual<typeof identity>(
    "../fixtures/snippets-windows-exact-identity",
  );
  let snapshots = 0;
  vi.mocked(identity.snapshotWindowsStage).mockImplementation(async (stage) => {
    const result = await actual.snapshotWindowsStage(stage);
    if (++snapshots === 3) abort.abort(new Error("final identity cancelled"));
    return result;
  });
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  expect(snapshots).toBe(3);
  expect(abort.signal.reason).toMatchObject({
    message: "final identity cancelled",
  });
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain("final identity cancelled");
});

it("does not leave a successful probe checkpoint if final publication fails", async () => {
  mode = "normal";
  values.probe = true;
  const actual = await vi.importActual<typeof syncFs>("node:fs");
  vi.mocked(syncFs.writeFileSync).mockImplementation((file, data, options) => {
    if (String(file).endsWith("result.json"))
      throw new Error("final publication failed");
    actual.writeFileSync(file, data, options);
  });
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow("final publication failed");
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; probeComplete: boolean; finalizing: boolean };
  expect(result).toMatchObject({
    passed: false,
    probeComplete: false,
    finalizing: true,
  });
  expect(
    JSON.parse(
      await fs.readFile(path.join(values.EVIDENCE, run, "probe.json"), "utf8"),
    ),
  ).toMatchObject({
    classification: "early-arm-probe-not-qualification",
    ready: true,
  });
});

it("uses the existing shared lane guard rather than launching over unresolved ownership", async () => {
  const actual = await vi.importActual<typeof runner>(
    "../fixtures/run-native-fixture",
  );
  vi.mocked(runner.runNativeFixture).mockImplementation(
    actual.runNativeFixture,
  );
  await fs.mkdir(values.EVIDENCE);
  const marker = path.join(values.EVIDENCE, "ownership-blocked.json");
  await fs.writeFile(marker, "retained-owner");
  await expect(
    runWindowsExactCampaign(values, {
      signal: abort.signal,
      onTestFinished: () => {},
    }),
  ).rejects.toThrow();
  expect(runner.runNativeFixture).toHaveBeenCalledOnce();
  expect(await fs.readFile(marker, "utf8")).toBe("retained-owner");
  const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const result = JSON.parse(
    await fs.readFile(path.join(values.EVIDENCE, run, "result.json"), "utf8"),
  ) as { passed: boolean; failures: string[] };
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toContain(
    "Native fixture ownership unresolved",
  );
});

it.each([
  ["archive-change", "archive changed"],
  ["installer-change", "installer changed"],
  ["cancelled", "cancelled"],
  ["supervisor-lost", "parent-disconnected"],
  ["no-eof", "stderrEnded"],
  ["truncated", "truncated"],
  ["missing-scenario", "ENOENT"],
  ["truncated-scenario", "SyntaxError"],
  ["forced-cleanup", "false !== true"],
] as const)(
  "retains non-success for %s even with controlled zero exits",
  async (selected, expectedFailure) => {
    mode = selected;
    await expect(
      runWindowsExactCampaign(values, {
        signal: abort.signal,
        onTestFinished: () => {},
      }),
    ).rejects.toThrow("Exact Windows Snippets campaign failed");
    expect(runner.runNativeFixture).toHaveBeenCalledOnce();
    const run = (await fs.readdir(values.EVIDENCE)).find((name) =>
      name.startsWith("run-"),
    )!;
    const dir = path.join(values.EVIDENCE, run);
    const result = JSON.parse(
      await fs.readFile(path.join(dir, "result.json"), "utf8"),
    ) as { passed: boolean; failures: string[] };
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain(expectedFailure);
    if (selected === "archive-change")
      expect(await fs.readFile(values.ARCHIVE, "utf8")).toBe(
        "changed-after-launch",
      );
    if (selected === "installer-change")
      expect(await fs.readFile(values.INSTALLER, "utf8")).toBe(
        "changed-after-launch",
      );
    if (selected === "cancelled")
      expect(abort.signal.reason).toMatchObject({ message: "cancelled" });
    if (selected === "no-eof" || selected === "truncated") {
      const controller = JSON.parse(
        await fs.readFile(path.join(dir, "controller.json"), "utf8"),
      ) as { stderrEnded: boolean; truncated: boolean };
      expect(controller.stderrEnded).toBe(selected !== "no-eof");
      expect(controller.truncated).toBe(selected === "truncated");
    }
    if (selected === "missing-scenario")
      await expect(
        fs.stat(path.join(dir, "scenario.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    if (selected === "truncated-scenario")
      expect(await fs.readFile(path.join(dir, "scenario.json"), "utf8")).toBe(
        '{"checks":',
      );
    if (selected === "forced-cleanup")
      expect(
        JSON.parse(await fs.readFile(path.join(dir, "quit.json"), "utf8")),
      ).toEqual({ joined: false });
  },
);
