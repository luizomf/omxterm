import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { usesOptionalSnippets } from "../../src/shared/snippets-mode";
import { registerExtensionViewScheme } from "../../src/main/extension-view-host";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { startFixtureSnippetsHost } from "./fixture-snippets-host";
import { spawnFixturePty } from "./native-fixture-pty";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";
import { initialTabRemovalReadiness } from "./tab-removal-initial-readiness";
import {
  createTabRemovalReadiness,
  TAB_REMOVAL_CONTROL_PREFIX,
} from "./tab-removal-readiness";

const control = process.argv
  .find((arg) => arg.startsWith("--tab-removal-control="))
  ?.slice("--tab-removal-control=".length);
assert.ok(
  control === undefined ||
    [
      "held-surface",
      "held-registration",
      "early-command",
      "held-renderer",
    ].includes(control),
  "Unknown tab removal control",
);

const positive = process.argv.includes("--tab-removal-positive");
const optionalSnippets =
  positive && usesOptionalSnippets(process.platform, process.arch);
assert.ok(!positive || control === undefined || control === "held-surface");
if (optionalSnippets) registerExtensionViewScheme();

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
let snippetsHost:
  Awaited<ReturnType<typeof startFixtureSnippetsHost>> | undefined;
let snippetsSetup: Promise<void> | undefined;
let completion: Promise<void> | undefined;
let completionCode = 0;
let ptyDrainStarted = false;
// The existing PTY owner normally exits directly on these events. Optional
// Snippets adds a backend owner, so route every exit path through its join first.
const fixtureApp = optionalSnippets
  ? ({
      on(event: string, listener: (...args: never[]) => void) {
        if (event === "window-all-closed")
          app.on("window-all-closed", listener);
        else if (event === "before-quit")
          app.on("before-quit", (event) => {
            event.preventDefault();
            void complete(1);
          });
      },
      exit: (code: number) => app.exit(code),
    } as unknown as Parameters<typeof createResttyHostSessions>[0]["app"])
  : app;
const fixtureSignals = optionalSnippets
  ? {
      on(signal: "SIGINT" | "SIGTERM") {
        process.on(
          signal,
          () => void complete(signal === "SIGINT" ? 130 : 143),
        );
      },
    }
  : process;
