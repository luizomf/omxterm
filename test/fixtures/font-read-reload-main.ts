import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { installedFontFamilyMetrics } from "../../src/main/installed-font-family";
import type { ActiveUserConfiguration } from "../../src/main/user-configuration-reloader";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
} from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  terminalSurfaceFontBaseline,
} from "../../src/main/user-configuration-reloader";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import { spawnFixturePty } from "./native-fixture-pty";
import {
  assertFontReadResults,
  createFontReadFailureHandler,
  fontReadFailure,
  fontReadRendererReady,
  fontReadReloadResultPrefix,
  runFontReadScenario,
  type FontReadResult,
  type FontReadStep,
} from "./font-read-reload-checks";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";
import {
  fontReadHandles,
  holdFontRead,
  releaseFontReads,
} from "./font-read-reload-io";

const root = __dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
const sessions: LocalTerminalSession[] = [];
const outputs: string[][] = [];
const exited = new Set<number>();
const owner = createResttyHostSessions({
  app,
  spawn: spawnFixturePty,
  windows: () => windows,
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
const fail = createFontReadFailureHandler({
  releaseReads: releaseFontReads,
  writeError: (text) => process.stderr.write(text),
  complete: (code) => owner.complete(code),
});
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

function launchRequest() {
  return {
    kind: "explicit-command" as const,
    executable: nativeFixturePlatform.defaultShell,
    arguments:
      process.platform === "win32"
        ? [
            "-NoLogo",
            "-NoProfile",
            "-Command",
            "[Console]::WriteLine('READY'); while ($null -ne ($line=[Console]::ReadLine())) { [Console]::WriteLine('RECEIVED:'+$line) }",
          ]
        : [
            "-c",
            "stty -echo || exit 1; printf 'READY\\n'; while IFS= read -r line; do printf 'RECEIVED:%s\\n' \"$line\"; done",
          ],
  };
}

async function createFixture(step: FontReadStep) {
  await step(() => app.whenReady(), "Electron ready");
  const A = nativeFixturePlatform.configuredFontFamily;
  const B = nativeFixturePlatform.reloadedFontFamily;
  const received: FontReadResult[] = [];
  const port: IpcMainPort = {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, payload) => {
        const result = handler(event, payload);
        if (channel === terminalIpc.fontData) {
          const record: FontReadResult = {
            family: payload,
            status: "pending",
          };
          received.push(record);
          void Promise.resolve(result).then(
            () => {
              record.status = "fulfilled";
            },
            (error: unknown) => {
              record.status = "rejected";
              record.failure = fontReadFailure(error);
            },
          );
        }
        return result;
      });
    },
    on: (channel, listener) => {
      ipcMain.on(channel, listener);
    },
    removeHandler: (channel) => {
      ipcMain.removeHandler(channel);
    },
    removeListener: (channel, listener) => {
      ipcMain.removeListener(channel, listener);
    },
  };
  const loads: Array<string | undefined> = [];
  let activeLoads = 0;
  const router = registerTerminalIpcRouter(port, undefined, async (family) => {
    loads.push(family);
    activeLoads += 1;
    assert.equal(
      activeLoads,
      1,
      "One bounded load per window, including queued B",
    );
    try {
      const data: TerminalFontData = await loadTerminalFontData(family);
      assert.equal(data.configured?.family, family);
      if (family)
        assert.ok(
          data.configured!.data.byteLength > 0,
          "Real validated native bytes",
        );
      return data;
    } finally {
      activeLoads -= 1;
    }
  });
  const initial = {
    configuration: DEFAULT_USER_CONFIGURATION,
    userFileErrors: [],
  };
  let active: ActiveUserConfiguration = initial;
  const nativeSessionIndexes = new Map<string, number>();
  function createWindow() {
    const window = new BrowserWindow({
      ...terminalWindowOptions(
        path.join(root, "preload.cjs"),
        active.configuration,
        process.platform,
      ),
      show: false,
    });
    windows.push(window);
    let createdIndex: number | undefined;
    const controller = router.registerController({
      webContents: window.webContents,
      configuration: terminalRendererConfiguration(active, 0),
      createSession(callbacks) {
        const index = sessions.length;
        outputs[index] = [];
        const terminal = owner.createSession({
          shell: nativeFixturePlatform.defaultShell,
          launchRequest: launchRequest(),
          platform: process.platform,
          homeDirectory: root,
          environment: { ...process.env, HOME: root },
          applicationVersionProvider: app,
          onOutput(data) {
            outputs[index]!.push(data);
            callbacks.onOutput(data);
          },
          onExit(...args) {
            exited.add(index);
            callbacks.onExit(...args);
          },
        });
        sessions.push(terminal);
        createdIndex = index;
        return terminal;
      },
      onSessionStartError() {
        throw new Error("Unexpected PTY start failure");
      },
      onSessionExit() {},
      onSessionStarted(sessionId) {
        assert.notEqual(createdIndex, undefined);
        nativeSessionIndexes.set(`${window.id}:${sessionId}`, createdIndex!);
      },
      onSessionSelected() {},
      onTitleRequest() {},
      onBell() {},
      onUserInteraction() {},
      writeClipboardText() {},
      readClipboardText: () => "",
      confirmPaste: async () => true,
      showClipboardContextMenu() {},
      openExternalLink: async () => {},
      onExternalLinkOpenError() {},
      loadSnippets: async () => ({ snippets: [] }),
      loadLocalImage: async () => null,
    });
    registerTerminalWindowHost(window, controller, () => {});
    return window;
  }
  const configRoot = path.join(root, "configuration");
  mkdirSync(path.join(configRoot, "omxterm"), { recursive: true });
  const reloader = createUserConfigurationReloader({
    initial,
    ...terminalSurfaceFontBaseline(initial.configuration),
    load: () =>
      loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: configRoot },
        homeDirectory: root,
        platform: process.platform,
        getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
      }),
    apply(state) {
      active = state;
      router.applyConfiguration(terminalRendererConfiguration(state, 0));
    },
    activeTerminalSurfaceFontConfigurations:
      router.activeTerminalSurfaceFontConfigurations,
  });
  const window = createWindow();
  const evaluate = (
    script: string,
    label = "renderer evaluation",
  ): Promise<unknown> =>
    step(() => window.webContents.executeJavaScript(script), label);
  async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) {
    while (!(await step(predicate, label)))
      await step(
        () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
        label,
      );
  }
  const observe = async (script: string, label: string) =>
    fontReadRendererReady(
      (await evaluate(
        `({ ready: Boolean(${script}), mounts: readReloadEvidence.mounts.map(({status, cancelled}) => ({status, cancelled})) })`,
        label,
      )) as Parameters<typeof fontReadRendererReady>[0],
    );
  const wait = (script: string, label: string) =>
    waitFor(() => observe(script, label), label);
  async function reload(family: string) {
    await step(
      () =>
        writeFile(
          path.join(configRoot, "omxterm/config.json"),
          JSON.stringify({ version: 1, font: { family } }),
        ),
      "write isolated configuration",
    );
    await step(() => reloader.reload(), "validated configuration reload");
    assert.equal(
      active.configuration.fontFamily,
      family,
      "Real configuration validation/application succeeded",
    );
  }
  const command = () =>
    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  return {
    A,
    B,
    router,
    received,
    loads,
    window,
    reload,
    command,
    wait,
    waitFor,
    observe,
    evaluate,
    nativeSessionIndexes,
  };
}

