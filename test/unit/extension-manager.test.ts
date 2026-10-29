import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages.js";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust.js";
import {
  createExtensionManager,
  type ManagedViews,
} from "../../src/main/extension-manager.js";
import type { Backend } from "../../src/extension-runtime/runtime.js";
import type { Value } from "../../src/extension-runtime/protocol.js";
import { packageArchive } from "../fixtures/extension-package-archive.js";
let root: string;
let packages: InstalledPackages;
const runtimeVersion = { appVersion: "0.23.0-dev.5", apiVersion: "0.1.0" };
const manifest = {
  format: 1,
  id: "example.files",
  name: "Files",
  version: "1.0.0",
  engines: { omxterm: ">=0.23.0-0", api: "0.1.x" },
  backend: "backend.mjs",
  view: { entry: "index.html", action: "example.files.open", title: "Files" },
};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-manager-"));
  packages = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime: runtimeVersion,
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  await packages.install(
    packageArchive([
      { name: "extension.json", data: JSON.stringify(manifest) },
      { name: "backend.mjs", data: "" },
      { name: "index.html", data: "" },
    ]),
    { expectedGeneration: 0, enabled: true },
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function setup() {
  const entry = (await packages.snapshot())[0]!;
  const call = vi.fn(async (value: Value) => value);
  const backendLifetime = new AbortController();
  const backend: Backend = {
    epoch: "backend-epoch",
    signal: backendLifetime.signal,
    state: () => "active",
    selection: {
      id: entry.id,
      generation: entry.generation,
      digest: entry.digest!,
    },
    call,
    retire: vi.fn<Backend["retire"]>(),
  };
  const runtime = {
    activate: vi.fn(async (_id: string): Promise<Backend> => backend),
    retire: vi.fn(async () => null),
    dispose: vi.fn(async () => []),
  };
  const views: Parameters<
    Parameters<typeof createExtensionManager>[0]["createViews"]
  >[0][] = [];
  const opens = vi.fn(async () => {});
  const createViews = vi.fn((input: (typeof views)[number]): ManagedViews => {
    views.push(input);
    return {
      open: opens,
      retire: async () => {
        await input.pin.release();
        input.retired();
        return { status: "settled" as const };
      },
    };
  });
  const manager = createExtensionManager({
    packages,
    runtime,
    createViews,
    trust: createExtensionPackageTrust({
      packages,
      runtime: runtimeVersion,
      temporaryDirectory: root,
    }),
  });
  return {
    manager,
    runtime,
    views,
    createViews,
    opens,
    call,
    backend,
    backendLifetime,
  };
}
it("leaves installed-unused dormant and gives each invocation its own captured target and view pin", async () => {
  const setupResult = await setup();
  const { manager, runtime, views, createViews, opens } = setupResult;
  expect((await manager.snapshot())[0]?.local).toBe("dormant");
  expect(runtime.activate).not.toHaveBeenCalled();
  const owner = {};
  const lifetime = new AbortController();
  const target = { owner, signal: lifetime.signal, terminalDirectory: root };
  const opening = manager.open(manifest.id, target);
  target.terminalDirectory = "/changed";
  await opening;
  expect(views[0]?.target.terminalDirectory).toBe(root);
  expect(views[0]?.pin.generation).toBe(1);
  await manager.open(manifest.id, target);
  expect(createViews).toHaveBeenCalledTimes(2);
  expect(views[1]?.target.terminalDirectory).toBe("/changed");
  expect(views[0]?.target.terminalDirectory).toBe(root);
  expect(opens).toHaveBeenCalledTimes(2);
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  expect(views).toHaveLength(3);
  expect(views[0]?.pin).not.toBe(views[1]?.pin);
  lifetime.abort();
  expect(runtime.retire).not.toHaveBeenCalled();
  expect(await manager.dispose()).toBe(true);
});
it.each(["cross-instance", "local", "source", "request", "backend"])(
  "separates store admission from local transfer: %s",
  async (change) => {
    const { manager, views, backend } = await setup();
    const source = new AbortController();
    const request = new AbortController();
    await manager.open(manifest.id, {
      owner: {},
      signal: source.signal,
      terminalDirectory: null,
    });
    const input = views[0]!;
    const revalidate = input.pin.revalidate.bind(input.pin);
    let release!: () => void;
    let admitted!: () => void;
    const entered = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(input.pin, "revalidate").mockImplementation(async () => {
      const accepted = await revalidate();
      admitted();
      await gate;
      return accepted;
    });
    const commit = vi.fn();
    const result = input.admit(request.signal, commit).then(
      () => "accepted",
      () => "refused",
    );
    await entered;
    if (change === "cross-instance")
      await packages.setEnabled(manifest.id, 1, false);
    if (change === "local") await manager.setEnabled(manifest.id, 1, false);
    if (change === "source") source.abort();
    if (change === "request") request.abort();
    if (change === "backend") backend.state = () => "failed";
    release();
    expect(await result).toBe(
      change === "cross-instance" ? "accepted" : "refused",
    );
    expect(commit).toHaveBeenCalledTimes(change === "cross-instance" ? 1 : 0);
    await manager.dispose();
  },
);

it("revokes view authority immediately on backend loss, without waiting for retirement", async () => {
  const { manager, views, createViews, backendLifetime } = await setup();
  let finish!: () => void;
  const settlement = new Promise<void>((resolve) => {
    finish = resolve;
  });
  createViews.mockImplementation((input) => {
    views.push(input);
    return {
      open: async () => {},
      retire: async () => {
        await settlement;
        await input.pin.release();
        input.retired();
        return { status: "settled" };
      },
    };
  });
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  backendLifetime.abort();
  expect(views[0]!.signal.aborted).toBe(true);
  await expect(
    views[0]!.admit(new AbortController().signal, () => {
      throw new Error("must not commit");
    }),
  ).rejects.toThrow("unavailable");
  finish();
  expect(await manager.dispose()).toBe(true);
});

it("disable revokes calls and independently retires all local views and the backend", async () => {
  const { manager, views, runtime, call } = await setup();
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  expect(
    await views[0]!.call({ operation: "home" }, new AbortController().signal),
  ).toEqual({ operation: "home" });
  await manager.setEnabled(manifest.id, 1, false);
  await expect(
    views[0]!.call(null, new AbortController().signal),
  ).rejects.toThrow("unavailable");
  expect(call).toHaveBeenCalledTimes(1);
  expect(runtime.retire).toHaveBeenCalledWith(manifest.id);
  expect((await manager.snapshot())[0]).toMatchObject({
    enabled: false,
    generation: 2,
    local: "dormant",
    otherInstances: "unknown",
  });
});
it("replaces captured packages and re-enables dormantly without reviving old view authority", async () => {
  const { manager, runtime, views, call, backend } = await setup();
  const target = {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: root,
  };
  await manager.open(manifest.id, target);
  const old = views[0]!;
  const issued = manager.action({
    id: old.pin.id,
    generation: old.pin.generation,
    digest: old.pin.digest,
  });
  const archive = path.join(root, "replacement.omxext");
  await writeFile(
    archive,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify({ ...manifest, version: "1.1.0" }),
      },
      { name: "backend.mjs", data: "// replacement" },
      { name: "index.html", data: "<h1>replacement</h1>" },
    ]),
  );
  const approval = await manager.prepare(target.owner, archive);
  await manager.approve(target.owner, approval.token);
  await expect(issued(target)).rejects.toThrow("unavailable");
  expect(runtime.retire).toHaveBeenCalledWith(manifest.id);
  expect(runtime.activate).toHaveBeenCalledTimes(1);
  await expect(old.call(null, new AbortController().signal)).rejects.toThrow(
    "unavailable",
  );
  expect(call).not.toHaveBeenCalled();
  await manager.setEnabled(manifest.id, 2, false);
  await manager.setEnabled(manifest.id, 3, true);
  expect((await manager.snapshot())[0]).toMatchObject({
    generation: 4,
    enabled: true,
    local: "dormant",
  });
  expect(runtime.activate).toHaveBeenCalledTimes(1);
  const current = (await packages.snapshot())[0]!;
  runtime.activate.mockResolvedValue({
    ...backend,
    selection: {
      id: current.id,
      generation: current.generation,
      digest: current.digest!,
    },
  });
  await manager.open(manifest.id, target);
  expect(views[1]!.pin.generation).toBe(4);
  expect(views[1]!.pin.digest).not.toBe(old.pin.digest);
  await expect(old.call(null, new AbortController().signal)).rejects.toThrow(
    "unavailable",
  );
  expect(await manager.dispose()).toBe(true);
});

