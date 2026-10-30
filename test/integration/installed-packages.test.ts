import { execFile, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  InstalledPackages,
  createNativeLeaseAdapter,
  type LeaseAdapter,
} from "../../src/installed-packages/installed-packages.js";
import { packageArchive } from "../fixtures/extension-package-archive.js";

const execute = promisify(execFile);
const runtime = { appVersion: "0.23.0-dev.1", apiVersion: "0.1.0" };
const manifest = {
  format: 1,
  id: "test.files",
  version: "1.0.0",
  name: "Test files",
  engines: { omxterm: ">=0.23.0-0 <0.24.0", api: "0.1.x" },
  backend: "backend/index.mjs",
};
let build: string;
let root: string;
let adapter: LeaseAdapter;
let store: InstalledPackages;
const native = path.resolve("scripts/build-installed-packages.mjs");

beforeAll(async () => {
  // Native headless integration; no Electron GUI. The build is isolated from
  // application output and reused by the tests, not compiled once per case.
  await mkdir(".scratch", { recursive: true });
  build = await mkdtemp(path.resolve(".scratch/installed-packages-build-"));
  await execute(process.execPath, [native, build], { timeout: 90_000 });
  adapter = createNativeLeaseAdapter(path.join(build, "extension-leases.node"));
}, 100_000);
afterAll(async () => {
  // Windows maps the addon until this worker exits. The outer qualification
  // owner removes its scratch build only after observing actual process exit.
  if (build && process.platform !== "win32")
    await rm(build, { recursive: true, force: true });
});
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "installed-packages-"));
  store = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime,
    leases: adapter,
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function archive(
  options: {
    version?: string;
    id?: string;
    extra?: Parameters<typeof packageArchive>[0];
    manifest?: unknown;
  } = {},
): Promise<string> {
  const file = path.join(root, `${randomUUID()}.omxext`);
  await writeFile(
    file,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify(
          options.manifest ?? {
            ...manifest,
            version: options.version ?? "1.0.0",
            id: options.id ?? manifest.id,
          },
        ),
      },
      // If installation executes this entrypoint it fails, rather than faking an activation.
      {
        name: "backend/index.mjs",
        data: "throw new Error('installation must not execute code');",
        compressed: true,
      },
      ...(options.extra ?? []),
    ]),
  );
  return file;
}

async function actor(mode: string, file = "") {
  const child = fork(
    path.resolve("test/fixtures/installed-packages-process.mjs"),
    [path.join(build, "index.mjs"), path.join(root, "store"), mode, file],
    { stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [] },
  );
  child.stdout?.resume();
  child.stderr?.resume();
  const closed = new Promise<{ code: number | null; signal: string | null }>(
    (resolve) =>
      child.once("close", (code, signal) => resolve({ code, signal })),
  );
  try {
    const ready = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("owned actor readiness timeout")),
        10_000,
      );
      const finish = (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      };
      child.once("message", finish);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("actor exited before readiness"));
      });
    });
    return {
      ready,
      stop: async () => {
        child.kill("SIGKILL");
        return closed;
      },
      child,
      closed,
    };
  } catch (error) {
    child.kill("SIGKILL");
    await closed;
    throw error;
  }
}

