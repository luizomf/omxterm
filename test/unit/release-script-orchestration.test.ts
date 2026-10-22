import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const { scripts } = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

// npm scripts are the caller-visible orchestration contract. Expand only their
// literal npm-run chains; leave external commands intact for argv assertions.
function commands(script: string): string[] {
  const command = scripts[script];
  if (!command) throw new Error(`Missing npm script: ${script}`);
  return command.split(" && ").flatMap((step) => {
    const child = /^npm run ([\w:-]+)$/u.exec(step)?.[1];
    return child ? commands(child) : [step];
  });
}

// The per-platform packager selects the host architecture itself; its exact
// electron-builder argv is pinned in package-release-plan.test.ts.
const packagerCommands = {
  mac: ["node scripts/package.mjs mac"],
  linux: ["node scripts/package.mjs linux"],
  win: ["node scripts/package.mjs win"],
};

async function runWindowsCheck(args: string[], failScript = "") {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-check-windows-"));
  try {
    const npm = path.join(root, "npm.mjs");
    const driver = path.join(root, "driver.mjs");
    await writeFile(
      npm,
      `console.log(JSON.stringify(process.argv.slice(2)));
if (process.argv[3] === ${JSON.stringify(failScript)}) process.exit(23);\n`,
    );
    await writeFile(
      driver,
      `Object.defineProperty(process, "platform", { value: "win32" });
Object.defineProperty(process, "arch", { value: "arm64" });
await import(${JSON.stringify(new URL("../../scripts/check-windows.mjs", import.meta.url).href)});\n`,
    );
    const environment = { ...process.env };
    // Windows deduplicates environment names case-insensitively at spawn. An
    // inherited NPM_EXECPATH can otherwise win over our fake npm_execpath and
    // recursively run the real checks or packaging instead of the test stub.
    for (const key of Object.keys(environment))
      if (key.toLowerCase() === "npm_execpath") delete environment[key];
    environment.npm_execpath = npm;
    const result = spawnSync(process.execPath, [driver, ...args], {
      env: environment,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      stderr: result.stderr,
      calls: result.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("release script orchestration", () => {
  it.each([
    ["check", "mac"],
    ["check:linux", "linux"],
  ])("%s builds once and retains package verification", (script, platform) => {
    const steps = commands(script);
    expect(steps.filter((step) => step === "node build.mjs")).toHaveLength(1);
    expect(steps).toEqual([
      ...commands("check:portable"),
      ...packagerCommands[platform as "mac" | "linux"],
      "node scripts/verify-packaged-app.mjs",
    ]);
  });

  it.each(["mac", "linux", "win"] as const)(
    "package:%s builds fresh; package-built requires an explicit prior build",
    (platform) => {
      expect(commands(`package:${platform}`)).toEqual([
        "node build.mjs",
        ...packagerCommands[platform],
      ]);
      expect(commands(`package-built:${platform}`)).toEqual(
        packagerCommands[platform],
      );
    },
  );

  it.each([
    ["check:portable", [["run", "check:portable"]]],
    [
      "package-built:win",
      [
        ["run", "check:portable"],
        ["run", "package-built:win"],
      ],
    ],
  ] as const)("Windows stops at a failed %s step", async (script, calls) => {
    const result = await runWindowsCheck([], script);
    expect(result.status).toBe(23);
    expect(result.calls).toEqual(calls);
  });

  it.each(["--windows-unpacked-only", "--force"])(
    "Windows rejects %s before starting any step",
    async (flag) => {
      const result = await runWindowsCheck([flag]);
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([]);
      expect(result.stderr).toMatch(/requires exact installer|Unknown/u);
    },
  );

  it("isolates fake npm from an inherited Windows-cased entrypoint", async () => {
    vi.stubEnv("NPM_EXECPATH", "__unused-inherited-npm-entrypoint__");
    try {
      const result = await runWindowsCheck([]);
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        ["run", "check:portable"],
        ["run", "package-built:win"],
        ["run", "package:verify"],
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("Windows retains full verification without inventing replacement authorization", async () => {
    const result = await runWindowsCheck([]);
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      ["run", "check:portable"],
      ["run", "package-built:win"],
      ["run", "package:verify"],
    ]);
  });

  it("Windows preserves an exact verification failure", async () => {
    const result = await runWindowsCheck([], "package:verify");
    expect(result.status).toBe(23);
    expect(result.calls.at(-1)).toEqual(["run", "package:verify"]);
  });

  it("Windows packages the portable build and forwards the literal installer opt-in only to verification", async () => {
    const flag = "--disposable-vm-allow-omxterm-replacement";
    const result = await runWindowsCheck([flag]);
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      ["run", "check:portable"],
      ["run", "package-built:win"],
      ["run", "package:verify", "--", flag],
    ]);
  });
});