it("a management change during held activation cannot create a late orphan view", async () => {
  const { manager, runtime, createViews } = await setup();
  const backend = await runtime.activate(manifest.id);
  let release!: (value: Backend) => void;
  runtime.activate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  const rejected = expect(pending).rejects.toThrow("unavailable");
  const disable = manager.setEnabled(manifest.id, 1, false);
  release(backend);
  await rejected;
  await disable;
  expect(createViews).not.toHaveBeenCalled();
});
it("reports actual backend lifecycle without poisoning it on request-local refusal", async () => {
  const { manager, views, call, backend } = await setup();
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  call.mockRejectedValueOnce(new Error("busy"));
  await expect(
    views[0]!.call(null, new AbortController().signal),
  ).rejects.toThrow("busy");
  expect((await manager.snapshot())[0]?.local).toBe("active");
  await views[0]!.call(null, new AbortController().signal);
  expect((await manager.snapshot())[0]?.local).toBe("active");
  vi.spyOn(backend, "state").mockReturnValue("failed");
  expect((await manager.snapshot())[0]?.local).toBe("failed");
  await manager.dispose();
});
it("retains cleanup uncertainty when a later view opens successfully", async () => {
  const { manager, createViews } = await setup();
  const owner = new AbortController();
  createViews.mockImplementationOnce(() => ({
    open: async () => {},
    retire: async () => ({ status: "failed" }),
  }));
  await manager.open(manifest.id, {
    owner: {},
    signal: owner.signal,
    terminalDirectory: null,
  });
  owner.abort();
  await vi.waitFor(async () =>
    expect((await manager.snapshot())[0]?.local).toBe("unknown"),
  );
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  expect((await manager.snapshot())[0]?.local).toBe("unknown");
  expect(await manager.dispose()).toBe(false);
});
it("Quit latches admission and joins actual owners instead of treating disposal as stop proof", async () => {
  const { manager, createViews, runtime } = await setup();
  createViews.mockImplementationOnce(() => ({
    open: async () => {},
    retire: async () => ({ status: "failed" }),
  }));
  await manager.open(manifest.id, {
    owner: {},
    signal: new AbortController().signal,
    terminalDirectory: null,
  });
  const quit = manager.dispose();
  expect(manager.dispose()).toBe(quit);
  expect(await quit).toBe(false);
  await expect(
    manager.open(manifest.id, {
      owner: {},
      signal: new AbortController().signal,
      terminalDirectory: null,
    }),
  ).rejects.toThrow("unavailable");
  expect(runtime.dispose).toHaveBeenCalledTimes(1);
});
