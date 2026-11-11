import { beforeEach, expect, it, vi, type Mock } from "vitest";
import type { BrowserWindow } from "electron";
import { applicationViews } from "../../src/main/application-extension-views";
import type { ApplicationExtensionsOptions } from "../../src/main/application-extensions";
import type { ExtensionViewHostOptions } from "../../src/main/extension-view-host";
import type { PackageManifest } from "../../src/installed-packages/archive";
import { pin } from "../fixtures/extension-runtime-controlled";

const adapter = vi.hoisted(() => ({
  options: undefined as ExtensionViewHostOptions | undefined,
}));
vi.mock("electron", () => ({ ipcMain: {} }));
vi.mock("../../src/main/extension-view-ipc", () => ({
  startExtensionViewHost: (options: ExtensionViewHostOptions) => {
    adapter.options = options;
    return {
      open: async () => ({ id: "owned-view" }),
      retire: async () => ({ status: "settled" }),
      captureFocusIntent: vi.fn(),
    };
  },
}));

const DOCS = "https://github.com/luizomf/omxterm/blob/main/docs/ssh-connect.md";
let openExternalLink: ReturnType<typeof vi.fn<(url: string) => void>>;
let call: Mock<() => Promise<{ ok: boolean }>>;
let epoch: AbortController;
beforeEach(() => {
  openExternalLink = vi.fn<(url: string) => void>();
  call = vi.fn(async () => ({ ok: true }));
  epoch = new AbortController();
});

async function view(manifest: Partial<PackageManifest>) {
  const version = pin();
  Object.assign(version.manifest, {
    view: { entry: "index.html", title: "SSH", action: "test.backend.open" },
    ...manifest,
  });
  const options = {
    applicationRoot: "/synthetic",
    openExternalLink,
    ssh: { open: vi.fn() },
    layout: { capture: vi.fn(), open: vi.fn() },
    keybind: vi.fn(),
    translator: vi.fn(),
    sendAction: vi.fn(),
    changed: vi.fn(),
    isTrustedSender: vi.fn(),
  } satisfies ApplicationExtensionsOptions;
  const window = {
    getContentSize: () => [800, 600],
  } as unknown as BrowserWindow;
  const views = applicationViews(
    options,
    {
      pin: version,
      target: { owner: window, signal: epoch.signal, terminalDirectory: null },
      signal: epoch.signal,
      call,
      admit: vi.fn(),
      retired: vi.fn(),
    },
    () => undefined,
  );
  await views.open();
  return (value: unknown, visible = true) =>
    adapter.options!.onRequest!(value as never, new AbortController().signal, {
      id: "owned-view",
      isCurrentVisible: () => visible,
    });
}

const declared = {
  capabilities: ["links.open.v1" as const],
  links: { docs: DOCS },
};

it("opens exactly the manifest URL for a declared link id", async () => {
  const request = await view(declared);
  await expect(
    request({ operation: "links.open.v1", link: "docs" }),
  ).resolves.toEqual({ ok: true });
  expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(DOCS);
  expect(call).not.toHaveBeenCalled();
});

it("refuses a view whose package did not declare the capability", async () => {
  const request = await view({ links: { docs: DOCS } });
  await expect(
    request({ operation: "links.open.v1", link: "docs" }),
  ).rejects.toThrow("unavailable");
  expect(openExternalLink).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it.each([
  ["an unknown id", { operation: "links.open.v1", link: "issues" }],
  ["an inherited key", { operation: "links.open.v1", link: "constructor" }],
  ["a prototype key", { operation: "links.open.v1", link: "__proto__" }],
  ["a free-form URL", { operation: "links.open.v1", link: DOCS }],
  [
    "an extra URL field",
    { operation: "links.open.v1", link: "docs", url: "https://example.com" },
  ],
  ["a URL instead of an id", { operation: "links.open.v1", url: DOCS }],
  ["a non-string id", { operation: "links.open.v1", link: ["docs"] }],
])("refuses %s", async (_name, value) => {
  const request = await view(declared);
  await expect(request(value)).rejects.toThrow("unavailable");
  expect(openExternalLink).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it("refuses a hidden view and a retired epoch", async () => {
  const request = await view(declared);
  const value = { operation: "links.open.v1", link: "docs" };
  await expect(request(value, false)).rejects.toThrow("unavailable");
  epoch.abort();
  await expect(request(value)).rejects.toThrow("unavailable");
  expect(openExternalLink).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});
