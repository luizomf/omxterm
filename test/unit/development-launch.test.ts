import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function launch(platform: string) {
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
      `import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
require("node:child_process").spawn = (_executable, args) => {
  console.log(JSON.stringify(args));
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

describe("development launch", () => {
  it.each(["darwin", "win32"])(
    "keeps %s sandbox behavior and Electron exit status unchanged",
    async (platform) => {
      const result = await launch(platform);
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(23);
      expect(JSON.parse(result.stdout)).toEqual([
        ".",
        "-e",
        "program with spaces",
        "--no-sandbox",
        'literal"quote',
      ]);
    },
  );

  it("applies Linux sandbox policy before Electron bootstrap and preserves literal launch arguments", async () => {
    const result = await launch("linux");
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(23);
    expect(JSON.parse(result.stdout)).toEqual([
      "--no-sandbox",
      ".",
      "-e",
      "program with spaces",
      "--no-sandbox",
      'literal"quote',
    ]);
  });
});
