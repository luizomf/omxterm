import * as childProcess from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";

// Execute the real suite entry up to its external process boundary. Renderer
// bundling is unnecessary for argv coverage; filesystem setup stays real.
async function observeLaunch(name: string, caseIndex = 0) {
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
  const suite = (_name: string, tests: () => void) => tests();
  const require = createRequire(import.meta.url);
  const stopped = new Error("Observed launch before native process creation");
  let args: string[] | undefined;
  let root: string | undefined;
  const capture = (argv: string[]) => {
    args = argv;
    const application = argv.find((value) => value.includes("omxterm-"));
    root = application?.endsWith("main.cjs")
      ? path.dirname(application)
      : application;
    throw stopped;
  };
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
          describe: Object.assign(suite, { skipIf: () => suite }),
          it: Object.assign(register, {
            each:
              (values: unknown[]) =>
              (name: string, test: (value: unknown) => Promise<void>) =>
                values.forEach((value) => register(name, () => test(value))),
          }),
        };
      if (id === "esbuild") return { build: async () => ({}) };
      if (id === "node:child_process")
        return {
          ...childProcess,
          spawn: (_file: string, argv: string[]) => capture(argv),
          execFile: (...values: unknown[]) => {
            try {
              capture(values[1] as string[]);
            } catch (error) {
              (values.at(-1) as (error: unknown) => void)(error);
            }
          },
          // The supervised caller sends the actual executable/argv request.
          // Do not replace runNativeFixture or reimplement its argv policy.
          fork: () => ({
            once() {},
            send(request: { args: string[]; root: string }) {
              root = request.root;
              capture(request.args);
            },
          }),
        };
      return require(id) as unknown;
    },
  });
  try {
    expect(cases.length).toBeGreaterThan(0);
    await expect(cases[caseIndex]!()).rejects.toBe(stopped);
    expect(args).toBeDefined();
    return args!;
  } finally {
    if (root) await rm(root, { recursive: true, force: true });
  }
}

describe("supported custom graphical fixture launches", () => {
  it.each([
    "restty-host-integration",
    "restty-rendering",
    "local-image-native",
    "restty-font-styles-rendering",
  ])("selects X11 before Electron bootstrap in %s", async (name) => {
    const args = await observeLaunch(name);
    expect(args).toContain("--ozone-platform=x11");
    expect(args).toContain("--no-sandbox");
    if (name === "restty-font-styles-rendering") {
      expect(args[0]).toMatch(/main\.cjs$/u);
      expect(args[1]).toMatch(/omxterm-font-styles-/u);
      expect(args.slice(2, 4)).toEqual(["italicOnly", "DejaVu Sans Mono"]);
    } else {
      expect(args.at(-1)).toMatch(/omxterm-/u);
    }
  });

  it("preserves the local-image fractional-scale launch switch", async () => {
    const args = await observeLaunch("local-image-native", 1);
    expect(args).toContain("--force-device-scale-factor=2.5");
    expect(args).toContain("--ozone-platform=x11");
    expect(args.at(-1)).toMatch(/omxterm-/u);
  });

  it("adds no Linux switches on macOS or Windows", () => {
    expect(supportedFixtureChromiumArguments("darwin")).toEqual([]);
    expect(supportedFixtureChromiumArguments("win32")).toEqual([]);
  });
});
