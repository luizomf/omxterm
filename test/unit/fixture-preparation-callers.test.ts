import * as childProcess from "node:child_process";
import * as filesystem from "node:fs/promises";
import { existsSync } from "node:fs";
import * as module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

// As in supported-fixture-launch.test.ts, execute the actual entry/callback;
// replace only the external test registrar, builder and process boundaries.
it.each(["restty-background-rendering", "restty-cursor-rendering"])(
  "%s removes its owned root after post-build setup fails before launch",
  async (name) => {
    const observation = await observeCaller(name, "setup failure");
    expect(observation.removed).toBe(true);
    expect(observation.nativeRequests).toBe(0);
  },
);

it.each(["restty-background-rendering", "restty-cursor-rendering"])(
  "%s leaves a transferred profile with the supervisor after an uncertain launch",
  async (name) => {
    const observation = await observeCaller(name, "supervisor failure");
    expect(observation.removed).toBe(false);
    expect(observation.nativeRequests).toBe(1);
  },
);

async function observeCaller(
  name: string,
  failure: "setup failure" | "supervisor failure",
) {
  const entry = path.resolve(`test/integration/${name}.test.ts`);
  const compiled = await build({
    entryPoints: [entry],
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
    write: false,
    define: { "import.meta.url": JSON.stringify(pathToFileURL(entry).href) },
  });
  const cases: (() => Promise<void>)[] = [];
  const register = (_name: string, test: () => Promise<void>) =>
    cases.push(test);
  const require = module.createRequire(import.meta.url);
  const stopped = new Error("Controlled external boundary failure");
  let root: string | undefined;
  let nativeRequests = 0;
  runInNewContext(compiled.outputFiles[0]!.text, {
    process: { ...process, platform: "linux" },
    Buffer,
    URL,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    require(id: string) {
      if (id === "vitest")
        return {
          expect,
          it: Object.assign(register, {
            each:
              (values: unknown[]) =>
              (label: string, test: (value: unknown) => Promise<void>) =>
                values.forEach((value) => register(label, () => test(value))),
          }),
        };
      if (id === "esbuild") return { build: async () => ({}) };
      if (id === "node:fs/promises")
        return {
          ...filesystem,
          mkdtemp: async (...args: Parameters<typeof filesystem.mkdtemp>) => {
            root = (await filesystem.mkdtemp(...args)) as string;
            return root;
          },
        };
      if (id === "node:module")
        return {
          ...module,
          createRequire: () => (target: string) => {
            if (target === "electron" && failure === "setup failure")
              throw stopped;
            return require(target) as unknown;
          },
        };
      if (id === "node:child_process")
        return {
          ...childProcess,
          spawn: () => {
            throw new Error("Unexpected native spawn");
          },
          execFile: () => {
            throw new Error("Unexpected native command");
          },
          fork: () => ({
            once() {},
            send() {
              nativeRequests += 1;
              throw stopped;
            },
          }),
        };
      return require(id) as unknown;
    },
  });
  try {
    expect(cases.length).toBeGreaterThan(0);
    await expect(cases[0]!()).rejects.toBe(stopped);
    expect(root).toBeDefined();
    return { removed: !existsSync(root!), nativeRequests };
  } finally {
    if (root) await filesystem.rm(root, { recursive: true, force: true });
  }
}
