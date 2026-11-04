import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";

const preparation = vi.hoisted(() => ({
  afterWrite: undefined as ((temporary: string) => Promise<void>) | undefined,
  afterChmod: undefined as (() => Promise<void>) | undefined,
  failCleanup: false,
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomBytes: () => Buffer.from("010203040506", "hex"),
}));
vi.mock("node:fs/promises", async (original) => {
  const files = await original<typeof import("node:fs/promises")>();
  return {
    ...files,
    open: async (...args: Parameters<typeof files.open>) => {
      const handle = await files.open(...args);
      if (String(args[0]).endsWith(".tmp")) {
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (data, options) => {
          await write(data, options);
          await preparation.afterWrite?.(String(args[0]));
        };
        const chmod = handle.chmod.bind(handle);
        handle.chmod = async (mode) => {
          await chmod(mode);
          await preparation.afterChmod?.();
        };
      }
      return handle;
    },
    rm: async (...args: Parameters<typeof files.rm>) => {
      if (preparation.failCleanup && String(args[0]).endsWith(".tmp"))
        throw Object.assign(new Error("cleanup denied"), { code: "EACCES" });
      return files.rm(...args);
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  preparation.afterWrite = undefined;
  preparation.afterChmod = undefined;
  preparation.failCleanup = false;
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
  return { root, file, service, reload };
}

it.each(["graphical", "raw"] as const)(
  "refuses a concurrent creation after %s temporary-file preparation",
  async (route) => {
    const { file, service, reload } = await setup();
    const external = '{"version":1,"logLevel":"error"}';
    const revision = (await service.snapshot()).revision;
    preparation.afterWrite = () => writeFile(file, external);
    const result =
      route === "raw"
        ? await service.saveText('{"version":1,"font":{"size":18}}', revision)
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
  expect(result).toMatchObject({
    status: "conflict",
    message: { kind: "conflict" },
  });
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  expect(await readFile(target, "utf8")).toBe('{"version":1}');
  expect(await readdir(path.dirname(file))).toEqual([
    "config.json",
    "target.json",
  ]);
  expect(reload).not.toHaveBeenCalled();
});

it.each(["graphical", "raw"] as const)(
  "rejects identical-byte link retargeting during %s preparation",
  async (route) => {
    const { root, file, service, reload } = await setup();
    const first = path.join(root, "first.json");
    const second = path.join(root, "second.json");
    await writeFile(first, '{"version":1}');
    await writeFile(second, '{"version":1}');
    await symlink("../first.json", file);
    const opened = await service.snapshot();
    preparation.afterWrite = async () => {
      await rm(file);
      await symlink("../second.json", file);
    };
    const result =
      route === "raw"
        ? await service.saveText(
            '{"version":1,"font":{"size":18}}',
            opened.revision,
          )
        : await service.change({ path: "font.size", value: 18 });
    expect(result).toMatchObject({
      status: "conflict",
      snapshot: { text: '{"version":1}' },
    });
    expect(await readFile(first, "utf8")).toBe('{"version":1}');
    expect(await readFile(second, "utf8")).toBe('{"version":1}');
    expect(path.normalize(await readlink(file))).toBe(
      path.normalize("../second.json"),
    );
    expect(await readdir(root)).toEqual([
      "first.json",
      "omxterm",
      "second.json",
    ]);
    expect(reload).not.toHaveBeenCalled();
  },
);

it("refuses a retarget after temporary permissions are applied", async () => {
  const { root, file, service, reload } = await setup();
  const first = path.join(root, "first.json");
  const second = path.join(root, "second.json");
  await writeFile(first, '{"version":1}');
  await writeFile(second, '{"version":1}');
  await symlink("../first.json", file);
  preparation.afterChmod = async () => {
    await rm(file);
    await symlink("../second.json", file);
  };
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "conflict",
  });
  expect(await readFile(first, "utf8")).toBe('{"version":1}');
  expect(await readFile(second, "utf8")).toBe('{"version":1}');
  expect(reload).not.toHaveBeenCalled();
});

it("refuses a linked target edited during preparation", async () => {
  const { root, file, service, reload } = await setup();
  const target = path.join(root, "target.json");
  await writeFile(target, '{"version":1}');
  await symlink("../target.json", file);
  preparation.afterWrite = () =>
    writeFile(target, '{"version":1,"logLevel":"debug"}');
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "conflict",
  });
  expect(await readFile(target, "utf8")).toBe(
    '{"version":1,"logLevel":"debug"}',
  );
  expect(path.normalize(await readlink(file))).toBe(
    path.normalize("../target.json"),
  );
  expect(await readdir(root)).toEqual(["omxterm", "target.json"]);
  expect(reload).not.toHaveBeenCalled();
});

it("refuses a changed linked parent during preparation", async () => {
  const { root, file, service, reload } = await setup();
  await rm(path.dirname(file), { recursive: true });
  await mkdir(path.join(root, "first"));
  await mkdir(path.join(root, "second"));
  await writeFile(path.join(root, "first", "config.json"), '{"version":1}');
  await writeFile(path.join(root, "second", "config.json"), '{"version":1}');
  await symlink("first", path.dirname(file), "dir");
  preparation.afterWrite = async () => {
    await rm(path.dirname(file));
    await symlink("second", path.dirname(file), "dir");
  };
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "conflict",
  });
  expect(await readFile(path.join(root, "first", "config.json"), "utf8")).toBe(
    '{"version":1}',
  );
  expect(await readFile(path.join(root, "second", "config.json"), "utf8")).toBe(
    '{"version":1}',
  );
  expect(await readdir(path.join(root, "first"))).toEqual(["config.json"]);
  expect(await readdir(path.join(root, "second"))).toEqual(["config.json"]);
  expect(reload).not.toHaveBeenCalled();
});

