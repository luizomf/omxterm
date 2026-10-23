import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWithUserConfiguration } from "../../src/main/configured-startup";
import type { UserConfigurationLoad } from "../../src/main/user-configuration";
import { expectCompleteConfiguration } from "../fixtures/complete-configuration";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("configured startup", () => {
  it("hands the validated contract to startup and lists every setting in the file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-startup-"));
    roots.push(root);
    const xdg = path.join(root, "xdg");
    const options = {
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: path.join(root, "home"),
      getInstalledFontFamilyMetrics: vi.fn(async () => undefined),
    };
    const file = path.join(xdg, "omxterm", "config.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      '{\n  "version": 1, "confirmClose": false, "logLevel": "error", "window": { "alwaysOnTop": true }\n}\n',
    );
    const start = vi.fn((load: UserConfigurationLoad) => load);

    const result = await startWithUserConfiguration(options, start);

    expect(start).toHaveBeenCalledOnce();
    expect(result.fallback).toBeUndefined();
    expect(result.configuration).toMatchObject({
      confirmClose: false,
      logLevel: "error",
      alwaysOnTop: true,
      fontSize: 16,
      scrollbackLines: 10_000,
      optionKeyMode: "none",
    });
    expect(options.getInstalledFontFamilyMetrics).not.toHaveBeenCalled();
    const completed = await readFile(file, "utf8");
    const written: unknown = JSON.parse(completed);
    expect(written).toMatchObject({
      confirmClose: false,
      logLevel: "error",
      window: { alwaysOnTop: true, blur: false },
      scrollback: { lines: 10_000 },
    });
    expectCompleteConfiguration(written);

    // A complete file is left as it is; an invalid one is never rewritten.
    await startWithUserConfiguration(options, start);
    expect(await readFile(file, "utf8")).toBe(completed);
    await writeFile(file, '{"version": 2}');
    await startWithUserConfiguration(options, start);
    expect(await readFile(file, "utf8")).toBe('{"version": 2}');
  });
});
