import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";

it("builds the optional theme main with a real CJS module URL and observable runtime fork", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-theme-build-"));
  try {
    await buildFixture(root, "runner", undefined, { optionalSnippets: true });
    const main = await readFile(path.join(root, "main.cjs"), "utf8");
    expect(main).toContain(
      'const __fixtureMetaUrl = require("node:url").pathToFileURL(__filename).href;',
    );
    expect(main).toMatch(/createRequire\)\(__fixtureMetaUrl\)\(addonPath\)/u);
    expect(main).toMatch(/import_node_child_process\d*\.fork/u);
    expect(main).toContain("childProcess.fork =");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