it.skipIf(process.platform === "win32")(
  "refuses a substituted temporary link without chmod or publication",
  async () => {
    const { root, file, service, reload } = await setup('{"version":1}');
    const victim = path.join(root, "unrelated.json");
    await writeFile(victim, "unrelated");
    const { chmod, stat } = await import("node:fs/promises");
    await chmod(file, 0o644);
    await chmod(victim, 0o600);
    let temporary = "";
    preparation.afterWrite = async (name) => {
      temporary = name;
      await rm(name);
      await symlink(victim, name);
    };
    const result = await service.change({ path: "font.size", value: 18 });
    expect(result.status).not.toBe("saved");
    expect(await readFile(file, "utf8")).toBe('{"version":1}');
    expect(await readFile(victim, "utf8")).toBe("unrelated");
    expect((await stat(victim)).mode & 0o777).toBe(0o600);
    expect((await lstat(temporary)).isSymbolicLink()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  },
);

it.skipIf(process.platform === "win32")(
  "keeps prepared bytes private until the target permissions are applied",
  async () => {
    const { file, service } = await setup('{"version":1}');
    const { chmod, stat } = await import("node:fs/promises");
    await chmod(file, 0o600);
    let preparedMode = 0;
    const previous = process.umask(0o022);
    try {
      preparation.afterWrite = async (name) => {
        preparedMode = (await stat(name)).mode & 0o777;
      };
      expect(
        await service.change({ path: "font.size", value: 18 }),
      ).toMatchObject({ status: "saved" });
    } finally {
      process.umask(previous);
    }
    expect(preparedMode).toBe(0o600);
  },
);

it.skipIf(process.platform === "win32")(
  "detects target permission changes during preparation",
  async () => {
    const { file, service, reload } = await setup('{"version":1}');
    const { chmod, stat } = await import("node:fs/promises");
    await chmod(file, 0o644);
    preparation.afterWrite = () => chmod(file, 0o600);
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "conflict" });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toBe('{"version":1}');
    expect(reload).not.toHaveBeenCalled();
  },
);

it.skipIf(process.platform === "win32")(
  "detects target permission changes during async validation",
  async () => {
    const { root, file, reload } = await setup('{"version":1}');
    const { chmod, stat } = await import("node:fs/promises");
    await chmod(file, 0o644);
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        getInstalledFontFamilyMetrics: async () => {
          await chmod(file, 0o600);
          return { cellWidth: 8, cellHeight: 16 } as never;
        },
      },
      reload,
    });
    expect(
      await service.change({ path: "font.family", value: "Fixture Mono" }),
    ).toMatchObject({ status: "conflict" });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toBe('{"version":1}');
    expect(reload).not.toHaveBeenCalled();
  },
);

it("reports cleanup failures and leaves the original configuration intact", async () => {
  const { file, service, reload } = await setup('{"version":1}');
  let temporary = "";
  preparation.afterWrite = async (name) => {
    temporary = name;
    preparation.failCleanup = true;
    throw Object.assign(new Error("write failed"), { code: "EACCES" });
  };
  const result = await service.change({ path: "font.size", value: 18 });
  expect(result).toMatchObject({
    status: "failed",
    message: { kind: "cleanup" },
  });
  expect(await readFile(file, "utf8")).toBe('{"version":1}');
  expect(await readFile(temporary, "utf8")).toContain('"size": 18');
  expect(reload).not.toHaveBeenCalled();
});

it("does not remove an existing temporary-name collision", async () => {
  const { file, service, reload } = await setup('{"version":1}');
  const collision = path.join(
    path.dirname(file),
    ".omxterm-settings-010203040506.tmp",
  );
  await writeFile(collision, "external file");
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "failed",
    message: { kind: "write" },
  });
  expect(await readFile(collision, "utf8")).toBe("external file");
  expect(await readFile(file, "utf8")).toBe('{"version":1}');
  expect(reload).not.toHaveBeenCalled();
});

it("reports a temporary-file permission failure without changing the linked target", async () => {
  const { root, file, service, reload } = await setup();
  const target = path.join(root, "target.json");
  await writeFile(target, '{"version":1}');
  await symlink("../target.json", file);
  preparation.afterWrite = async () => {
    throw Object.assign(new Error("private target"), { code: "EACCES" });
  };
  const result = await service.change({ path: "font.size", value: 18 });
  expect(result).toMatchObject({
    status: "failed",
    message: { kind: "write" },
  });
  expect(JSON.stringify(result)).not.toContain("private target");
  expect(await readFile(target, "utf8")).toBe('{"version":1}');
  expect(path.normalize(await readlink(file))).toBe(
    path.normalize("../target.json"),
  );
  expect(await readdir(root)).toEqual(["omxterm", "target.json"]);
  expect(reload).not.toHaveBeenCalled();
});
