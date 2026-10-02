import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { spawnFixturePty } from "./native-fixture-pty";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";
import {
  createTabRemovalReadiness,
  TAB_REMOVAL_CONTROL_PREFIX,
} from "./tab-removal-readiness";

const control = process.argv
  .find((arg) => arg.startsWith("--tab-removal-control="))
  ?.slice("--tab-removal-control=".length);
assert.ok(
  control === undefined ||
    ["held-surface", "early-command", "held-renderer"].includes(control),
  "Unknown tab removal control",
);

const root = __dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
const sessions: LocalTerminalSession[] = [];
const inputs: string[][] = [];
const outputs: string[][] = [];
const exited: number[] = [];
let selected = "";
let clipboardReads = 0;
const owner = createResttyHostSessions({
  app,
  spawn: spawnFixturePty,
  windows: () => windows,
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
const readiness = createTabRemovalReadiness(
  () => {
    const window = windows[0];
    return {
      sessionCount: sessions.length,
      initialSelected: selected === "s1",
      backgroundExited: exited.includes(2),
      native:
        window && !window.isDestroyed()
          ? {
              visible: window.isVisible(),
              minimized: window.isMinimized(),
              focused: window.isFocused(),
            }
          : null,
    };
  },
  (line) => {
    writeSync(1, line);
  },
);
const { waitFor, step } = readiness;
const markControl = (
  name:
    | "actual-surface-held"
    | "held-renderer-boundary"
    | "early-command-observed"
    | "readiness-pending"
    | "surface-released",
) => writeSync(1, `${TAB_REMOVAL_CONTROL_PREFIX}${name}\n`);
function fail(error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void owner.complete(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

function launchRequest(index: number) {
  const script =
    process.platform === "win32"
      ? index === 2
        ? "[Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; Start-Sleep -Milliseconds 300"
        : "[Console]::WriteLine('READY'); while ($null -ne ($line=[Console]::ReadLine())) { [Console]::WriteLine('RECEIVED:'+$line) }"
      : index === 2
        ? "printf 'READY\\n'; IFS= read -r line; sleep 0.3"
        : "printf 'READY\\n'; while IFS= read -r line; do printf 'RECEIVED:%s\\n' \"$line\"; done";
  return {
    kind: "explicit-command" as const,
    executable: nativeFixturePlatform.defaultShell,
    arguments:
      process.platform === "win32"
        ? ["-NoLogo", "-NoProfile", "-Command", script]
        : ["-c", script],
  };
}

async function run() {
  await step("app-ready", () => app.whenReady());
  const window = await step("window", async () => {
    const created = new BrowserWindow({
      ...terminalWindowOptions(
        path.join(root, "preload.cjs"),
        DEFAULT_USER_CONFIGURATION,
        process.platform,
      ),
      show: false,
    });
    windows.push(created);
    return created;
  });
  window.webContents.on("console-message", (details) => {
    if (details.message === `${TAB_REMOVAL_CONTROL_PREFIX}actual-surface-held`)
      markControl("actual-surface-held");
    if (
      details.message === `${TAB_REMOVAL_CONTROL_PREFIX}held-renderer-boundary`
    )
      markControl("held-renderer-boundary");
  });
  registerHost(window);
  await exerciseRemoval(window);
  writeSync(
    1,
    "__OMXTERM_TAB_REMOVAL_RESULT__" +
      JSON.stringify({
        preservedSelection: true,
        sameSurfaces: true,
        paste: true,
        nativeKeyboard: true,
        snippet: true,
        backgroundIsolated: true,
      }) +
      "\n",
  );
  await owner.complete(0);
}

function registerHost(window: BrowserWindow) {
  const router = registerTerminalIpcRouter(ipcMain);
  const controller = router.registerController({
    webContents: window.webContents,
    configuration: terminalRendererConfiguration(
      { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
      0,
    ),
    createSession(callbacks) {
      const index = sessions.length;
      inputs[index] = [];
      outputs[index] = [];
      const terminal = owner.createSession({
        shell: nativeFixturePlatform.defaultShell,
        launchRequest: launchRequest(index),
        platform: process.platform,
        homeDirectory: root,
        environment: { ...process.env, HOME: root },
        applicationVersionProvider: app,
        onOutput(data) {
          outputs[index]!.push(data);
          callbacks.onOutput(data);
        },
        onExit(exit, kind) {
          if (index === 2) assert.deepEqual(exit, { exitCode: 0, signal: 0 });
          exited.push(index);
          callbacks.onExit(exit, kind);
        },
      });
      sessions.push(terminal);
      return {
        ...terminal,
        write(data) {
          inputs[index]!.push(data);
          terminal.write(data);
        },
      };
    },
    onSessionStarted() {},
    onSessionSelected(sessionId) {
      selected = sessionId;
    },
    onSessionStartError() {
      throw new Error("Unexpected fixture spawn failure");
    },
    onSessionExit() {},
    onTitleRequest() {},
    onBell() {},
    onUserInteraction() {},
    writeClipboardText() {},
    readClipboardText() {
      clipboardReads += 1;
      return "paste";
    },
    confirmPaste: async () => true,
    showClipboardContextMenu() {},
    openExternalLink: async () => {},
    onExternalLinkOpenError() {},
    loadSnippets: async () => ({
      snippets: [{ name: "Synthetic", body: "snippet", execute: true }],
    }),
    loadLocalImage: async () => null,
  });
  registerTerminalWindowHost(window, controller, () => router.dispose());
}

async function exerciseRemoval(window: BrowserWindow) {
  await step("load", () =>
    window.loadFile(path.join(root, "renderer", "index.html"), {
      query: { tabRemovalControl: control ?? "ordinary" },
    }),
  );
  window.show();
  window.focus();
  await waitFor(
    "first-program",
    () => sessions.length === 1 && outputs[0]!.join("").includes("READY"),
  );
  await initialReadiness(window);
  for (const count of [2, 3]) {
    if (!(count === 2 && control === "early-command"))
      window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor(
      count === 2 ? "second-program" : "third-program",
      () =>
        sessions.length === count &&
        outputs[count - 1]!.join("").includes("READY"),
    );
  }
  const evaluate = async <T>(script: string): Promise<T> =>
    (await window.webContents.executeJavaScript(script, true)) as T;
  await step("save-canvases", () =>
    evaluate(
      "globalThis.originalCanvases = [...document.querySelectorAll('.terminal-surface canvas')]",
    ),
  );
  window.webContents.send(terminalIpc.tabCommand, {
    action: "select",
    position: 1,
  });
  await waitFor("select-a", () => selected === "s1");
  // C exits itself after input and a delay; no close-session command or kill.
  sessions[2]!.write("\r");
  await waitFor(
    "background-exit",
    async () =>
      exited.includes(2) &&
      (await evaluate<boolean>(
        "document.querySelectorAll('.terminal-surface').length === 2",
      )),
  );
  // ConPTY exchanges capability/focus replies during startup and tab selection.
  // Assert new user delivery, not the protocol traffic preceding the action.
  const inputOffsets = inputs.map((input) => input.length);
  const received = (index: number) =>
    inputs[index]!.slice(inputOffsets[index]).join("");
  window.webContents.send(terminalIpc.clipboardAction, "paste");
  await waitFor("paste", () =>
    inputs.some((_, index) => received(index).includes("paste")),
  );
  await step("selection-identity", async () => {
    assert.equal(
      selected,
      "s1",
      "background exit preserves selected session A",
    );
    assert.equal(
      received(0),
      "paste",
      "Paste reaches A's existing Surface/Adapter",
    );
    assert.equal(received(1), "", "Paste never reaches B");
    assert.deepEqual(
      await evaluate(`({
    same: [...document.querySelectorAll('.terminal-surface canvas')].every((canvas, index) => canvas === globalThis.originalCanvases[index]),
    selected: [...document.querySelectorAll('[role=tab]')].map(tab => tab.getAttribute('aria-selected')),
    focused: document.querySelector('.terminal-surface').contains(document.activeElement)
  })`),
      { same: true, selected: ["true", "false"], focused: true },
    );
  });
  // Chromium native input delivery, not a renderer-dispatched KeyboardEvent.
  const key = (keyCode: string) => {
    for (const type of ["keyDown", "char", "keyUp"] as const)
      window.webContents.sendInputEvent({ type, keyCode });
  };
  key("\r");
  await waitFor("pasted-line", () =>
    outputs[0]!.join("").includes("RECEIVED:paste"),
  );
  key("k");
  key("\r");
  await waitFor("native-keyboard", () =>
    outputs[0]!.join("").includes("RECEIVED:k"),
  );
  window.webContents.send(terminalIpc.snippetsToggle);
  await waitFor("snippet-loaded", () =>
    evaluate<boolean>(
      "!!document.querySelector('#snippets-sidebar li button')",
    ),
  );
  await step("snippet-click", () =>
    evaluate("document.querySelector('#snippets-sidebar li button').click()"),
  );
  await waitFor("snippet-delivered", () =>
    outputs[0]!.join("").includes("RECEIVED:snippet"),
  );
  await step("verification", async () => {
    assert.equal(received(1), "");
    assert.equal(selected, "s1");
    assert.deepEqual(exited, [2]);
    assert.equal(sessions.length, 3);
    assert.equal(clipboardReads, 1);
  });
}
interface SurfaceControlState {
  heldSurface: boolean;
  newCommands: number;
}
const controlState = (window: BrowserWindow) =>
  window.webContents.executeJavaScript(
    "globalThis.__omxtermTabRemovalControl.state()",
    true,
  ) as Promise<SurfaceControlState>;
async function initialReadiness(window: BrowserWindow) {
  if (control === "early-command") {
    // First establish the real return hold, then issue the actual unsafe command.
    await waitFor(
      "control-held-surface",
      async () => (await controlState(window)).heldSurface,
    );
    assert.equal(selected, "");
    assert.equal(sessions.length, 1);
    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await releaseAfterEarlyCommand(window);
    return;
  }
  let completed = false;
  const gate = readiness
    .initial(
      () => selected === "s1",
      () =>
        window.webContents.executeJavaScript(
          control === "held-renderer"
            ? "globalThis.__omxtermTabRemovalControl.holdRendererBoundary()"
            : "true",
          true,
        ),
    )
    .then(() => {
      completed = true;
    });
  // Observe the gate below; consume a rejection if a separate control fails first.
  void gate.catch(() => {});
  if (control === "held-surface") {
    await waitFor(
      "control-held-surface",
      async () => (await controlState(window)).heldSurface,
    );
    await step("control-held-surface", async () => {
      const state = await controlState(window);
      assert.equal(selected, "");
      assert.equal(completed, false);
      assert.equal(sessions.length, 1);
      assert.equal(state.newCommands, 0);
      markControl("readiness-pending");
    });
    await releaseSurface(window);
  }
  await gate;
}
async function releaseSurface(window: BrowserWindow) {
  await step("control-release-surface", () =>
    window.webContents.executeJavaScript(
      "globalThis.__omxtermTabRemovalControl.release()",
      true,
    ),
  );
  markControl("surface-released");
}
async function releaseAfterEarlyCommand(window: BrowserWindow) {
  await waitFor("control-held-surface", async () => {
    const state = await controlState(window);
    return state.heldSurface && state.newCommands === 1;
  });
  assert.equal(selected, "");
  markControl("early-command-observed");
  await releaseSurface(window);
}
void run().catch(fail);
