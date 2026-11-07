import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  filesDmgInputs,
  filesPublicCatalogUrl,
  runFilesDmgCampaign,
} from "../fixtures/files-dmg";
import {
  files070MacChecks,
  files070MacCatalogChecks,
  files070Sha256,
  stable025DmgSha256,
} from "../fixtures/files-dmg-070";
import * as dmg from "../fixtures/snippets-dmg";
import * as runner from "../fixtures/run-native-fixture";

vi.mock("../fixtures/snippets-dmg", { spy: true });
vi.mock("../fixtures/run-native-fixture", { spy: true });
let root: string;
let values: NonNullable<ReturnType<typeof filesDmgInputs>>;
const platform = process.platform,
  arch = process.arch;
const getuid = Object.getOwnPropertyDescriptor(process, "getuid");
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "files-dmg-070-unit-"));
  Object.defineProperty(process, "platform", { value: "darwin" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  Object.defineProperty(process, "getuid", {
    configurable: true,
    value: () => 501,
  });
  vi.spyOn(os, "userInfo").mockReturnValue({
    ...os.userInfo(),
    shell: "/bin/sh",
  });
  await fs.writeFile(path.join(root, "dmg"), "dmg");
  await fs.writeFile(path.join(root, "archive"), Buffer.alloc(23285, 42));
  values = {
    DMG: path.join(root, "dmg"),
    DMG_SHA256: stable025DmgSha256,
    ARCHIVE: path.join(root, "archive"),
    ARCHIVE_SHA256: files070Sha256,
    VERSION: "0.25.0",
    EXTENSION_VERSION: "0.7.0",
    FILES_070_ONLY: true,
    EVIDENCE: path.join(root, "lane"),
  };
  vi.mocked(dmg.sha256).mockImplementation((bytes) =>
    bytes.length === 23285
      ? files070Sha256
      : bytes.toString() === "dmg"
        ? stable025DmgSha256
        : createHash("sha256").update(bytes).digest("hex"),
  );
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
      publicCatalog?: string;
    };
    await fs.writeFile(
      path.join(config.evidence, "scenario.json"),
      JSON.stringify({
        checks: config.publicCatalog
          ? files070MacCatalogChecks
          : files070MacChecks,
        approvals: 1,
        archiveSha256: values.ARCHIVE_SHA256,
        ...(config.publicCatalog
          ? {
              publicCatalog: {
                url: config.publicCatalog,
                installs: ["Install"],
              },
              catalog: {
                mode: "public",
                requests: null,
                transportClosed: null,
              },
            }
          : {}),
      }),
    );
    return {
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
      cleanupAssistance: "none",
      stdout: "",
      stderr: "",
    };
  });
});
afterEach(async () => {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process, "arch", { value: arch });
  if (getuid) Object.defineProperty(process, "getuid", getuid);
  else Reflect.deleteProperty(process, "getuid");
  for (const call of vi.mocked(runner.runNativeFixture).mock.calls)
    await fs.rm(call[0].root, { recursive: true, force: true });
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
const run = () =>
  runFilesDmgCampaign(values, {
    signal: new AbortController().signal,
    onTestFinished: () => {},
  });
const env = () =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      "OMXTERM_FILES_DMG_" + key,
      value === true ? "1" : value,
    ]),
  );
async function receipt() {
  const name = (await fs.readdir(values.EVIDENCE)).find((entry) =>
    entry.startsWith("run-"),
  )!;
  const directory = path.join(values.EVIDENCE, name);
  return {
    directory,
    result: JSON.parse(
      await fs.readFile(path.join(directory, "result.json"), "utf8"),
    ) as { passed: boolean; scope: string },
  };
}
it("pins Files-only local and catalog modes to the exact host and archive", () => {
  expect(filesDmgInputs(env())).toMatchObject({ FILES_070_ONLY: true });
  expect(
    filesDmgInputs({
      ...env(),
      OMXTERM_FILES_DMG_PUBLIC_CATALOG: filesPublicCatalogUrl,
    }),
  ).toMatchObject({ PUBLIC_CATALOG: filesPublicCatalogUrl });
  for (const [key, value] of [
    ["FILES_070_ONLY", "0"],
    ["VERSION", "0.24.0"],
    ["EXTENSION_VERSION", "0.6.0"],
    ["ARCHIVE_SHA256", "a".repeat(64)],
    ["DMG_SHA256", "a".repeat(64)],
    ["PUBLIC_LINK", "https://example.org/file"],
  ])
    expect(() =>
      filesDmgInputs({ ...env(), ["OMXTERM_FILES_DMG_" + key]: value }),
    ).toThrow();
});
it.each([false, true])(
  "prepares Files-only mode publicCatalog=%s",
  async (catalog) => {
    if (catalog) values.PUBLIC_CATALOG = filesPublicCatalogUrl;
    await run();
    const { directory, result } = await receipt();
    expect(result.passed).toBe(true);
    expect(result.scope).toContain(
      catalog ? "public catalog" : "local archive",
    );
    const options: unknown = JSON.parse(
      await fs.readFile(path.join(directory, "options.json"), "utf8"),
    );
    expect(options).toMatchObject({
      filesOnly: true,
      consumer070: true,
      macosLifecycle: false,
    });
    expect(options).not.toHaveProperty("trashLookup");
    if (catalog) {
      expect(options).toMatchObject({
        publicCatalog: filesPublicCatalogUrl,
        catalogMode: "public",
      });
      await expect(
        fs.stat(path.join(directory, "fixture/files.omxext")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } else
      expect(
        (await fs.stat(path.join(directory, "fixture/files.omxext"))).isFile(),
      ).toBe(true);
    for (const file of [
      "files-070-consumer.mjs",
      "files-070-macos-adapter.cjs",
    ])
      expect(
        (await fs.stat(path.join(directory, "fixture", file))).isFile(),
      ).toBe(true);
    await expect(
      fs.stat(path.join(directory, "trash-lookup.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  },
);
it.each([
  "checks",
  "consent",
  "digest",
  "catalog",
  "actions",
  "transport",
  "link",
])("rejects catalog result with wrong %s", async (fault) => {
  values.PUBLIC_CATALOG = filesPublicCatalogUrl;
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
    if (fault === "checks") scenario.checks = files070MacChecks;
    if (fault === "consent") scenario.approvals = 0;
    if (fault === "digest") scenario.archiveSha256 = "a".repeat(64);
    if (fault === "catalog") delete scenario.publicCatalog;
    if (fault === "link") scenario.publicLink = { url: "https://example.org" };
    if (fault === "actions")
      scenario.publicCatalog = { url: filesPublicCatalogUrl, installs: [] };
    if (fault === "transport")
      scenario.catalog = {
        mode: "controlled",
        requests: [],
        transportClosed: true,
      };
    await fs.writeFile(file, JSON.stringify(scenario));
    return result;
  });
  await expect(run()).rejects.toThrow();
  expect((await receipt()).result.passed).toBe(false);
});
it("refuses direct callers with mismatched identity before native launch", async () => {
  values.DMG_SHA256 = "a".repeat(64);
  await expect(run()).rejects.toThrow();
  expect(runner.runNativeFixture).not.toHaveBeenCalled();
});