async function run(step: FontReadStep) {
  const {
    A,
    B,
    router,
    received,
    loads,
    window,
    reload,
    command,
    wait,
    waitFor,
    observe,
    evaluate,
    nativeSessionIndexes,
  } = await step(() => createFixture(step), "fixture setup");
  try {
    await step(
      () => window.loadFile(path.join(root, "renderer/index.html")),
      "renderer load",
    );
    window.show();
    await wait(
      "readReloadEvidence.hostReady",
      "actual first-tab host command readiness",
    );
    await waitFor(async () => {
      await observe("true", "healthy initial Surface");
      return outputs[0]?.join("").includes("READY") ?? false;
    }, "healthy initial PTY ready");
    const healthy = sessions[0];

    // Two A consumers share one physical read; B queues behind that held read.
    const evidence = { received, loads, gateEntered: false, bQueued: false };
    await reload(A);
    const gate = holdFontRead();
    void gate.entered.then(() => {
      evidence.gateEntered = true;
    });
    command();
    command();
    await waitFor(async () => {
      await observe("true", "pending A Surfaces");
      return evidence.gateEntered;
    }, "held physical A read entered");
    await waitFor(async () => {
      await observe("true", "pending A Surface owners");
      return router.activeTerminalSurfaceFontConfigurations().length === 3;
    }, "both pending A Surface owners retained");
    assert.equal(sessions.length, 1, "No PTY before actual read completes");
    assert.deepEqual(loads, [undefined, A]);
    assert.deepEqual(router.activeTerminalSurfaceFontConfigurations(), [
      { fontLineHeight: 1 },
      { fontFamily: A, fontLineHeight: 1 },
      { fontFamily: A, fontLineHeight: 1 },
    ]);
    await reload(B);
    command();
    await waitFor(async () => {
      await observe("true", "B request queued");
      return received.some((record) => record.family === B);
    }, "B reaches production main request boundary");
    assert.deepEqual(
      loads,
      [undefined, A],
      "B load serialized behind physical A read",
    );
    assert.deepEqual(
      received,
      [
        { family: undefined, status: "fulfilled" },
        { family: A, status: "pending" },
        { family: B, status: "pending" },
      ],
      "Exact held-read and B-queued admission preconditions",
    );
    evidence.bQueued = true;
    gate.release();
    await waitFor(async () => {
      // A-only supersession is classified after B settles, before its failed
      // mounts veto the intentional mutation. All unrelated request errors fail now.
      if (
        received.length > 3 ||
        received.some(
          (record) =>
            record.status === "rejected" &&
            !(record.family === A && record.failure === "superseded"),
        )
      )
        assertFontReadResults(A, B, evidence);
      if (
        !received.some(
          (record) =>
            record.family === A &&
            record.status === "rejected" &&
            record.failure === "superseded",
        )
      )
        await observe("true", "font result Surface health");
      return (
        received.length === 3 &&
        received.every((record) => record.status !== "pending")
      );
    }, "actual main request results");
    assertFontReadResults(A, B, evidence);
    await wait(
      "readReloadEvidence.mounts.length === 4 && readReloadEvidence.mounts.every(record => record.status === 'mounted')",
      "both A and B real Surfaces mount",
    );
    assert.equal(windows.length, 1);
    assert.equal(sessions.length, 4);
    assert.equal(
      sessions[0],
      healthy,
      "Healthy native session identity retained",
    );
    assert.deepEqual(
      await evaluate(
        "readReloadEvidence.mounts.map(({family, lineHeight}) => [family, lineHeight])",
      ),
      [
        [undefined, 1],
        [A, 1],
        [A, 1],
        [B, 1],
      ],
    );
    assert.deepEqual(
      await evaluate(
        "readReloadEvidence.mounts.slice(1).map(record => record.fontName)",
      ),
      [A, A, B],
    );
    const sessionIds = (await evaluate(
      "readReloadEvidence.sessionIds",
    )) as unknown[];
    assert.equal(sessionIds.length, 4);
    assert.ok(sessionIds.every((id) => typeof id === "string"));
    assert.equal(new Set(sessionIds).size, 4);
    const indexes = sessionIds.map((id) =>
      nativeSessionIndexes.get(`${window.id}:${String(id)}`),
    );
    assert.deepEqual(
      indexes.toSorted(),
      [0, 1, 2, 3],
      "Four distinct actual Surface start receipts, regardless of completion order",
    );
    assert.equal(
      indexes[0],
      0,
      "Default Surface still owns the original native session",
    );
    assert.equal(nativeSessionIndexes.size, 4);
    assert.equal(exited.size, 0, "All four native sessions must still be live");
    assertFontReadResults(A, B, evidence);
    assert.equal(
      fontReadHandles.opened,
      fontReadHandles.closed,
      "Every real native font handle closed",
    );
  } finally {
    router.dispose();
  }
  writeSync(
    1,
    fontReadReloadResultPrefix +
      JSON.stringify({
        acceptedA: true,
        queuedB: true,
        sessions: sessions.length,
        mountedSurfaces: 4,
        handlesClosed: true,
      }) +
      "\n",
  );
}
// The local scenario deadline never substitutes for the existing native exits.
void runFontReadScenario(run)
  .then(() => owner.complete(0))
  .catch(fail);
