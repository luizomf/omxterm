import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractPackage,
  parseManifest,
} from "../../src/installed-packages/archive.js";
import { packageArchive } from "../fixtures/extension-package-archive.js";

const manifest = {
  format: 1,
  id: "example.files",
  version: "1.0.0",
  name: "Files",
  engines: { omxterm: ">=0.23.0-0 <0.24.0", api: "0.1.x" },
  backend: "backend.mjs",
  view: {
    entry: "view/index.html",
    action: "example.files.open",
    title: "Files",
  },
};
describe("concrete application-view declaration", () => {
  it("accepts one namespaced action and retains backend-only compatibility", () => {
    expect(parseManifest(manifest)).toEqual(manifest);
    expect(
      parseManifest({
        ...manifest,
        id: "example.files.extra",
        view: { ...manifest.view, action: "example.files.extra.open" },
      }).view?.action,
    ).toBe("example.files.extra.open");
    const { view: _view, ...backendOnly } = manifest;
    expect(parseManifest(backendOnly)).toEqual(backendOnly);
  });
  it("rejects foreign action identities, paths, titles and unimplemented declarations", () => {
    for (const view of [
      { ...manifest.view, action: "core.quit" },
      { ...manifest.view, action: "example.files.extra.open" },
      { ...manifest.view, entry: "view/my page.html" },
      { ...manifest.view, entry: "view/á.html" },
      { ...manifest.view, entry: `${"a/".repeat(254)}index.html` },
      { ...manifest.view, entry: "../index.html" },
      { ...manifest.view, title: "Files\nQuit" },
      { ...manifest.view, title: " " },
      { ...manifest.view, shortcut: "Ctrl+F" },
      { ...manifest.view, entry: "backend.mjs" },
      undefined,
    ])
      expect(() => parseManifest({ ...manifest, view })).toThrow(
        "invalid-package",
      );
  });
  it("requires an exact regular view entry in the captured archive", async () => {
    for (const name of [
      "view/index.html",
      "view/INDEX.html",
      "view/index.html/",
    ]) {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "omxterm-view-manifest-"),
      );
      try {
        // Exercise the on-disk archive path that local installation uses.
        const archive = path.join(directory, "view.omxext");
        const destination = path.join(directory, "extracted");
        await mkdir(destination);
        await writeFile(
          archive,
          packageArchive([
            { name: "extension.json", data: JSON.stringify(manifest) },
            { name: "backend.mjs", data: "export function activate() {}" },
            { name, data: name.endsWith("/") ? "" : "<!doctype html>" },
          ]),
        );
        const pending = extractPackage(archive, destination, {
          appVersion: "0.23.0-dev.5",
          apiVersion: "0.1.0",
        });
        if (name === manifest.view.entry)
          expect((await pending).manifest.view).toEqual(manifest.view);
        else await expect(pending).rejects.toThrow("invalid-package");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
});
