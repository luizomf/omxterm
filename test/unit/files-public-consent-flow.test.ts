import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from "electron";
import { afterEach, expect, it, vi, type Mock } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import { installExtensionFromDialog } from "../../src/main/extension-install-dialog";
import type { CatalogRelease } from "../../src/main/extension-catalog";
import type { createExtensionManager } from "../../src/main/extension-manager";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust";
import { packageArchive } from "../fixtures/extension-package-archive";

vi.mock("electron", () => ({
  dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() },
}));

const require = createRequire(import.meta.url);
const { verifyFilesConsent } = require("../fixtures/files-packaged.cjs") as {
  verifyFilesConsent: (
    prompt: MessageBoxOptions,
    options: {
      publicCatalog: string;
      extensionVersion: string;
      archiveSha256: string;
    },
    approvals: number,
  ) => void;
};
let root: string | undefined;
afterEach(async () => {
  vi.resetAllMocks();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

it("joins the real catalog trust, dialog and store to the Files0.6 consent oracle", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "files-public-consent-"));
  const runtime = { appVersion: "0.24.0", apiVersion: "0.1.0" };
  const manifest = {
    format: 1,
    id: "omxterm.files",
    name: "Files — ARM64 preview",
    version: "0.6.0",
    engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
    backend: "backend.mjs",
  };
  // A synthetic package exercises the production seam; it is not release bytes.
  const bytes = packageArchive([
    { name: "extension.json", data: JSON.stringify(manifest) },
    { name: "backend.mjs", data: "throw new Error('must remain dormant');" },
  ]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const release: CatalogRelease = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: "Synthetic Files control",
    engines: manifest.engines,
    targets: ["darwin-arm64"],
    archive: {
      url: "https://example.org/files.omxext",
      bytes: bytes.length,
      sha256: digest,
    },
    sourceCommit: "a".repeat(40),
    releaseUrl: "https://example.org/release",
  };
  const packages = await InstalledPackages.open({
    root: path.join(root, "store"),
    runtime,
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  const trust = createExtensionPackageTrust({
    packages,
    runtime,
    temporaryDirectory: root,
  });
  const manager = trust as unknown as ReturnType<typeof createExtensionManager>;
  const owner = { isDestroyed: () => false };
  const window = { webContents: owner } as unknown as BrowserWindow;
  const options = {
    publicCatalog: "fixed",
    extensionVersion: "0.6.0",
    archiveSha256: digest,
  };
  let approvals = 0;
  let wrongGeneration = true;
  const showMessageBox = vi.mocked(dialog.showMessageBox) as unknown as Mock<
    (
      window: BrowserWindow,
      prompt: MessageBoxOptions,
    ) => Promise<MessageBoxReturnValue>
  >;
  showMessageBox.mockImplementation(
    async (_window: BrowserWindow, prompt: MessageBoxOptions) => {
      const selected = wrongGeneration
        ? {
            ...prompt,
            detail: (prompt.detail ?? "").replace(
              "Current generation: 0",
              "Current generation: 1",
            ),
          }
        : prompt;
      verifyFilesConsent(selected, options, approvals);
      approvals++;
      return { response: 1, checkboxChecked: false };
    },
  );
  const install = () =>
    installExtensionFromDialog(
      window,
      manager,
      () => false,
      undefined,
      bytes,
      release,
    );

  await expect(install()).rejects.toThrow();
  expect(await packages.snapshot()).toEqual([]);
  wrongGeneration = false;
  expect(await install()).toBe(true);
  expect((await packages.snapshot())[0]?.generation).toBe(1);
  expect(await install()).toBe(true);
  expect((await packages.snapshot())[0]?.generation).toBe(2);
  await packages.setEnabled(manifest.id, 2, false);
  await packages.setEnabled(manifest.id, 3, true);
  await packages.uninstall(manifest.id, 4);
  expect(await install()).toBe(true);
  expect((await packages.snapshot())[0]).toMatchObject({
    generation: 6,
    digest,
    enabled: true,
  });
  expect(approvals).toBe(3);
  expect(dialog.showOpenDialog).not.toHaveBeenCalled();
});
