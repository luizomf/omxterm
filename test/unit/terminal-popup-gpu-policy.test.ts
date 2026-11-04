import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";

const requireBuiltin = createRequire(import.meta.url);

// Execute the actual emitted popup main up to readiness, without Electron or PTYs.
it("applies the shared GPU policy before popup readiness only on Linux", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-popup-policy-"));
  try {
    await buildFixture(
      root,
      "recipe",
      "test/fixtures/terminal-popup-native-main.ts",
    );
    const main = await readFile(path.join(root, "main.cjs"), "utf8");
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const switches: string[] = [];
      let reachedReadiness = false;
      runInNewContext(main, {
        TextEncoder,
        __dirname: root,
        __filename: path.join(root, "main.cjs"),
        process: { platform, argv: [], env: {}, on() {} },
        require: (name: string) => {
          if (name === "electron")
            return {
              app: {
                commandLine: {
                  appendSwitch: (value: string) => {
                    expect(reachedReadiness).toBe(false);
                    switches.push(value);
                  },
                },
                setPath() {},
                on() {},
                whenReady: () => {
                  reachedReadiness = true;
                  expect(switches, platform).toEqual(
                    platform === "linux" ? ["enable-unsafe-swiftshader"] : [],
                  );
                  return new Promise(() => {});
                },
              },
              BrowserWindow: class {
                constructor() {
                  throw new Error("The startup check must not create a window");
                }
              },
            };
          if (name === "node:fs") return { mkdirSync() {} };
          if (name.startsWith("node:")) return requireBuiltin(name) as unknown;
          throw new Error(`Unexpected dependency: ${name}`);
        },
      });
      expect(reachedReadiness, platform).toBe(true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
