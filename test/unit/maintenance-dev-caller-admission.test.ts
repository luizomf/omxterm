import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow, MessageBoxOptions } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { version as appVersion } from "../../package.json";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import {
  createExtensionCatalog,
  parseCatalog,
  type CatalogRelease,
} from "../../src/main/extension-catalog";
import { installExtensionFromDialog } from "../../src/main/extension-install-dialog";
import { createExtensionLinkInstaller } from "../../src/main/extension-link-install";
import { createExtensionManager } from "../../src/main/extension-manager";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust";
import { translatorFor } from "../../src/shared/i18n";
import { packageArchive } from "../fixtures/extension-package-archive";

const adapters = vi.hoisted(() => ({
  picker: vi.fn<() => Promise<{ canceled: boolean; filePaths: string[] }>>(),
  consent:
    vi.fn<
      (
        window: BrowserWindow,
        options: MessageBoxOptions,
      ) => Promise<{ response: number }>
    >(),
  download: vi.fn<(url: string, signal: AbortSignal) => Promise<Buffer>>(),
}));
vi.mock("electron", () => ({
  dialog: { showOpenDialog: adapters.picker, showMessageBox: adapters.consent },
}));
vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: adapters.download,
}));

// Exercise the actual current source host version; do not spoof admission.
const runtime = { appVersion, apiVersion: "0.1.0" };
// Verbatim extension.json bytes extracted from the published archives.
const releases = [
  {
    name: "Files 0.9.1",
    id: "omxterm.files",
    manifest: `{"format":1,"id":"omxterm.files","version":"0.9.1","name":"Files","engines":{"omxterm":">=0.26.0","api":"0.1.x"},"backend":"backend.mjs","capabilities":["terminal.insertPath.v1"],"view":{"entry":"index.html","action":"omxterm.files.open","title":"Files"}}`,
  },
  {
    name: "SSH 0.4.1",
    id: "omxterm.ssh",
    manifest: `{"format":1,"id":"omxterm.ssh","version":"0.4.1","name":"SSH Connect","engines":{"omxterm":">=0.27.0-dev.0","api":"0.1.x"},"backend":"backend.mjs","capabilities":["terminal.openSsh.v1","links.open.v1"],"links":{"docs":"https://github.com/luizomf/omxterm/blob/main/docs/ssh-connect.md"},"view":{"entry":"index.html","action":"omxterm.ssh.open","title":"SSH Connect"}}`,
  },
  {
    name: "Snippets 0.1.3",
    id: "omxterm.snippets",
    manifest: `{"format":1,"id":"omxterm.snippets","version":"0.1.3","name":"Snippets","engines":{"omxterm":">=0.24.0-dev.8","api":"0.1.x"},"backend":"backend.mjs","capabilities":["terminal.semanticInput.v1"],"view":{"entry":"index.html","action":"omxterm.snippets.open","title":"Snippets"}}`,
  },
] as const;
type ReleaseFixture = (typeof releases)[number];
const backend =
  "throw new Error('installation must not activate the backend');";
const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function archive(manifest: string) {
  // The manifest is original; the enclosing archive and other entries are not.
  return packageArchive([
    { name: "extension.json", data: manifest },
    { name: "backend.mjs", data: backend },
    { name: "index.html", data: "<html></html>" },
  ]);
}