describe("Installed Packages production interface", () => {
  it("installs real archives without execution, preserves pins through update/tombstone and collects only eligible versions", async () => {
    const first = await store.install(await archive(), {
      expectedGeneration: 0,
      enabled: true,
    });
    const use = await store.openVersion(first.id);
    try {
      expect(
        await readFile(path.join(use.directory, "backend/index.mjs"), "utf8"),
      ).toContain("must not execute");
      const independent = await store.openVersion(first.id, use);
      const second = await store.install(await archive({ version: "2.0.0" }), {
        expectedGeneration: 1,
        enabled: true,
      });
      expect(second.digest).not.toBe(first.digest);
      expect(await use.revalidate()).toBe(false);
      expect((await store.collect()).pending).toContain(first.digest);
      await independent.release();
      expect((await store.collect()).pending).toContain(first.digest);
      await use.release();
      expect((await store.collect()).removed).toContain(first.digest);
      const disabled = await store.setEnabled(first.id, 2, false);
      expect(disabled.generation).toBe(3);
      await expect(store.openVersion(first.id)).rejects.toMatchObject({
        code: "unavailable",
      });
      expect((await store.collect()).removed).toEqual([]);
      expect((await store.uninstall(first.id, 3)).digest).toBeNull();
      expect((await store.collect()).removed).toContain(second.digest);
      expect((await store.snapshot())[0]?.generation).toBe(4);
    } finally {
      await use.release();
    }
  });

  it("re-reads aggregate state, rejects stale work and same-byte reinstall permits across independent stores/root aliases", async () => {
    const alias = path.join(root, "alias");
    await symlink(
      path.join(root, "store"),
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    const other = await InstalledPackages.open({
      root: alias,
      runtime,
      leases: adapter,
    });
    const file = await archive();
    const first = await store.install(file, {
      expectedGeneration: 0,
      enabled: true,
    });
    const pin = await store.openVersion(first.id);
    try {
      await other.install(await archive({ id: "test.other" }), {
        expectedGeneration: 0,
        enabled: false,
      });
      await other.uninstall(first.id, 1);
      const reinstalled = await other.install(file, {
        expectedGeneration: 2,
        enabled: true,
      });
      expect(reinstalled.digest).toBe(first.digest);
      expect(reinstalled.generation).toBe(3);
      expect(await pin.revalidate()).toBe(false);
      await expect(store.openVersion(first.id, pin)).rejects.toMatchObject({
        code: "unavailable",
      });
      await expect(
        store.install(file, { expectedGeneration: 1, enabled: true }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect((await store.snapshot()).map((entry) => entry.id).sort()).toEqual([
        "test.files",
        "test.other",
      ]);
      expect(await readdir(path.join(root, "store/staging"))).toEqual([]);
    } finally {
      await pin.release();
    }
  });

  it("reports writer contention without mutation and releases independent use handles idempotently", async () => {
    const lock = await adapter.tryAcquire(
      path.join(root, "store/locks/writer.lock"),
      true,
    );
    expect(lock).not.toBeNull();
    try {
      await expect(
        store.install(await archive(), {
          expectedGeneration: 0,
          enabled: true,
        }),
      ).rejects.toMatchObject({ code: "busy" });
    } finally {
      await lock?.release();
    }
    expect(await store.snapshot()).toEqual([]);
    const entry = await store.install(await archive(), {
      expectedGeneration: 0,
      enabled: true,
    });
    const use = await store.openVersion(entry.id);
    await Promise.all([use.release(), use.release()]);
    expect(await use.revalidate()).toBe(false);
  });

  it.each(["snapshot", "revalidate", "openVersion"] as const)(
    "allows concurrent %s admission while excluding registry mutation",
    async (operation) => {
      const entry = await store.install(await archive(), {
        expectedGeneration: 0,
        enabled: true,
      });
      let hold = false;
      let acquired!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      let resume!: () => void;
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const controlled = await InstalledPackages.open({
        root: path.join(root, "store"),
        runtime,
        leases: {
          async tryAcquire(file, exclusive) {
            const lease = await adapter.tryAcquire(file, exclusive);
            if (lease && hold && file.endsWith("writer.lock")) {
              hold = false;
              acquired();
              await resumed;
            }
            return lease;
          },
        },
      });
      const reader = await controlled.openVersion(entry.id);
      const independent = await store.openVersion(entry.id);
      let opened: typeof reader | undefined;
      hold = true;
      const reading = reader.revalidate();
      try {
        await Promise.race([
          held,
          reading.then(() => {
            throw new Error("Reader did not reach held lease");
          }),
        ]);
        if (operation === "snapshot")
          expect((await store.snapshot())[0]?.generation).toBe(1);
        else if (operation === "revalidate")
          expect(await independent.revalidate()).toBe(true);
        else {
          opened = await store.openVersion(entry.id, independent);
          expect(opened.digest).toBe(entry.digest);
        }
        await expect(
          store.setEnabled(entry.id, 1, false),
        ).rejects.toMatchObject({ code: "busy" });
        await expect(store.collect()).rejects.toMatchObject({ code: "busy" });
      } finally {
        resume();
        await reading;
        await Promise.all([
          reader.release(),
          independent.release(),
          opened?.release(),
        ]);
      }
      expect((await store.snapshot())[0]?.generation).toBe(1);
      await store.setEnabled(entry.id, 1, false);
      expect(await independent.revalidate()).toBe(false);
    },
  );

  it("refuses read admissions during an exclusive registry transaction without retry", async () => {
    const entry = await store.install(await archive(), {
      expectedGeneration: 0,
      enabled: true,
    });
    const pin = await store.openVersion(entry.id);
    const writer = await adapter.tryAcquire(
      path.join(root, "store/locks/writer.lock"),
      true,
    );
    expect(writer).not.toBeNull();
    try {
      await expect(store.snapshot()).rejects.toMatchObject({ code: "busy" });
      await expect(pin.revalidate()).rejects.toMatchObject({ code: "busy" });
      await expect(store.openVersion(entry.id)).rejects.toMatchObject({
        code: "busy",
      });
    } finally {
      await writer?.release();
      await pin.release();
    }
    expect((await store.snapshot())[0]?.generation).toBe(1);
  });

  it("keeps referenced bytes and registry untouched after invalid/incompatible/stale archive failures", async () => {
    const installed = await store.install(await archive(), {
      expectedGeneration: 0,
      enabled: true,
    });
    const before = await readFile(path.join(root, "store/registry.json"));
    const bad = await archive({
      manifest: {
        ...manifest,
        engines: { ...manifest.engines, api: ">=2.0.0" },
      },
    });
    await expect(
      store.install(bad, { expectedGeneration: 1, enabled: true }),
    ).rejects.toMatchObject({ code: "incompatible" });
    expect(await readFile(path.join(root, "store/registry.json"))).toEqual(
      before,
    );
    expect(await readdir(path.join(root, "store/versions"))).toEqual([
      installed.digest,
    ]);
  });

  it.each([
    { name: "../escape" },
    { name: "/absolute" },
    { name: "C:/drive" },
    { name: "a\\b" },
    { name: "nul.txt" },
    { name: "trailing." },
    { name: "backend/INDEX.mjs" },
    { name: "BACKEND/other.mjs" },
    { name: "backend" },
    { name: "backend/index.mjs" },
    { name: "link", mode: 0o120777, data: "../outside" },
    { name: "fifo", mode: 0o010600 },
    { name: ".omxterm-install.json", data: "{}" },
    { name: "bad-crc", data: "hello", crc: 1 },
    {
      name: "bomb",
      data: "small",
      compressed: true,
      declaredSize: 300 * 1024 * 1024,
    },
  ])(
    "rejects unsafe archive entry $name without publication or escaped output",
    async (extra) => {
      await expect(
        store.install(await archive({ extra: [extra] }), {
          expectedGeneration: 0,
          enabled: false,
        }),
      ).rejects.toMatchObject({ code: "invalid-package" });
      expect(await store.snapshot()).toEqual([]);
      expect(await readdir(path.join(root, "store/staging"))).toEqual([]);
      expect(await readdir(path.join(root, "store/versions"))).toEqual([]);
    },
  );

  it("rejects corrupt registry/managed symlinks rather than resetting metadata or deleting external data", async () => {
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep"), "untouched");
    await rm(path.join(root, "store/staging"), { recursive: true });
    await symlink(
      outside,
      path.join(root, "store/staging"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(store.collect()).rejects.toMatchObject({
      code: "invalid-store",
    });
    expect(await readFile(path.join(outside, "keep"), "utf8")).toBe(
      "untouched",
    );
    await rm(path.join(root, "store/staging"));
    await mkdir(path.join(root, "store/staging"));
    await writeFile(path.join(root, "store/registry.json"), "{broken");
    await expect(store.snapshot()).rejects.toMatchObject({
      code: "invalid-store",
    });
    await expect(store.collect()).rejects.toMatchObject({
      code: "invalid-store",
    });
  });

  it("skips live staging and resumes garbage cleanup without touching a republished digest", async () => {
    const stageId = randomUUID();
    const stagePin = await adapter.tryAcquire(
      path.join(root, `store/locks/stage-${stageId}.lock`),
      false,
    );
    await mkdir(path.join(root, "store/staging", stageId));
    try {
      expect((await store.collect()).pending).toContain(stageId);
    } finally {
      await stagePin?.release();
    }
    expect((await store.collect()).removed).toContain(stageId);
    const file = await archive();
    const first = await store.install(file, {
      expectedGeneration: 0,
      enabled: true,
    });
    await store.uninstall(first.id, 1);
    // Model only the crashed deletion cut: real rename of a complete unreferenced
    // version into the store's documented garbage namespace, with no live readers.
    const garbage = `${first.digest}-${randomUUID()}`;
    await rename(
      path.join(root, "store/versions", first.digest!),
      path.join(root, "store/garbage", garbage),
    );
    const again = await store.install(file, {
      expectedGeneration: 2,
      enabled: true,
    });
    expect((await store.collect()).removed).toContain(first.digest);
    const use = await store.openVersion(again.id);
    try {
      expect(
        await readFile(path.join(use.directory, "extension.json"), "utf8"),
      ).toContain("Test files");
    } finally {
      await use.release();
    }
  });

  it("retains independently pinned bytes in another process until actual exit without blocking unrelated management", async () => {
    const first = await store.install(await archive(), {
      expectedGeneration: 0,
      enabled: true,
    });
    const holder = await actor("pin");
    try {
      expect(holder.ready).toEqual({ kind: "pinned", digest: first.digest });
      await store.uninstall(first.id, 1);
      await store.install(await archive({ id: "test.other" }), {
        expectedGeneration: 0,
        enabled: true,
      });
      expect((await store.collect()).pending).toContain(first.digest);
    } finally {
      await holder.stop();
    }
    expect((await store.collect()).removed).toContain(first.digest);
  });

  it.each(["before-publication", "after-publication"])(
    "recovers complete registry after real process death at %s, without mutation replay",
    async (mode) => {
      const first = await store.install(await archive(), {
        expectedGeneration: 0,
        enabled: true,
      });
      const update = await archive({ version: "2.0.0" });
      const writer = await actor(mode, update);
      try {
        expect(writer.ready).toBe("boundary");
      } finally {
        await writer.stop();
      }
      const fresh = await InstalledPackages.open({
        root: path.join(root, "store"),
        runtime,
        leases: adapter,
      });
      const entry = (await fresh.snapshot())[0]!;
      expect(entry.generation).toBe(mode === "before-publication" ? 1 : 2);
      expect(entry.manifest?.version).toBe(
        mode === "before-publication" ? "1.0.0" : "2.0.0",
      );
      if (mode === "before-publication")
        expect(entry.digest).toBe(first.digest);
      await fresh.collect();
      const use = await fresh.openVersion(entry.id);
      try {
        expect(await use.revalidate()).toBe(true);
      } finally {
        await use.release();
      }
    },
  );

  it("executes native lifetime regressions through the actual adapter in a fresh owned process", async () => {
    const { stdout } = await execute(
      process.execPath,
      [
        "--expose-gc",
        path.resolve("test/fixtures/extension-leases-check.mjs"),
        path.join(build, "index.mjs"),
        path.join(build, "extension-leases.node"),
      ],
      {
        env: { ...process.env, UV_THREADPOOL_SIZE: "1" },
        timeout: 60_000,
      },
    );
    expect(stdout.match(/^PASS /gm)).toHaveLength(12);
  }, 65_000);
});
