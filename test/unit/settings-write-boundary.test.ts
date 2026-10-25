import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { settingsMessageText } from "../../src/shared/settings-messages";
import { createSettingsService } from "../../src/main/settings-service";

const preparation = vi.hoisted(() => ({
  afterWrite: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("node:fs/promises", async (original) => {
  const files = await original<typeof import("node:fs/promises")>();
  return {
    ...files,
    writeFile: async (...args: Parameters<typeof files.writeFile>) => {
      await files.writeFile(...args);
      if (String(args[0]).endsWith(".tmp")) await preparation.afterWrite?.();
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  preparation.afterWrite = undefined;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup(initial?: string) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-boundary-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  await mkdir(path.dirname(file));
  if (initial !== undefined) await writeFile(file, initial, { mode: 0o600 });
  const reload = vi.fn(async () => ({ applied: true as const, notices: [] }));
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload,
  });
  return { file, service, reload };
}

it.each(["graphical", "raw"] as const)(
  "refuses a concurrent creation after %s temporary-file preparation",
  async (route) => {
    const { file, service, reload } = await setup();
    const external = '{"version":1,"logLevel":"error"}';
    preparation.afterWrite = () => writeFile(file, external);
    const result =
      route === "raw"
        ? await service.saveText('{"version":1,"font":{"size":18}}', "absent")
        : await service.change({ path: "font.size", value: 18 });
    expect(result).toMatchObject({
      status: "conflict",
      snapshot: { text: external },
    });
    expect(await readFile(file, "utf8")).toBe(external);
    expect(await readdir(path.dirname(file))).toEqual(["config.json"]);
    expect(reload).not.toHaveBeenCalled();
  },
);

it("preserves an external edit after the temporary file is written", async () => {
  const { file, service } = await setup('{"version":1}');
  preparation.afterWrite = () =>
    writeFile(file, '{"version":1,"logLevel":"debug"}');
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "conflict",
  });
  expect(await readFile(file, "utf8")).toBe('{"version":1,"logLevel":"debug"}');
  expect(await readdir(path.dirname(file))).toEqual(["config.json"]);
});

it("preserves a symlink introduced during preparation", async () => {
  const { file, service, reload } = await setup('{"version":1}');
  const target = path.join(path.dirname(file), "target.json");
  await writeFile(target, '{"version":1}');
  preparation.afterWrite = async () => {
    await rm(file);
    await symlink(target, file);
  };
  const result = await service.change({ path: "font.size", value: 18 });
  expect(result.status).toBe("failed");
  if (result.status !== "saved") {
    expect(result.message).toEqual({ kind: "symlink" });
    expect(settingsMessageText(result.message)).toMatch(/symlink/iu);
  }
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  expect(await readFile(target, "utf8")).toBe('{"version":1}');
  expect(await readdir(path.dirname(file))).toEqual([
    "config.json",
    "target.json",
  ]);
  expect(reload).not.toHaveBeenCalled();
});
