import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";
import { build } from "esbuild";

// Build only: no Electron launch, window, PTY or desktop interaction.
it("bundles the auxiliary native scenario and production renderer headlessly", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-panel-build-"));
  try {
    await buildFixture(root);
    const main = await readFile(path.join(root, "main.cjs"), "utf8");
    expect(main).toContain("--fixture-auxiliary-only");
    // The custom entrypoint must retain production's permission-only GPU policy.
    // Platform/switch behavior is covered in chromium-gpu-policy.test.ts.
    const gpuPolicy = main.search(
      /applyChromiumGpuPolicy\(import_electron\d*\.app\.commandLine\)/,
    );
    expect(gpuPolicy).toBeGreaterThan(-1);
    expect(main.indexOf(".whenReady()")).toBeGreaterThan(gpuPolicy);
    const fixtureRenderer = await readFile(
      path.join(root, "renderer/index.js"),
      "utf8",
    );
    expect(fixtureRenderer).toContain("Resize auxiliary panel");
    expect(fixtureRenderer).toContain("__overlayConsumptionFixture");
    expect(fixtureRenderer).toContain("Overlay consumption capacity exceeded");
    expect(await readFile(path.join(root, "main.cjs"), "utf8")).toContain(
      "overlay production callback consumption",
    );
    const production = await build({
      entryPoints: ["src/renderer/index.ts"],
      outdir: path.join(root, "production"),
      bundle: true,
      platform: "browser",
      format: "iife",
      loader: { ".ttf": "binary" },
      write: false,
      logLevel: "silent",
    });
    expect(production.outputFiles[0]!.text).not.toContain(
      "__overlayConsumptionFixture",
    );
    expect(production.outputFiles[0]!.text).not.toContain(
      "Overlay consumption capacity exceeded",
    );
    expect(production.outputFiles[0]!.text).not.toContain(
      "__windowChromeHostReady",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
