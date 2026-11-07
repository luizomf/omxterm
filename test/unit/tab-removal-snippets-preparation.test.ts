import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust";
import { prepareFixtureSnippets } from "../fixtures/fixture-snippets-build";

it("prepares the real Snippets source as a locally trusted enabled package", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-snippets-prep-"));
  try {
    const { archive, version } = await prepareFixtureSnippets(root);
    const runtime = { appVersion: version, apiVersion: "0.1.0" };
    // This control exercises archive validation and consent, not native leases.
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
    const owner = {};
    const preview = await trust.prepare(owner, archive);
    expect(preview.manifest).toMatchObject({
      id: "omxterm.snippets",
      version: "0.1.1",
      backend: "backend.mjs",
      capabilities: ["terminal.semanticInput.v1"],
      view: { entry: "index.html", action: "omxterm.snippets.open" },
    });
    const installed = await trust.approve(owner, preview.token);
    expect(installed).toMatchObject({ enabled: true, generation: 1 });
    expect(installed.digest).toBe(preview.digest);
    await expect(trust.approve(owner, preview.token)).rejects.toThrow();
    const pin = await packages.openVersion("omxterm.snippets");
    try {
      expect(
        (await readFile(path.join(pin.directory, "backend.mjs"))).length,
      ).toBeGreaterThan(1000);
      expect(
        (await readFile(path.join(pin.directory, "view.js"))).length,
      ).toBeGreaterThan(1000);
    } finally {
      await pin.release();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("the installed Snippets backend reads the fixture's actual catalog", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-snippets-catalog-"),
  );
  try {
    const { archive, version } = await prepareFixtureSnippets(root);
    const runtime = { appVersion: version, apiVersion: "0.1.0" };
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
    const owner = {};
    const preview = await trust.prepare(owner, archive);
    await trust.approve(owner, preview.token);
    const pin = await packages.openVersion("omxterm.snippets");
    try {
      const url = pathToFileURL(path.join(pin.directory, "backend.mjs")).href;
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("../../extensions/snippets/backend");
      const backend = module.activate(
        { signal: new AbortController().signal },
        {
          environment: { XDG_CONFIG_HOME: path.join(root, "config") },
          homeDirectory: root,
        },
      );
      try {
        expect(
          await backend.invoke(
            { operation: "open", activation: "fixture_activation_01" },
            new AbortController().signal,
          ),
        ).toEqual({
          ok: true,
          rows: [{ name: "Synthetic", body: "snippet", execute: true }],
          total: 1,
          cursor: null,
        });
      } finally {
        backend.deactivate();
      }
    } finally {
      await pin.release();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
