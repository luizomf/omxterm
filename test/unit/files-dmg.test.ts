import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  filesDmgInputs,
  filesDmgChecks,
  filesPublicLinkChecks,
  runFilesDmgCampaign,
} from "../fixtures/files-dmg";
import * as dmg from "../fixtures/snippets-dmg";
import * as runner from "../fixtures/run-native-fixture";
vi.mock("../fixtures/snippets-dmg", { spy: true });
vi.mock("../fixtures/run-native-fixture", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("node:fs", { spy: true });
vi.mock("esbuild", { spy: true });
let root: string, abort: AbortController;
let values: NonNullable<ReturnType<typeof filesDmgInputs>>;
const platform = process.platform,
  arch = process.arch;
const getuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "files-dmg-unit-"));
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
  values = {
    DMG: path.join(root, "dmg"),
    DMG_SHA256: dmg.sha256(Buffer.from("dmg")),
    ARCHIVE: path.join(root, "archive"),
    ARCHIVE_SHA256: dmg.sha256(Buffer.from("archive")),
    VERSION: "0.24.0-dev.21",
    EVIDENCE: path.join(root, "lane"),
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
      publicLink?: string;
    };
    await fs.writeFile(
      path.join(config.evidence, "scenario.json"),
      JSON.stringify({
        checks: config.publicLink ? filesPublicLinkChecks : filesDmgChecks,
        approvals: 3,
        sourceExited: true,
        archiveSha256: values.ARCHIVE_SHA256,
        ...(config.publicLink
          ? {
              publicLink: {
                url: config.publicLink,
                installs: Array(3).fill(config.publicLink),
              },
            }
          : {}),
      }),
    );
    if (!config.publicLink)
      await fs.writeFile(
        path.join(config.evidence, "trash-recovery.json"),
        JSON.stringify({ phase: "restored", verified: true, restored: true }),
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
  for (const call of vi.mocked(runner.runNativeFixture).mock.calls)
    await fs.rm(call[0].root, { recursive: true, force: true });
});
const publicLink =
  "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.5.0/files-0.5.0-a343704c0794.omxext";
const run = () =>
  runFilesDmgCampaign(values, {
    signal: abort.signal,
    onTestFinished: () => {},
  });