let root: string;
let packages: InstalledPackages;
let trust: ReturnType<typeof createExtensionPackageTrust>;
let manager: ReturnType<typeof createExtensionManager>;
let links: ReturnType<typeof createExtensionLinkInstaller>;
let window: BrowserWindow;
const translator = () => translatorFor("en-US");
const activate = vi.fn(async () => {
  throw new Error("installation must not activate the backend");
});
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-maintenance-dev-"));
  packages = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime,
    // Headless controlled leases: not a native-lock qualification.
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  trust = createExtensionPackageTrust({
    packages,
    runtime,
    temporaryDirectory: root,
  });
  manager = createExtensionManager({
    packages,
    trust,
    runtime: { activate, retire: async () => null, dispose: async () => [] },
    createViews: () => {
      throw new Error("installation must not create views");
    },
  });
  links = createExtensionLinkInstaller(() => false, translator);
  window = {
    webContents: Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
    }),
  } as unknown as BrowserWindow;
  adapters.download.mockReset();
  adapters.consent.mockReset().mockResolvedValue({ response: 1 });
  adapters.picker.mockReset();
  activate.mockClear();
});
afterEach(async () => {
  links.dispose();
  await manager.dispose();
  await rm(root, { recursive: true, force: true });
});
async function publishedRelease(
  fixture: ReleaseFixture,
): Promise<CatalogRelease> {
  const catalog = parseCatalog(
    await readFile("distribution/official-extensions-v1.json"),
  );
  const release = catalog.find((entry) => entry.id === fixture.id);
  if (!release) throw new Error(`Missing catalog release: ${fixture.id}`);
  const manifest = JSON.parse(fixture.manifest) as {
    id: string;
    version: string;
    engines: CatalogRelease["engines"];
  };
  expect({
    id: release.id,
    version: release.version,
    engines: release.engines,
  }).toEqual({
    id: manifest.id,
    version: manifest.version,
    engines: manifest.engines,
  });
  return release;
}
async function syntheticRelease(fixture: ReleaseFixture, bytes: Buffer) {
  const release = await publishedRelease(fixture);
  return {
    ...release,
    // This is deliberately NOT the published archive digest or byte count.
    archive: { ...release.archive, bytes: bytes.length, sha256: sha256(bytes) },
  };
}
async function catalogFor(release: CatalogRelease) {
  const catalog = createExtensionCatalog(runtime, "linux-arm64");
  adapters.download.mockResolvedValueOnce(
    Buffer.from(JSON.stringify({ schemaVersion: 1, entries: [release] })),
  );
  await catalog.refresh(new AbortController().signal);
  return catalog;
}

async function installLink(
  release: CatalogRelease,
  bytes: Buffer,
  official = false,
) {
  adapters.download.mockResolvedValueOnce(bytes);
  await links.install(
    window,
    manager,
    {
      operation: "install-link",
      url: release.archive.url,
      token: "11111111-1111-1111-1111-111111111111",
    },
    official ? release : undefined,
  );
}
async function expectInstalled(
  fixture: ReleaseFixture,
  digest: string,
  backendBytes: string | Buffer,
  generation = 1,
) {
  expect(await manager.snapshot()).toMatchObject([
    { id: fixture.id, digest, generation, enabled: true, local: "dormant" },
  ]);
  expect(activate).not.toHaveBeenCalled();
  const pin = await packages.openVersion(fixture.id);
  try {
    expect(pin).toMatchObject({ id: fixture.id, digest, generation });
    expect(await pin.revalidate()).toBe(true);
    expect(await readFile(path.join(pin.directory, "extension.json"))).toEqual(
      Buffer.from(fixture.manifest),
    );
    expect(await readFile(path.join(pin.directory, "backend.mjs"))).toEqual(
      Buffer.from(backendBytes),
    );
  } finally {
    await pin.release();
  }
}

it.each(releases)(
  "offers and installs $name via captured catalog trust at the current runtime",
  async (fixture) => {
    const bytes = archive(fixture.manifest);
    const digest = sha256(bytes);
    const release = await syntheticRelease(fixture, bytes);
    const catalog = await catalogFor(release);
    const card = catalog.snapshot(await packages.snapshot()).entries[0]!;
    expect(card).toMatchObject({
      id: fixture.id,
      compatible: true,
      action: "install",
    });
    const selected = catalog.select(card.selection);
    const downloaded = Buffer.from(bytes);
    adapters.consent.mockImplementationOnce(async (_window, prompt) => {
      expect(prompt.detail).toContain(fixture.id);
      expect(prompt.detail).toContain(digest);
      expect(prompt.detail).toContain("Current generation: 0");
      expect(prompt.detail).toContain(
        translator().t("extensions.catalogTrust"),
      );
      // Mutating the transport buffer after trust preparation cannot change consent.
      downloaded.fill(0);
      return { response: 1 };
    });
    await installLink(selected, downloaded, true);
    expect(adapters.consent).toHaveBeenCalledOnce();
    await expectInstalled(fixture, digest, backend);
  },
);

