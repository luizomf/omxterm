// Import the ordinary build unchanged; no alternate application composition.
import { app } from "electron";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import observation from "./snippets-observer.cjs";
import scenario from "./macos-composition-scenario.cjs";

const root = import.meta.dirname;
const fixture = {
  ...JSON.parse(await readFile(path.join(root, "fixture.json"), "utf8")),
  root,
};
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
await mkdir(path.join(root, "config/omxterm"), { recursive: true });
await writeFile(
  path.join(root, "config/omxterm/config.json"),
  JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
);
process.env.XDG_CONFIG_HOME = path.join(root, "config");
process.env.XDG_DATA_HOME = path.join(root, "data");
app.setPath("userData", path.join(root, "profile"));
const archiveSha256 = createHash("sha256")
  .update(await readFile(fixture.archive))
  .digest("hex");
const observer = observation.observe(
  { ...fixture, archiveSha256 },
  createRequire(path.join(fixture.source, "package.json")),
);
const ready = new Promise((resolve) =>
  app.once("browser-window-created", (_event, window) =>
    window.once("ready-to-show", () => resolve(window)),
  ),
);
await import(pathToFileURL(fixture.entry).href);
void ready
  .then(async (window) => {
    const result = await scenario.runScenario({ window, fixture, ...observer });
    app.once("will-quit", () => {
      try {
        assert.ok(
          observer.ptys.length === 1 && observer.ptys.every((p) => p.exited),
          "ordinary Quit joins original PTY",
        );
        assert.equal(observer.children.length, 2);
        assert.ok(
          observer.children.every((c) => c.closed),
          "ordinary Quit joins backend streams",
        );
        for (const child of observer.children)
          assert.deepEqual(child.exit, { code: 0, signal: null });
        result.checks.push("ordinary-quit-joins-active-backend-and-pty");
        console.log(
          "MACOS_COMPOSITION_RESULT:" +
            JSON.stringify({ ...result, archiveSha256 }),
        );
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        observer.restore();
      }
    });
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    app.once("will-quit", observer.restore);
    app.quit();
  });