const owner = createResttyHostSessions({
  app: fixtureApp,
  spawn: spawnFixturePty,
  windows: () => windows,
  signals: fixtureSignals,
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
    | "host-ready-surface-pending"
    | "surface-released",
) => writeSync(1, `${TAB_REMOVAL_CONTROL_PREFIX}${name}\n`);
function complete(code: number): Promise<void> {
  if (code !== 0) {
    completionCode = code;
    // Once the PTY owner is draining, it owns the final exit status too.
    if (ptyDrainStarted) void owner.complete(code);
  }
  completion ??= (async () => {
    await snippetsSetup?.catch(() => {});
    if (snippetsHost) {
      if (!(await snippetsHost.dispose()))
        throw new Error("Snippets backend or view retirement was not settled");
      writeSync(1, "__OMXTERM_TAB_REMOVAL_SNIPPETS__joined\n");
    }
    ptyDrainStarted = true;
    await owner.complete(completionCode);
  })().catch((error: unknown) => {
    process.stderr.write(`Fixture ownership not settled: ${String(error)}\n`);
    process.exitCode = 1;
    // Keep the owner alive. The supervisor retains responsibility for the
    // registered process tree; never report an unjoined backend as success.
    return new Promise<never>(() => {});
  });
  return completion;
}
function fail(error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void complete(1);
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
  if (completion) throw new Error("Fixture is completing");
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
  if (completion) throw new Error("Fixture is completing");
  window.webContents.on("console-message", (details) => {
    if (details.message === `${TAB_REMOVAL_CONTROL_PREFIX}actual-surface-held`)
      markControl("actual-surface-held");
    if (
      details.message === `${TAB_REMOVAL_CONTROL_PREFIX}held-renderer-boundary`
    )
      markControl("held-renderer-boundary");
  });
  await registerHost(window);
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
  await complete(0);
}

async function registerHost(window: BrowserWindow) {
  if (completion) throw new Error("Fixture is completing");
  const router = registerTerminalIpcRouter(ipcMain);
  if (optionalSnippets) {
    snippetsSetup = startFixtureSnippetsHost(root, window, router).then(
      (host) => {
        snippetsHost = host;
      },
    );
    await snippetsSetup;
    if (completion) throw new Error("Fixture is completing");
  }
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
    onSessionStarted(sessionId) {
      snippetsHost?.started(sessionId);
    },
    onSessionSelected(sessionId) {
      selected = sessionId ?? "";
      snippetsHost?.selected(sessionId);
    },
    onSessionStartError() {
      throw new Error("Unexpected fixture spawn failure");
    },
    onSessionExit(_exit, context) {
      snippetsHost?.ended(context.sessionId);
    },
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
    loadSnippets: () =>
      loadTerminalSnippets({
        environment: process.env,
        homeDirectory: root,
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
  await initialTabRemovalReadiness(window.webContents, {
    control,
    selected: () => selected,
    sessionCount: () => sessions.length,
    readiness,
    mark: markControl,
  });
  if (snippetsHost) {
    await snippetsHost.install();
    writeSync(1, "__OMXTERM_TAB_REMOVAL_SNIPPETS__installed\n");
  }
  if (completion) throw new Error("Fixture is completing");
  for (const count of [2, 3]) {
    if (completion) throw new Error("Fixture is completing");
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
      "globalThis.originalCanvases = [...document.querySelectorAll('.terminal-surface canvas')]; if (originalCanvases.length !== 3 || new Set(originalCanvases).size !== 3) throw Error('Expected three distinct Surfaces')",
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
    same: document.querySelectorAll('.terminal-surface canvas').length === 2 && [...document.querySelectorAll('.terminal-surface canvas')].every((canvas, index) => canvas === globalThis.originalCanvases[index]) && !globalThis.originalCanvases[2].isConnected,
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
  const outputOffset = outputs[0]!.join("").length;
  const snippetInputOffset = inputs[0]!.length;
  if (completion) throw new Error("Fixture is completing");
  if (snippetsHost) {
    snippetsHost.toggle();
    const hosted = () =>
      window.contentView.children.filter(
        (view): view is WebContentsView =>
          view instanceof WebContentsView &&
          !view.webContents.isDestroyed() &&
          view.webContents.getURL().startsWith("omx-extension://"),
      );
    await waitFor("snippet-loaded", async () => {
      const views = hosted();
      return (
        views.length === 1 &&
        views[0]!.getVisible() &&
        views[0]!.webContents.isFocused() &&
        (await views[0]!.webContents.executeJavaScript(
          "document.querySelectorAll('li .snippet-activate').length === 1",
        )) === true
      );
    });
    snippetsHost.assertActivated();
    writeSync(1, "__OMXTERM_TAB_REMOVAL_SNIPPETS__activated\n");
    await step("snippet-click", () =>
      hosted()[0]!.webContents.executeJavaScript(
        "document.querySelector('li .snippet-activate').click()",
        true,
      ),
    );
  } else {
    window.webContents.send(terminalIpc.snippetsToggle);
    await waitFor("snippet-loaded", () =>
      evaluate<boolean>(
        "!!document.querySelector('#snippets-sidebar li .snippet-activate')",
      ),
    );
    await step("snippet-click", () =>
      evaluate(
        "document.querySelector('#snippets-sidebar li .snippet-activate').click()",
      ),
    );
  }
  const snippetReceipts = () =>
    outputs[0]!
      .join("")
      .slice(outputOffset)
      .match(/RECEIVED:snippet\r?\n/g)?.length ?? 0;
  await waitFor("snippet-delivered", () => snippetReceipts() === 1);
  await waitFor(
    "snippet-focus",
    async () =>
      window.webContents.isFocused() &&
      (await evaluate<boolean>(
        "document.querySelector('.terminal-surface').contains(document.activeElement)",
      )) &&
      window.webContents.isFocused(),
  );
  await step("verification", async () => {
    assert.equal(received(1), "");
    assert.equal(received(2), "");
    assert.equal(
      inputs[0]!.slice(snippetInputOffset).join("").split("snippet").length - 1,
      1,
    );
    assert.equal(snippetReceipts(), 1);
    assert.equal(
      await evaluate(`(() => {
      const canvases = [...document.querySelectorAll('.terminal-surface canvas')];
      return canvases.length === 2 && canvases.every((canvas, index) => canvas === globalThis.originalCanvases[index]) &&
        !globalThis.originalCanvases[2].isConnected &&
        document.querySelector('.terminal-surface').contains(document.activeElement);
    })()`),
      true,
      "same Surfaces and A focus survive Snippets delivery",
    );
    assert.equal(
      window.webContents.isFocused(),
      true,
      "core WebContents retains native focus after Snippets delivery",
    );
    assert.equal(selected, "s1");
    assert.deepEqual(exited, [2]);
    assert.equal(sessions.length, 3);
    assert.equal(clipboardReads, 1);
  });
}
void run().catch(fail);