it("admits a published manifest through local and direct-link trust with the same bytes", async () => {
  const fixture = releases[0];
  const bytes = archive(fixture.manifest);
  const digest = sha256(bytes);
  const release = await syntheticRelease(fixture, bytes);
  const file = path.join(root, "selected.omxext");
  await writeFile(file, bytes);
  adapters.picker.mockResolvedValueOnce({
    canceled: false,
    filePaths: [file],
  });
  adapters.consent.mockImplementationOnce(async (_window, prompt) => {
    expect(prompt.detail).toContain(digest);
    expect(prompt.detail).not.toContain(
      translator().t("extensions.catalogTrust"),
    );
    await writeFile(file, "changed after preparation");
    return { response: 1 };
  });
  expect(
    await installExtensionFromDialog(window, manager, () => false, translator),
  ).toBe(true);
  await expectInstalled(fixture, digest, backend);
  const downloaded = Buffer.from(bytes);
  adapters.consent.mockImplementationOnce(async (_window, prompt) => {
    expect(prompt.detail).toContain(digest);
    expect(prompt.detail).toContain("Current generation: 1");
    expect(prompt.detail).not.toContain(
      translator().t("extensions.catalogTrust"),
    );
    downloaded.fill(0);
    return { response: 1 };
  });
  await installLink(release, downloaded);
  await expectInstalled(fixture, digest, backend, 2);
});

it("refuses an API-incompatible archive through catalog, local and link", async () => {
  const fixture = releases[0];
  // Negative control only: the published manifest itself remains unchanged.
  const incompatibleManifest = fixture.manifest.replace(
    '"api":"0.1.x"',
    '"api":"0.2.x"',
  );
  const bytes = archive(incompatibleManifest);
  const release = await syntheticRelease(fixture, bytes);
  release.engines.api = "0.2.x";
  const catalog = await catalogFor(release);
  const card = catalog.snapshot([]).entries[0]!;
  expect(card.compatible).toBe(false);
  expect(() => catalog.select(card.selection)).toThrow("incompatible");
  const file = path.join(root, "incompatible.omxext");
  await writeFile(file, bytes);
  adapters.picker.mockResolvedValueOnce({ canceled: false, filePaths: [file] });
  await expect(
    installExtensionFromDialog(window, manager, () => false, translator),
  ).rejects.toMatchObject({ code: "incompatible" });
  await expect(installLink(release, bytes)).rejects.toMatchObject({
    code: "incompatible",
  });
  expect(adapters.consent).not.toHaveBeenCalled();
  expect(await packages.snapshot()).toEqual([]);
});

it("rejects an unknown capability before local or link trust", async () => {
  const fixture = releases[0];
  const unsupported = fixture.manifest.replace(
    '"capabilities":["terminal.insertPath.v1"]',
    '"capabilities":["terminal.future.v1"]',
  );
  expect(unsupported).not.toBe(fixture.manifest);
  const bytes = archive(unsupported);
  const release = await syntheticRelease(fixture, bytes);
  const catalog = await catalogFor(release);
  // Catalog metadata has no capability list; archive validation is authoritative.
  const card = catalog.snapshot([]).entries[0]!;
  expect(card.compatible).toBe(true);
  const selected = catalog.select(card.selection);
  const file = path.join(root, "unsupported.omxext");
  await writeFile(file, bytes);
  adapters.picker.mockResolvedValueOnce({ canceled: false, filePaths: [file] });
  await expect(
    installExtensionFromDialog(window, manager, () => false, translator),
  ).rejects.toMatchObject({ code: "invalid-package" });
  await expect(installLink(selected, bytes, true)).rejects.toMatchObject({
    code: "invalid-package",
  });
  expect(adapters.consent).not.toHaveBeenCalled();
  expect(await packages.snapshot()).toEqual([]);
});

