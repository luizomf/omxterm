import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import type { Backend } from "../../src/extension-runtime/runtime";
import { createExtensionManager } from "../../src/main/extension-manager";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust";
import { createExtensionLinkInstaller } from "../../src/main/extension-link-install";
import { installExtensionFromDialog } from "../../src/main/extension-install-dialog";
import { translatorFor } from "../../src/shared/i18n";
import { packageArchive } from "../fixtures/extension-package-archive";

const adapters = vi.hoisted(() => ({
  picker: vi.fn(),
  consent: vi.fn(),
  download: vi.fn<(url: string, signal: AbortSignal) => Promise<Buffer>>(),
}));
vi.mock("electron", () => ({
  dialog: { showOpenDialog: adapters.picker, showMessageBox: adapters.consent },
}));
vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: adapters.download,
}));
const runtimeVersion = { appVersion: "0.23.0-dev.9", apiVersion: "0.1.0" };
const id = "example.files";
const bytes = packageArchive([
  {
    name: "extension.json",
    data: JSON.stringify({
      format: 1,
      id,
      name: "Files",
      version: "1.0.0",
      engines: { omxterm: ">=0.23.0-0", api: "0.1.x" },
      backend: "backend.mjs",
      view: {
        entry: "index.html",
        action: "example.files.open",
        title: "Files",
      },
    }),
  },
  { name: "backend.mjs", data: "" },
  { name: "index.html", data: "" },
]);
let root: string;
let window: BrowserWindow;
let owner: EventEmitter;
let manager: ReturnType<typeof createExtensionManager>;
let links: ReturnType<typeof createExtensionLinkInstaller>;
const views: Parameters<
  Parameters<typeof createExtensionManager>[0]["createViews"]
>[0][] = [];
const translator = () => translatorFor("en-US");
const installLink = () =>
  links.install(window, manager, {
    operation: "install-link",
    url: "https://example.org/a",
    token: "11111111-1111-1111-1111-111111111111",
  });
const installLocal = () =>
  installExtensionFromDialog(window, manager, () => false, translator);
function expectRestingListeners() {
  expect(owner.listenerCount("destroyed")).toBe(8);
  expect(owner.listenerCount("render-process-gone")).toBe(0);
  expect(owner.listenerCount("did-start-navigation")).toBe(0);
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-install-lifetime-"));
  owner = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  window = { webContents: owner } as unknown as BrowserWindow;
  // Model the observed dormant core/router load, not native Electron coverage.
  for (let i = 0; i < 8; i++) owner.on("destroyed", () => {});
  const packages = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime: runtimeVersion,
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  views.length = 0;
  manager = createExtensionManager({
    packages,
    trust: createExtensionPackageTrust({
      packages,
      runtime: runtimeVersion,
      temporaryDirectory: root,
    }),
    runtime: {
      activate: async (): Promise<Backend> => {
        const entry = (await packages.snapshot())[0]!;
        return {
          epoch: "controlled-backend",
          signal: new AbortController().signal,
          selection: {
            id,
            generation: entry.generation,
            digest: entry.digest!,
          },
          state: () => "active",
          call: async (value) => value,
          retire: vi.fn<Backend["retire"]>(),
        };
      },
      retire: async () => null,
      dispose: async () => [],
    },
    createViews(input) {
      views.push(input);
      // Controlled native adapter: one listener per live view host, released
      // with its pin. Production host listener removal has separate coverage.
      const lost = () => {};
      owner.on("destroyed", lost);
      return {
        open: async () => {},
        retire: async () => {
          owner.removeListener("destroyed", lost);
          await input.pin.release();
          input.retired();
          return { status: "settled" };
        },
      };
    },
  });
  links = createExtensionLinkInstaller(() => false, translator);
  const archive = path.join(root, "files.omxext");
  await writeFile(archive, bytes);
  adapters.picker
    .mockReset()
    .mockResolvedValue({ canceled: false, filePaths: [archive] });
  adapters.consent.mockReset().mockResolvedValue({ response: 1 });
  adapters.download.mockReset().mockResolvedValue(bytes);
});
afterEach(async () => {
  links.dispose();
  await manager.dispose();
  await rm(root, { recursive: true, force: true });
});
it("repeated active-view reinstalls keep acquisition and consent at one cancellation listener", async () => {
  expect(await installLocal()).toBe(true);
  expectRestingListeners();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await manager.open(id, {
      owner: window,
      signal: new AbortController().signal,
      terminalDirectory: null,
    });
    expect(owner.listenerCount("destroyed")).toBe(9);
    adapters.download.mockImplementationOnce(async () => {
      expect(owner.listenerCount("destroyed")).toBe(10);
      return bytes;
    });
    let consentListeners = 0;
    adapters.consent.mockImplementationOnce(async () => {
      consentListeners = owner.listenerCount("destroyed");
      return { response: 1 };
    });
    await installLink();
    expect(consentListeners).toBe(10);
    expectRestingListeners();
    expect(await manager.snapshot()).toMatchObject([
      { generation: cycle + 1, local: "dormant" },
    ]);
    await expect(
      views[cycle - 1]!.call(null, new AbortController().signal),
    ).rejects.toThrow("unavailable");
  }
  await manager.uninstall(id, 4);
  expect((await manager.snapshot())[0]?.digest).toBeNull();
  expectRestingListeners();
});
it.each(["destroyed", "render-process-gone", "did-start-navigation"])(
  "%s cancels link consent and removes request listeners",
  async (event) => {
    adapters.consent.mockImplementationOnce(async () => {
      owner.emit(event);
      expect(adapters.download.mock.calls[0]![1].aborted).toBe(true);
      return { response: 1 };
    });
    await expect(installLink()).rejects.toThrow("cancelled");
    expect(await manager.snapshot()).toEqual([]);
    expectRestingListeners();
  },
);
it("local selection retains destruction ownership through chooser and consent", async () => {
  adapters.picker.mockImplementationOnce(async () => {
    expect(owner.listenerCount("destroyed")).toBe(9);
    return { canceled: false, filePaths: [path.join(root, "files.omxext")] };
  });
  adapters.consent.mockImplementationOnce(async () => {
    expect(owner.listenerCount("destroyed")).toBe(9);
    // Leave isDestroyed false to distinguish trust revocation by the listener
    // from the independent post-await owner-alive guard.
    owner.emit("destroyed");
    return { response: 1 };
  });
  await expect(installLocal()).rejects.toThrow("unavailable");
  expect(await manager.snapshot()).toEqual([]);
  expectRestingListeners();
});
it.each(["local", "link"])(
  "%s releases consent listeners on refusal and failure before a fresh install",
  async (source) => {
    const install = source === "local" ? installLocal : installLink;
    adapters.consent.mockResolvedValueOnce({ response: 0 });
    if (source === "local") expect(await install()).toBe(false);
    else await expect(install()).rejects.toThrow("cancelled");
    expect(await manager.snapshot()).toEqual([]);
    expectRestingListeners();
    adapters.consent.mockRejectedValueOnce(
      new Error("Controlled dialog failure"),
    );
    await expect(install()).rejects.toThrow("Controlled dialog failure");
    expect(await manager.snapshot()).toEqual([]);
    expectRestingListeners();
    await install();
    expect(await manager.snapshot()).toMatchObject([
      { generation: 1, local: "dormant" },
    ]);
    expectRestingListeners();
  },
);
