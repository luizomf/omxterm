import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import { macosCompositionPackage } from "../fixtures/macos-composition-package";

it("installs the native composition fixture through actual archive validation without execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "composition-package-"));
  try {
    const archive = path.join(root, "fixture.omxext");
    await writeFile(archive, macosCompositionPackage());
    const packages = await InstalledPackages.open({
      root: path.join(root, "store"),
      runtime: { appVersion: "0.24.0-dev.14", apiVersion: "0.1.0" },
      leases: { tryAcquire: async () => ({ release: async () => {} }) },
    });
    await packages.install(archive, { expectedGeneration: 0, enabled: true });
    const [entry] = await packages.snapshot();
    expect(entry).toMatchObject({
      id: "test.composition",
      generation: 1,
      enabled: true,
      manifest: {
        backend: "backend.mjs",
        view: { entry: "index.html", action: "test.composition.open" },
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