it("refuses a refreshed selection without revoking an already captured release", async () => {
  const fixture = releases[0];
  const bytes = archive(fixture.manifest);
  const release = await syntheticRelease(fixture, bytes);
  const catalog = await catalogFor(release);
  const previous = catalog.snapshot([]).entries[0]!;
  expect(previous.compatible).toBe(true);
  const captured = catalog.select(previous.selection);
  adapters.download.mockResolvedValueOnce(
    Buffer.from(JSON.stringify({ schemaVersion: 1, entries: [release] })),
  );
  await catalog.refresh(new AbortController().signal);
  const current = catalog.snapshot([]).entries[0]!;
  expect(current.selection).not.toBe(previous.selection);
  expect(() => catalog.select(previous.selection)).toThrow("catalog-selection");
  expect(catalog.select(current.selection)).toEqual(captured);
  await installLink(captured, bytes, true);
  await expectInstalled(fixture, sha256(bytes), backend);
});

it.each(["install", "uninstall"] as const)(
  "consumes captured catalog approval after an intervening %s changes the generation",
  async (change) => {
    const fixture = releases[0];
    const bytes = archive(fixture.manifest);
    const catalog = await catalogFor(await syntheticRelease(fixture, bytes));
    const selected = catalog.select(catalog.snapshot([]).entries[0]!.selection);
    if (change === "uninstall")
      await packages.install(bytes, { expectedGeneration: 0, enabled: true });
    const owner = {};
    const preview = await manager.prepare(owner, bytes, selected);
    expect(preview.expectedGeneration).toBe(change === "install" ? 0 : 1);
    if (change === "install")
      await packages.install(bytes, { expectedGeneration: 0, enabled: true });
    else await packages.uninstall(fixture.id, 1);
    await expect(manager.approve(owner, preview.token)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(manager.approve(owner, preview.token)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(trust.approve(owner, preview.token)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(await packages.snapshot()).toMatchObject([
      change === "install"
        ? { generation: 1, digest: sha256(bytes), enabled: true }
        : { generation: 2, digest: null, enabled: false },
    ]);
  },
);

it("does not revive an old pin after disable, enable or same-byte reinstall", async () => {
  const fixture = releases[0];
  const bytes = archive(fixture.manifest);
  const catalog = await catalogFor(await syntheticRelease(fixture, bytes));
  const selected = catalog.select(catalog.snapshot([]).entries[0]!.selection);
  await installLink(selected, bytes, true);
  const pin = await packages.openVersion(fixture.id);
  try {
    await packages.setEnabled(fixture.id, 1, false);
    expect(await pin.revalidate()).toBe(false);
    await expect(packages.openVersion(fixture.id, pin)).rejects.toMatchObject({
      code: "unavailable",
    });
    await packages.setEnabled(fixture.id, 2, true);
    expect(await pin.revalidate()).toBe(false);
    await packages.uninstall(fixture.id, 3);
    const reinstalled = await packages.install(bytes, {
      expectedGeneration: 4,
      enabled: true,
    });
    expect(reinstalled).toMatchObject({ digest: pin.digest, generation: 5 });
    expect(await pin.revalidate()).toBe(false);
    await expect(packages.openVersion(fixture.id, pin)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expectInstalled(fixture, sha256(bytes), backend, 5);
  } finally {
    await pin.release();
  }
});

it("opens an existing stable-host installation at the current runtime without reinstalling", async () => {
  // Snippets 0.1.2 also admits the 0.24.0 host; Files 0.8 and SSH 0.4 do not.
  const fixture = releases[2];
  const bytes = archive(fixture.manifest);
  // This historical host only seeds the pre-upgrade store; the open below uses
  // the real current runtime, not a version substitute for admission.
  const previousHost = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime: { appVersion: "0.24.0", apiVersion: "0.1.0" },
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  const previous = await previousHost.install(bytes, {
    expectedGeneration: 0,
    enabled: true,
  });
  expect(await packages.snapshot()).toEqual([previous]);
  await expectInstalled(fixture, sha256(bytes), backend);
  expect(await packages.snapshot()).toEqual([previous]);
});
