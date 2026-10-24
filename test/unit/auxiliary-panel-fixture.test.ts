import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";

// Build only: no Electron launch, window, PTY or desktop interaction.
it("bundles the auxiliary native scenario and production renderer headlessly", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-panel-build-"));
  try {
    await buildFixture(root);
    expect(await readFile(path.join(root, "main.cjs"), "utf8")).toContain(
      "--fixture-auxiliary-only",
    );
    expect(
      await readFile(path.join(root, "renderer/index.js"), "utf8"),
    ).toContain("Resize auxiliary panel");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
