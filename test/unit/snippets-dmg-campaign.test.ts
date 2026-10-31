import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runDmgCampaign } from "../fixtures/snippets-dmg-campaign";
import * as dmg from "../fixtures/snippets-dmg";
import * as runner from "../fixtures/run-native-fixture";

vi.mock("../fixtures/snippets-dmg", { spy: true });
vi.mock("../fixtures/run-native-fixture", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("node:fs", { spy: true });
vi.mock("esbuild", { spy: true });
let root: string;
let abort: AbortController;
let values: NonNullable<ReturnType<typeof dmg.dmgInputs>>;
const platform = process.platform,
  arch = process.arch;
const getuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");
const checks = [
  "absent-package-management-no-activation",
  "ordinary-archive-trust-enabled-activation",
  "compatibility-toggle-single-retained-view",
  "exact-insert-run-native-enter-repeat-release",
  "preview-overrides-both-intents-cancel-restores-focus",
  "retained-search-hide-reactivate",
  "live-en-US-pt-BR-retained-query",
  "disabled-package-management-no-enable",
  "disable-uninstall-unchanged-catalog-live-surface-pty",
];
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "dmg-campaign-unit-"));
  abort = new AbortController();
  Object.defineProperty(process, "platform", { value: "darwin" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  vi.spyOn(os, "userInfo").mockReturnValue({
    ...os.userInfo(),
    shell: "/bin/sh",
  });
  Object.defineProperty(process, "getuid", {
    configurable: true,
    value: () => 501,
  });
  await fs.writeFile(path.join(root, "dmg"), "dmg");
  await fs.writeFile(path.join(root, "archive"), "archive");
  const binary = path.join(root, "quartz");
  await fs.writeFile(binary, "tool", { mode: 0o700 });
  await fs.writeFile(
    path.join(root, "tool.json"),
    JSON.stringify({
      executable: binary,
      sourceSha256: dmg.sha256(
        await fs.readFile("test/fixtures/snippets-quartz.swift"),
      ),
      binarySha256: dmg.sha256(Buffer.from("tool")),
    }),
  );
  values = {
    DMG: path.join(root, "dmg"),
    DMG_SHA256: dmg.sha256(Buffer.from("dmg")),
    ARCHIVE: path.join(root, "archive"),
    ARCHIVE_SHA256: dmg.sha256(Buffer.from("archive")),
    VERSION: "1.0.0",
    EVIDENCE: path.join(root, "lane"),
    QUARTZ_TOOL: path.join(root, "tool.json"),
  };
  vi.mocked(dmg.copyDmgApplication).mockResolvedValue({
    application: path.join(root, "app"),
    binding: "binding",
  });
  vi.mocked(dmg.inspectDmgApplication).mockResolvedValue({
    executable: "/app/exe",
    asar: "/app/asar",
    executableSha256: "exe",
    asarSha256: "asar",
    backendSha256: "backend",
  });
  vi.mocked(dmg.bundleIdentity).mockResolvedValue("binding");
  vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
    const config = JSON.parse(await fs.readFile(options.args[1]!, "utf8")) as {
      evidence: string;
    };
    await fs.writeFile(
      path.join(config.evidence, "scenario.json"),
      JSON.stringify({
        checks,
        archiveSha256: values.ARCHIVE_SHA256,
        approvals: 1,
        input:
          "synthetic Quartz session input; tagged OS release and held-state observation; controlled native consent; production macOS ARM64 composition",
      }),
    );
    return {
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
      stdout: "",
      stderr: "",
    };
  });
});
afterEach(async () => {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process, "arch", { value: arch });
  if (getuidDescriptor)
    Object.defineProperty(process, "getuid", getuidDescriptor);
  else Reflect.deleteProperty(process, "getuid");
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
  // No real runner launch occurs. Its unhanded launcher directories are ours.
  for (const call of vi.mocked(runner.runNativeFixture).mock.calls)
    await fs.rm(call[0].root, { recursive: true, force: true });
});
const run = () =>
  runDmgCampaign(values, { signal: abort.signal, onTestFinished: () => {} });
