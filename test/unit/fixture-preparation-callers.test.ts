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
const callers = [
  "restty-background-rendering",
  "restty-cursor-rendering",
  "macos-window-blur",
];
it.each(callers)(
  "%s removes its owned root after post-build setup fails before launch",
  async (name) => {
    const observation = await observeCaller(name, "setup failure");
    expect(observation.removed).toBe(true);
    expect(observation.removalAttempts).toBe(1);
    expect(observation.nativeRequests).toBe(0);
  },
);

it.each(callers)(
  "%s leaves a transferred profile with the supervisor after an uncertain launch",
  async (name) => {
    const observation = await observeCaller(name, "supervisor failure", true);
    expect(observation.failure).toBe(observation.setupFailure);
    expect(observation.removed).toBe(false);
    expect(observation.removalAttempts).toBe(0);
    expect(observation.nativeRequests).toBe(1);
  },
);

it.each(callers)(
  "%s preserves setup and removal errors when its unlaunched root cannot be removed",
  async (name) => {
    const observation = await observeCaller(name, "setup failure", true);
    const aggregate = observation.failure as AggregateError;
    expect(aggregate.name).toBe("AggregateError");
    expect(aggregate.cause).toBe(observation.setupFailure);
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(observation.setupFailure);
    expect(aggregate.errors[1]).toBe(observation.cleanupFailure);
    expect(observation.removed).toBe(false);
    expect(observation.removalAttempts).toBe(1);
    expect(observation.nativeRequests).toBe(0);
  },
);

async function observeCaller(
  name: string,
  failure: "setup failure" | "supervisor failure",
  removalFails = false,
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
  const cleanupFailure = new Error("Controlled owned-root removal failure");
  let root: string | undefined;
  let nativeRequests = 0;
  let removalAttempts = 0;
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
            // Exercise the macOS-only callback's ownership seam without launching
            // native processes or compiling its addon on the host.
            skipIf: () => register,
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
          rm: async (...args: Parameters<typeof filesystem.rm>) => {
            if (args[0] === root) {
              removalAttempts += 1;
              if (removalFails) throw cleanupFailure;
            }
            return filesystem.rm(...args);
          },
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
    const observedFailure: unknown = await cases[0]!().catch(
      (error: unknown) => error,
    );
    if (!removalFails) expect(observedFailure).toBe(stopped);
    expect(root).toBeDefined();
    return {
      removed: !existsSync(root!),
      nativeRequests,
      removalAttempts,
      failure: observedFailure,
      setupFailure: stopped,
      cleanupFailure,
    };
  } finally {
    if (root) await filesystem.rm(root, { recursive: true, force: true });
  }
}
