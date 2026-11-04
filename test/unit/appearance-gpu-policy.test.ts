import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/restty-appearance-rendering-build";

// Build and execute the real generated entrypoint; never launch Electron.
it("applies the shared GPU policy before appearance readiness only on Linux", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-appearance-policy-"));
  try {
    await buildFixture(root);
    const main = await readFile(path.join(root, "main.cjs"), "utf8");
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const switches: string[] = [];
      let reachedReadiness = false;
      runInNewContext(main, {
        __dirname: root,
        process: { platform, env: {} },
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
          if (name === "node:path") return path;
          throw new Error(`Unexpected dependency: ${name}`);
        },
      });
      expect(reachedReadiness, platform).toBe(true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
