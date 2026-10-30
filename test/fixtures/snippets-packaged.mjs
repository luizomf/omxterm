// Source-launch adapter: unchanged production composition, not an AppImage.
import { app } from "electron";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import observation from "./snippets-observer.cjs";
import scenario from "./snippets-scenario.cjs";

const root = import.meta.dirname;
const fixture = {
  ...JSON.parse(await readFile(path.join(root, "fixture.json"), "utf8")),
  root,
};
assert.equal(typeof fixture.hostVersion, "string");
assert.equal(app.getVersion(), fixture.hostVersion, "matching host version");
console.log(
  "SNIPPETS_SOURCE_HOST:" + JSON.stringify({ version: app.getVersion() }),
);
const require = createRequire(path.join(fixture.source, "package.json"));
await mkdir(path.join(root, "config/omxterm"), { recursive: true });
await copyFile(
  path.join(root, "snippets-catalog.json"),
  path.join(root, "config/omxterm/snippets.yaml"),
);
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
const observer = observation.observe({ ...fixture, archiveSha256 }, require);
const ready = new Promise((resolve) =>
  app.once("browser-window-created", (_event, window) =>
    window.once("ready-to-show", () => resolve(window)),
  ),
);
await import(pathToFileURL(fixture.entry).href);
void ready
  .then(async (window) => {
    const result = await scenario.runScenario({
      window,
      fixture,
      ...observer,
      archiveSha256,
    });
    app.once("will-quit", () => {
      assert.ok(
        observer.ptys.every((p) => p.exited),
        "PTY shutdown joined",
      );
      observer.restore();
      console.log("SNIPPETS_PACKAGED_RESULT:" + JSON.stringify(result));
    });
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    app.once("will-quit", observer.restore);
    app.quit();
  });
