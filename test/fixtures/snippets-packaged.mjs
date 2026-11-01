// Source-launch adapter: unchanged production composition, not an AppImage.
import { app, ipcMain } from "electron";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
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
  path.join(
    root,
    process.platform === "win32"
      ? "snippets-windows-catalog.json"
      : "snippets-catalog.json",
  ),
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
let windowsProbe;
const observer = observation.observe(
  {
    ...fixture,
    archiveSha256,
    windowsCpr: process.platform === "win32",
    ...(fixture.readinessDiagnostic
      ? {
          readinessTrace: (event) => {
            if (!windowsProbe) throw Error("Readiness observer unavailable");
            windowsProbe.record(event);
          },
        }
      : {}),
  },
  require,
);
windowsProbe =
  process.platform === "win32"
    ? createRequire(import.meta.url)(
        "./snippets-windows-readiness.cjs",
      ).startWindowsProbeReadiness({
        app,
        ipcMain,
        ptys: observer.ptys,
        createInputHandler: require("restty/internal").createInputHandler,
        diagnostic: fixture.readinessDiagnostic === true,
      })
    : undefined;
const insertDiagnostic = fixture.insertDiagnostic
  ? createRequire(import.meta.url)(
      "./snippets-insert-diagnostic.cjs",
    ).startInsertDiagnostic({
      app,
      ipcMain,
      ptys: observer.ptys,
    })
  : undefined;
const restore = () => {
  try {
    insertDiagnostic?.dispose();
  } finally {
    try {
      windowsProbe?.dispose();
    } finally {
      observer.restore();
    }
  }
};
const fixtureProcesses =
  process.platform === "win32"
    ? createRequire(import.meta.url)("./fixture-processes.cjs").fixtureProcesses
    : undefined;
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
      fixtureProcesses,
      windowsProbeReady: windowsProbe?.ready,
      windowsProbeSnapshot: windowsProbe?.snapshot,
      insertDiagnostic,
    });
    if (fixture.memoryInput) {
      app.once("will-quit", () => {
        const lifecycle = {
          classification: "first-insert-memory-not-qualification",
          nonce: fixture.memoryInput,
          ptyOnExit: observer.ptys.map((pty) => pty.exited),
          backend: observer.children.map(({ pid, closed, exit }) => ({
            pid,
            closed,
            exit,
          })),
          identities: [],
          errors: [],
        };
        try {
          const remaining = fixtureProcesses();
          lifecycle.identities = result.identities.map((owned) => ({
            ...owned,
            alive: remaining.some(
              (row) => row.pid === owned.pid && row.identity === owned.identity,
            ),
          }));
          assert.equal(observer.ptys.length, 1);
          assert.equal(observer.children.length, 1);
          assert.ok(observer.ptys[0].exited, "PTY shutdown joined");
          assert.ok(observer.children[0].closed, "backend close joined");
          assert.deepEqual(observer.children[0].exit, {
            code: 0,
            signal: null,
          });
          assert.ok(
            lifecycle.identities.every((owned) => !owned.alive),
            "captured identities absent",
          );
        } catch (error) {
          lifecycle.errors.push(String(error));
          process.exitCode = 1;
        }
        try {
          writeFileSync(
            path.join(fixture.evidence, "memory-lifecycle.json"),
            JSON.stringify(lifecycle),
            { flag: "wx" },
          );
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
        } finally {
          restore();
        }
      });
      app.quit();
      return;
    }
    app.once("will-quit", () => {
      try {
        assert.ok(
          observer.ptys.every((p) => p.exited),
          "PTY shutdown joined",
        );
        if (fixtureProcesses) {
          assert.equal(observer.ptys.length, 1);
          assert.equal(observer.children.length, 1);
          assert.ok(observer.children[0].closed, "backend close joined");
          assert.deepEqual(observer.children[0].exit, {
            code: 0,
            signal: null,
          });
          const remaining = fixtureProcesses();
          const identities = result.identities.map((owned) => ({
            ...owned,
            alive: remaining.some(
              (row) => row.pid === owned.pid && row.identity === owned.identity,
            ),
          }));
          if (fixture.evidence)
            writeFileSync(
              path.join(fixture.evidence, "process-identities.json"),
              JSON.stringify(
                {
                  identities,
                  retirementIdentity: result.retirementIdentity,
                  ptyOnExit: observer.ptys[0].exited,
                  backendExit: observer.children[0].exit,
                  backendClosed: observer.children[0].closed,
                },
                null,
                2,
              ),
            );
          assert.ok(
            identities.every((owned) => !owned.alive),
            "captured PTY/backend identities absent",
          );
        }
        const {
          identities: _identities,
          retirementIdentity: _retirementIdentity,
          ...reported
        } = result;
        console.log("SNIPPETS_PACKAGED_RESULT:" + JSON.stringify(reported));
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        restore();
      }
    });
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    app.once("will-quit", restore);
    app.quit();
  });
