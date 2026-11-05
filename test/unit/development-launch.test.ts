import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function launch(platform: string, runtime: "cold" | "warm") {
  const { scripts } = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts: { dev: string } };
  const command = /^npm run build && node (\S+) \.$/u.exec(scripts.dev);
  if (!command?.[1]) throw new Error("Unrecognized development launch command");
  const launcher = new URL(`../../${command[1]}`, import.meta.url).href;
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-dev-launch-"));
  try {
    const driver = path.join(directory, "driver.mjs");
    // Observe the real Electron CLI's OS spawn boundary without opening a GUI.
    // Main-process appendSwitch cannot affect these bootstrap arguments.
    await writeFile(
      driver,
      `import Module, { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import path from "node:path";
const require = createRequire(${JSON.stringify(launcher)});
const index = require.resolve("electron");
// Keep the real CLI, but replace its executable-path index before any import.
// Use the same controlled executable as the other mocked fixture launchers.
const controlledIndex = new Module(index);
controlledIndex.exports = process.execPath;
controlledIndex.loaded = true;
require.cache[index] = controlledIndex;
const marker = path.join(path.dirname(index), "path.txt");
const runtimePath = path.relative(path.join(path.dirname(index), "dist"), process.execPath);
let available = ${runtime === "warm"};
let installerRequests = 0;
const fs = require("node:fs");
const exists = fs.existsSync;
const read = fs.readFileSync;
// Model both states if the index seam regresses, without touching a runtime.
fs.existsSync = (file) => file === marker ? available : exists(file);
fs.readFileSync = (file, ...options) => {
  if (file !== marker) return read(file, ...options);
  if (!available) throw new Error("Simulated runtime unavailable");
  return runtimePath;
};
Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
const childProcess = require("node:child_process");
childProcess.spawnSync = (file, args) => {
  if (file !== process.execPath || args.length !== 1 ||
      args[0] !== path.join(path.dirname(index), "install.js"))
    throw new Error("Unexpected synchronous process request");
  // Simulate completion only; an escaped index must never run the installer.
  installerRequests++;
  available = true;
  return { status: 0 };
};
childProcess.spawn = (executable, args) => {
  if (executable !== process.execPath) throw new Error("Uncontrolled CLI executable");
  console.log(JSON.stringify({ args, installerRequests }));
  const child = new EventEmitter();
  setImmediate(() => child.emit("close", 23, null));
  return child;
};
await import(${JSON.stringify(launcher)});
`,
    );
    return spawnSync(
      process.execPath,
      [
        driver,
        ".",
        "-e",
        "program with spaces",
        "--no-sandbox",
        'literal"quote',
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe.each(["cold", "warm"] as const)(
  "development launch (%s runtime)",
  (runtime) => {
    it.each(["darwin", "win32"])(
      "keeps %s sandbox behavior and Electron exit status unchanged",
      async (platform) => {
        const result = await launch(platform, runtime);
        expect(result.error).toBeUndefined();
        expect(result.stderr).toBe("");
        expect(result.status).toBe(23);
        expect(JSON.parse(result.stdout)).toEqual({
          args: [
            ".",
            "-e",
            "program with spaces",
            "--no-sandbox",
            'literal"quote',
          ],
          installerRequests: 0,
        });
      },
    );

    it("applies Linux sandbox policy before Electron bootstrap and preserves literal launch arguments", async () => {
      const result = await launch("linux", runtime);
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(23);
      expect(JSON.parse(result.stdout)).toEqual({
        args: [
          "--no-sandbox",
          ".",
          "-e",
          "program with spaces",
          "--no-sandbox",
          'literal"quote',
        ],
        installerRequests: 0,
      });
    });
  },
);
