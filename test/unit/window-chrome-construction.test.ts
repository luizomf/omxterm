import { beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { assertNativeChromeConstruction } from "../fixtures/window-chrome-construction";

it.each(["linux", "win32", "darwin"])(
  "preserves the independently stated %s native-action construction contract",
  (platform) => {
    const options = terminalWindowOptions(
      "preload.cjs",
      DEFAULT_USER_CONFIGURATION,
      platform,
    );
    expect(options.frame).toBe(platform === "darwin");
    expect(options.transparent).toBe(platform !== "win32");
    expect(options.resizable).not.toBe(false);
    expect(options.maximizable).not.toBe(false);
    expect(options.maxWidth).toBeUndefined();
    expect(options.maxHeight).toBeUndefined();
    expect(() =>
      assertNativeChromeConstruction(options, platform),
    ).not.toThrow();
  },
);
it.each([
  { resizable: false },
  { maximizable: false },
  { maxWidth: 960 },
  { maxHeight: 640 },
  { frame: true },
  { transparent: false },
  { show: true },
  { minWidth: 960 },
  { minHeight: 640 },
])(
  "rejects product construction regression %j independently of native unavailability",
  (change) => {
    const options = terminalWindowOptions(
      "preload.cjs",
      DEFAULT_USER_CONFIGURATION,
      "linux",
    );
    expect(() =>
      assertNativeChromeConstruction({ ...options, ...change }, "linux"),
    ).toThrow();
  },
);
let entry: string;
beforeAll(async () => {
  const compiled = await build({
    entryPoints: ["test/fixtures/window-chrome-main.ts"],
    bundle: true,
    external: ["electron", "node-pty"],
    format: "cjs",
    platform: "node",
    write: false,
    plugins: [
      {
        name: "construction-call-ports",
        setup(builder) {
          builder.onResolve({ filter: /\/terminal-window$/ }, () => ({
            path: "fixture-window-options-port",
            external: true,
          }));
          builder.onResolve({ filter: /\/terminal-application$/ }, () => ({
            path: "fixture-application-port",
            external: true,
          }));
        },
      },
    ],
  });
  entry = compiled.outputFiles[0]!.text;
});
it.each([
  [{}, "Native constructor reached", 1],
  [{ resizable: false }, "Native Chrome must remain resizable", 0],
  [{ maximizable: false }, "Native Chrome must remain maximizable", 0],
] as const)(
  "wires the guard before actual fixture BrowserWindow construction: %j",
  async (change, message, expectedConstructors) => {
    const options = {
      ...terminalWindowOptions(
        "preload.cjs",
        DEFAULT_USER_CONFIGURATION,
        "linux",
      ),
      ...change,
    };
    const require = createRequire(import.meta.url);
    let constructors = 0,
      stderr = "";
    let completed: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      completed = resolve;
    });
    runInNewContext(entry, {
      __dirname: "/owned-construction-profile",
      module: { exports: {} },
      exports: {},
      Buffer,
      TextEncoder,
      TextDecoder,
      URL,
      console,
      setTimeout: () => ({ unref() {} }),
      process: {
        platform: "linux",
        env: {},
        argv: ["--fixture-native-maximize=native-maximize-not-observed"],
        on() {},
        once() {},
        stdout: { write() {} },
        stderr: {
          write(value: string) {
            stderr += value;
          },
        },
        exit() {
          completed!();
        },
      },
      require(id: string): unknown {
        if (id === "electron")
          return {
            app: {
              setPath() {},
              on() {},
              whenReady: async () => {},
              exit() {
                completed!();
              },
            },
            BrowserWindow: class {
              constructor() {
                constructors += 1;
                throw new Error("Native constructor reached");
              }
            },
            ipcMain: {
              on() {},
              removeListener() {},
              handle() {},
              removeHandler() {},
            },
          };
        if (id === "node-pty") return {};
        if (id === "node:fs")
          return { ...(require(id) as object), mkdirSync() {}, writeSync() {} };
        if (id === "fixture-window-options-port")
          return { terminalWindowOptions: () => options };
        if (id === "fixture-application-port")
          return {
            startTerminalApplication: (ports: {
              createWindow(lifecycle: object): unknown;
            }) => ports.createWindow({}),
          };
        return require(id) as unknown;
      },
    });
    await done;
    expect(stderr).toContain(message);
    expect(constructors).toBe(expectedConstructors);
  },
);
it("rejects a Windows transparent reference copied from Linux", () => {
  const options = terminalWindowOptions(
    "preload.cjs",
    DEFAULT_USER_CONFIGURATION,
    "win32",
  );
  expect(() =>
    assertNativeChromeConstruction({ ...options, transparent: true }, "win32"),
  ).toThrow();
});