async function receipt() {
  const runName = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const directory = path.join(values.EVIDENCE, runName);
  return {
    directory,
    result: JSON.parse(
      await fs.readFile(path.join(directory, "result.json"), "utf8"),
    ) as { passed: boolean },
  };
}
it("retains the profile even after a successful exact campaign for root cleanup", async () => {
  await run();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(true);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
});
it("rejects cancellation during the actual final bundle identity await and retains evidence", async () => {
  vi.mocked(dmg.bundleIdentity).mockImplementation(async () => {
    abort.abort(new Error("final identity cancelled"));
    return "binding";
  });
  await expect(run()).rejects.toThrow();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(false);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
});
it("rejects cancellation during asynchronous result publication without deleting the profile", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.writeFile).mockImplementation(async (file, data, options) => {
    await actual.writeFile(file, data, options);
    if (String(file).endsWith("result.json"))
      abort.abort(new Error("publication cancelled"));
  });
  await expect(run()).rejects.toThrow();
  expect((await receipt()).result.passed).toBe(false);
});
it("refuses a cancelled/lost supervisor even with zero native exit and settled cleanup", async () => {
  vi.mocked(runner.runNativeFixture).mockResolvedValue({
    exitCode: 0,
    signal: null,
    reason: "parent-disconnected",
    cleanupErrors: [],
    stdout: "",
    stderr: "",
  });
  await expect(run()).rejects.toThrow();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(false);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
});
it("keeps the non-success checkpoint and profile when final synchronous publication fails", async () => {
  const actual = await vi.importActual<typeof syncFs>("node:fs");
  vi.mocked(syncFs.writeFileSync).mockImplementation((file, data, options) => {
    if (String(file).endsWith("result.json"))
      throw new Error("final publication failed");
    actual.writeFileSync(file, data, options);
  });
  await expect(run()).rejects.toThrow("final publication failed");
  const { directory, result } = await receipt();
  expect(result.passed).toBe(false);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
});
it("records asynchronous publication failure as failure even if final writing succeeds", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.writeFile).mockImplementation(async (file, data, options) => {
    if (String(file).endsWith("result.json"))
      throw new Error("checkpoint failed");
    await actual.writeFile(file, data, options);
  });
  await expect(run()).rejects.toThrow();
  expect((await receipt()).result.passed).toBe(false);
});
it("retains failure when final bundle identity fails", async () => {
  vi.mocked(dmg.bundleIdentity).mockRejectedValue(
    new Error("identity unavailable"),
  );
  await expect(run()).rejects.toThrow();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(false);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
});
it("uses the actual runner guard to refuse a previous unresolved owner across fresh receipts", async () => {
  const actual = await vi.importActual<typeof runner>(
    "../fixtures/run-native-fixture",
  );
  vi.mocked(runner.runNativeFixture).mockImplementation(
    actual.runNativeFixture,
  );
  await fs.mkdir(values.EVIDENCE);
  const marker = path.join(values.EVIDENCE, "ownership-blocked.json");
  await fs.writeFile(marker, "retained-owner");
  // If the lane is incorrectly scoped, stop before any actual process/build.
  const build = await import("esbuild");
  const buildSpy = vi
    .spyOn(build, "build")
    .mockRejectedValue(new Error("unexpected preparation past guard"));
  for (let i = 0; i < 2; i++) await expect(run()).rejects.toThrow();
  expect(buildSpy).not.toHaveBeenCalled();
  expect(await fs.readFile(marker, "utf8")).toBe("retained-owner");
  const runs = (await fs.readdir(values.EVIDENCE)).filter((name) =>
    name.startsWith("run-"),
  );
  expect(runs).toHaveLength(2);
  for (const runName of runs) {
    const result = JSON.parse(
      await fs.readFile(
        path.join(values.EVIDENCE, runName, "result.json"),
        "utf8",
      ),
    ) as { passed: boolean; failures: string[] };
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain(
      "Native fixture ownership unresolved",
    );
  }
  for (const call of vi.mocked(runner.runNativeFixture).mock.calls)
    expect(path.dirname(call[0].evidencePath!)).toBe(values.EVIDENCE);
});
