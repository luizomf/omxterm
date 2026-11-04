import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";
import { buildFixture as rendering } from "../fixtures/restty-rendering-build";
import { buildFixture as ligatures } from "../fixtures/restty-ligatures-rendering-build";
import { buildFixture as scrollback } from "../fixtures/restty-scrollback-rendering-build";
import { buildFixture as background } from "../fixtures/restty-background-rendering-build";
import { buildFixture as cursor } from "../fixtures/restty-cursor-rendering-build";
import { buildHostFixture as host } from "../fixtures/restty-host-build";
import { buildFixture as acknowledgement } from "../fixtures/failure-acknowledgement-build";
import { buildFixture as fontReadReload } from "../fixtures/font-read-reload-build";
import { buildFixture as cancellation } from "../fixtures/initialization-cancellation-build";
import { buildFixture as pending } from "../fixtures/pending-tab-ownership-build";
import { buildFixture as titles } from "../fixtures/startup-tab-titles-build";
import { buildFixture as fonts } from "../fixtures/surface-font-ownership-build";
import { buildFixture as removal } from "../fixtures/tab-removal-build";

// Optional OS font discovery is not part of the startup-policy contract. Keep
// the real ligature recipe (including its fallback injection), without OS calls.
vi.mock("../../src/main/installed-font-family", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/main/installed-font-family")
  >()),
  installedFallbackFontData: async () => [],
}));

const requireBuiltin = createRequire(import.meta.url);
const recipes: {
  name: string;
  prepare(root: string): Promise<void>;
  sandboxPolicy?: boolean;
}[] = [
  { name: "rendering", prepare: rendering },
  { name: "ligatures", prepare: ligatures },
  { name: "scrollback", prepare: scrollback },
  {
    name: "scrollback-held-startup",
    prepare: (root) => scrollback(root, "scrollback", true),
  },
  {
    name: "native-scroll-feedback",
    prepare: (root) => scrollback(root, "native-scroll-feedback"),
  },
  {
    name: "native-scroll-feedback-ready-before-map",
    prepare: (root) =>
      scrollback(root, "native-scroll-feedback-ready-before-map"),
  },
  { name: "background", prepare: background },
  { name: "cursor", prepare: cursor, sandboxPolicy: true },
  {
    name: "font-styles",
    // Match the integration test's inline main build; do not import/run its
    // Electron-launching observe() recipe or invent another fixture builder.
    prepare: async (root) => {
      await build({
        entryPoints: ["test/fixtures/restty-font-styles-main.ts"],
        bundle: true,
        format: "cjs",
        platform: "node",
        external: ["electron"],
        outfile: path.join(root, "main.cjs"),
        logLevel: "silent",
      });
    },
    sandboxPolicy: true,
  },
  { name: "host", prepare: host },
  {
    name: "host-focused-cancellation",
    prepare: (root) => host(root, { focusedCancellation: true }),
  },
  { name: "failure-acknowledgement", prepare: acknowledgement },
  { name: "font-read-reload", prepare: fontReadReload },
  {
    name: "font-read-reload-old-post-read",
    prepare: (root) => fontReadReload(root, "recipe", "old-post-read"),
  },
  { name: "initialization-cancellation", prepare: cancellation },
  { name: "pending-tab", prepare: pending },
  { name: "startup-tab-titles", prepare: titles },
  { name: "surface-font-ownership", prepare: fonts },
  { name: "tab-removal", prepare: removal },
];

// Build the actual recipes, execute each emitted main only up to readiness, and
// keep all native ports inert. No Electron, browser, PTY or OS input is launched.
it.each(recipes)(
  "applies the shared GPU policy before $name readiness only on Linux",
  async ({ prepare, sandboxPolicy }) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-surface-policy-"));
    try {
      await prepare(root);
      const main = await readFile(path.join(root, "main.cjs"), "utf8");
      const requireFixture = createRequire(path.join(root, "main.cjs"));
      for (const platform of ["linux", "darwin", "win32"] as const) {
        const switches: string[] = [];
        const lateSwitches: string[] = [];
        const errors: unknown[] = [];
        let readiness: string[] | undefined;
        const forbidden = () => {
          throw new Error("Native work is forbidden in the startup check");
        };
        runInNewContext(
          main,
          {
            Buffer,
            TextEncoder,
            AbortController,
            __dirname: root,
            __filename: path.join(root, "main.cjs"),
            // Scenario timers are inert too: the real font-read scenario starts
            // its deadline before readiness, which stays deliberately pending.
            setTimeout: () => ({ unref() {} }),
            clearTimeout() {},
            console: { error: (...args: unknown[]) => errors.push(args) },
            process: {
              platform,
              arch: "x64",
              argv: ["electron", root, root, "regular", "fixture-font"],
              env: {},
              on() {},
              stdout: { write() {} },
              stderr: { write: (value: unknown) => errors.push(value) },
            },
            require: (name: string) => {
              if (isBuiltin(name) && !name.startsWith("node:"))
                name = `node:${name}`;
              if (name === "electron")
                return {
                  app: {
                    commandLine: {
                      appendSwitch: (value: string) => {
                        if (readiness) lateSwitches.push(value);
                        switches.push(value);
                      },
                    },
                    setPath() {},
                    on() {},
                    exit: (code: unknown) => errors.push(code),
                    whenReady: () => {
                      readiness = [...switches];
                      return new Promise(() => {});
                    },
                  },
                  ipcMain: { handle() {} },
                  BrowserWindow: class {
                    constructor() {
                      forbidden();
                    }
                  },
                };
              if (name === "node:fs")
                return { mkdirSync() {}, writeFileSync() {}, writeSync() {} };
              if (name === "node:fs/promises") return { mkdir: async () => {} };
              if (name === "node:child_process")
                return {
                  execFile: forbidden,
                  execFileSync: forbidden,
                  spawn: forbidden,
                };
              if (name === "node-pty") return { spawn: forbidden };
              if (name === "node:process") return { env: {} };
              if (name.startsWith("node:"))
                return requireBuiltin(name) as unknown;
              if (
                name === "./text-rendering-evidence.cjs" ||
                name === "./native-input.cjs"
              )
                return requireFixture(name) as unknown;
              throw new Error(`Unexpected dependency: ${name}`);
            },
          },
          { timeout: 1_000 },
        );
        // Let asynchronous profile setup and scenario wrappers reach readiness.
        await setImmediate();
        expect(errors, platform).toEqual([]);
        expect(readiness, platform).toBeDefined();
        expect(readiness, platform).toEqual(
          platform === "linux"
            ? [
                ...(sandboxPolicy ? ["no-sandbox"] : []),
                "enable-unsafe-swiftshader",
              ]
            : [],
        );
        expect(lateSwitches, platform).toEqual([]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