async function receipt() {
  const name = (await fs.readdir(values.EVIDENCE)).find((name) =>
    name.startsWith("run-"),
  )!;
  const directory = path.join(values.EVIDENCE, name);
  return {
    directory,
    result: JSON.parse(
      await fs.readFile(path.join(directory, "result.json"), "utf8"),
    ) as { passed: boolean },
  };
}
it("requires complete explicit inputs and does not infer target or reuse another adapter", () => {
  expect(filesDmgInputs({})).toBeUndefined();
  const env = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      "OMXTERM_FILES_DMG_" + key,
      value,
    ]),
  );
  expect(filesDmgInputs(env)).toEqual(values);
  expect(() => filesDmgInputs({ OMXTERM_FILES_DMG_DMG: values.DMG })).toThrow();
  expect(() =>
    filesDmgInputs({ ...env, OMXTERM_FILES_DMG_ARCHIVE: "relative" }),
  ).toThrow();
  expect(() =>
    filesDmgInputs({ ...env, OMXTERM_FILES_DMG_DMG_SHA256: "wrong" }),
  ).toThrow();
  expect(() =>
    filesDmgInputs({ ...env, OMXTERM_FILES_PACKAGED_APPIMAGE: "/other" }),
  ).toThrow();
});
it("accepts only explicit immutable project public-link inputs", () => {
  const env = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      "OMXTERM_FILES_DMG_" + key,
      value,
    ]),
  );
  expect(
    filesDmgInputs({ ...env, OMXTERM_FILES_DMG_PUBLIC_LINK: publicLink }),
  ).toEqual({ ...values, PUBLIC_LINK: publicLink });
  for (const url of [
    "",
    "http://github.com/a",
    publicLink + "?x=1",
    publicLink + "#x",
    publicLink.replace("github.com", "user@github.com"),
    publicLink.replace("v0.5.0", "latest"),
    publicLink.replace("v0.5.0", "v0.4.0"),
    publicLink.replace("github.com", "example.org"),
    " " + publicLink,
  ])
    expect(() =>
      filesDmgInputs({ ...env, OMXTERM_FILES_DMG_PUBLIC_LINK: url }),
    ).toThrow();
});
it("prepares public acquisition without local archive substitution or a Trash compiler/recovery oracle", async () => {
  values.PUBLIC_LINK = publicLink;
  const implementation = vi
    .mocked(runner.runNativeFixture)
    .getMockImplementation()!;
  const build = await import("esbuild");
  vi.mocked(build.build).mockResolvedValue({
    errors: [],
    warnings: [],
    outputFiles: undefined,
    metafile: undefined,
    mangleCache: undefined,
  });
  vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
    await options.prepare?.();
    return implementation(options);
  });
  await run();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(true);
  const options: unknown = JSON.parse(
    await fs.readFile(path.join(directory, "options.json"), "utf8"),
  );
  expect(options).toMatchObject({ publicLink, macosLifecycle: false });
  expect(options).not.toHaveProperty("catalogMode");
  expect(options).not.toHaveProperty("trashLookup");
  for (const file of [
    "fixture/files.omxext",
    "fixture/files-trash-recovery.cjs",
    "trash-recovery.json",
    "trash-lookup.json",
    "trash-directory",
  ])
    await expect(fs.stat(path.join(directory, file))).rejects.toMatchObject({
      code: "ENOENT",
    });
  expect(build.build).toHaveBeenCalledTimes(1);
});
it.each([
  "local-checks",
  "missing-link",
  "wrong-link",
  "missing-reinstall",
  "wrong-digest",
  "missing-consent",
])("rejects successful public process with %s evidence", async (mode) => {
  values.PUBLIC_LINK = publicLink;
  const implementation = vi
    .mocked(runner.runNativeFixture)
    .getMockImplementation()!;
  vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
    const result = await implementation(options);
    const config = JSON.parse(await fs.readFile(options.args[1]!, "utf8")) as {
      evidence: string;
    };
    const file = path.join(config.evidence, "scenario.json");
    const scenario = JSON.parse(await fs.readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    if (mode === "local-checks") scenario.checks = filesDmgChecks;
    if (mode === "missing-link") delete scenario.publicLink;
    if (mode === "wrong-link")
      scenario.publicLink = {
        url: "https://example.org/a",
        installs: Array(3).fill(publicLink),
      };
    if (mode === "missing-reinstall")
      scenario.publicLink = { url: publicLink, installs: [publicLink] };
    if (mode === "wrong-digest") scenario.archiveSha256 = "0".repeat(64);
    if (mode === "missing-consent") scenario.approvals = 2;
    await fs.writeFile(file, JSON.stringify(scenario));
    return result;
  });
  await expect(run()).rejects.toThrow();
  expect((await receipt()).result.passed).toBe(false);
});
it("retains the copied application/profile and records actual host separately from source", async () => {
  await run();
  const { directory, result } = await receipt();
  expect(result.passed).toBe(true);
  expect((await fs.stat(path.join(directory, "fixture"))).isDirectory()).toBe(
    true,
  );
  const options: unknown = JSON.parse(
    await fs.readFile(path.join(directory, "options.json"), "utf8"),
  );
  expect(options).toMatchObject({
    version: "0.24.0-dev.21",
    observer: "files-packaged.cjs",
    macosLifecycle: true,
  });
  expect(options).not.toHaveProperty("quartzTool");
  expect(
    path.dirname(
      vi.mocked(runner.runNativeFixture).mock.calls[0]![0].evidencePath!,
    ),
  ).toBe(values.EVIDENCE);
});
it.each(["digest", "detach"])(
  "refuses %s before native launch",
  async (mode) => {
    if (mode === "digest") values.DMG_SHA256 = "0".repeat(64);
    else
      vi.mocked(dmg.copyDmgApplication).mockRejectedValue(
        new Error("detach failed"),
      );
    await expect(run()).rejects.toThrow();
    expect(runner.runNativeFixture).not.toHaveBeenCalled();
    expect((await receipt()).result.passed).toBe(false);
  },
);
it.each(["owner-lost", "unrestored", "wrong-checks"])(
  "rejects %s even with successful process exit",
  async (mode) => {
    const implementation = vi
      .mocked(runner.runNativeFixture)
      .getMockImplementation()!;
    vi.mocked(runner.runNativeFixture).mockImplementation(async (options) => {
      const result = await implementation(options);
      const config = JSON.parse(
        await fs.readFile(options.args[1]!, "utf8"),
      ) as { evidence: string };
      if (mode === "unrestored")
        await fs.writeFile(
          path.join(config.evidence, "trash-recovery.json"),
          JSON.stringify({ verified: true, restored: false }),
        );
      if (mode === "wrong-checks")
        await fs.writeFile(
          path.join(config.evidence, "scenario.json"),
          JSON.stringify({ checks: [], approvals: 3 }),
        );
      return {
        ...result,
        reason: mode === "owner-lost" ? "parent-disconnected" : "exit",
      };
    });
    await expect(run()).rejects.toThrow();
    expect((await receipt()).result.passed).toBe(false);
  },
);
it.each(["identity", "checkpoint", "sync-write"])(
  "cannot publish success when cancelled or failed at %s",
  async (mode) => {
    if (mode === "identity")
      vi.mocked(dmg.bundleIdentity).mockImplementation(async () => {
        abort.abort(Error("cancelled"));
        return "binding";
      });
    if (mode === "checkpoint") {
      const actual = await vi.importActual<typeof fs>("node:fs/promises");
      vi.mocked(fs.writeFile).mockImplementation(
        async (file, data, options) => {
          await actual.writeFile(file, data, options);
          if (String(file).endsWith("result.json"))
            abort.abort(Error("cancelled"));
        },
      );
    }
    if (mode === "sync-write")
      vi.mocked(syncFs.writeFileSync).mockImplementation(() => {
        throw Error("publish failed");
      });
    await expect(run()).rejects.toThrow();
    expect((await receipt()).result.passed).toBe(false);
  },
);
it("uses the same configured lane ownership guard across fresh receipts", async () => {
  const actual = await vi.importActual<typeof runner>(
    "../fixtures/run-native-fixture",
  );
  vi.mocked(runner.runNativeFixture).mockImplementation(
    actual.runNativeFixture,
  );
  await fs.mkdir(values.EVIDENCE);
  await fs.writeFile(
    path.join(values.EVIDENCE, "ownership-blocked.json"),
    "unresolved",
  );
  const build = await import("esbuild");
  for (let i = 0; i < 2; i++) await expect(run()).rejects.toThrow();
  expect(build.build).not.toHaveBeenCalled();
  expect(
    await fs.readFile(
      path.join(values.EVIDENCE, "ownership-blocked.json"),
      "utf8",
    ),
  ).toBe("unresolved");
});
