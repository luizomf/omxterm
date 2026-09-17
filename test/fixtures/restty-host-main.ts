import { app, BrowserWindow, ipcMain, session } from "electron";
import * as nodePty from "node-pty";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  installedFallbackFontData,
  installedFontData,
} from "../../src/main/installed-font-family";

const prefix = "__OMXTERM_RESTTY_HOST_RESULT__";
const root = __dirname;
const home = path.join(root, "home");
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
mkdirSync(home, { recursive: true });

const outputs: string[][] = [];
const resizes: Array<Array<{ cols: number; rows: number }>> = [];
const launchKinds: string[] = [];
const terminals: Array<ReturnType<typeof createLocalTerminalSession>> = [];
const ended: Array<{ closeRequested: boolean; liveSessions: number }> = [];
let clipboardReads = 0;
let clipboardWrites = 0;
let externalLinks = 0;
let titles = 0;
let bells = 0;
let navigations = 0;
let openedWindows = 0;
let permissionRequests = 0;
let ptyExits = 0;
const configuredFontFamily =
  process.platform === "darwin"
    ? "Helvetica"
    : process.platform === "win32"
      ? "Consolas"
      : "DejaVu Sans";

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => {
        permissionRequests += 1;
        callback(false);
      },
    );

    // Keep Electron alive long enough to observe cleanup after the tested
    // renderer's owning BrowserWindow is destroyed.
    const keeper = new BrowserWindow({ show: false });
    const window = new BrowserWindow({
      width: 900,
      height: 600,
      show: true,
      webPreferences: {
        preload: path.join(root, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => {
      openedWindows += 1;
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event) => {
      navigations += 1;
      event.preventDefault();
    });

    const router = registerTerminalIpcRouter(
      ipcMain as unknown as IpcMainPort,
      undefined,
      async (family) => {
        if (family !== configuredFontFamily)
          throw new Error("Unexpected configured font request");
        const data = await installedFontData(family);
        if (!data) throw new Error("Configured native fixture font is missing");
        return {
          configured: { family, data },
          fallbacks: await installedFallbackFontData(),
        };
      },
    );
    let sessionIndex = 0;
    const controller = router.registerController({
      configuration: terminalRendererConfiguration(
        {
          configuration: {
            ...DEFAULT_USER_CONFIGURATION,
            fontFamily: configuredFontFamily,
          },
          userFileErrors: [],
        },
        0,
        "restty",
      ),
      webContents: window.webContents,
      createSession(callbacks) {
        const index = sessionIndex++;
        outputs[index] = [];
        resizes[index] = [];
        const explicit = index === 1;
        const terminal = createLocalTerminalSession(nodePty.spawn, {
          shell: "/bin/sh",
          ...(explicit
            ? {
                launchRequest: {
                  kind: "explicit-command" as const,
                  executable: "/bin/sh",
                  arguments: [
                    "-c",
                    "printf '__EXPLICIT_READY__Olá🙂\\n\\033]0;blocked-title\\007\\007\\033]52;c;dW5zYWZl\\007\\033]8;;https://example.com\\007https://example.com\\033]8;;\\007'; IFS= read -r line; printf '__EXPLICIT_INPUT__%s\\n' \"$line\"; sleep 30",
                  ],
                },
              }
            : {}),
          platform: process.platform,
          homeDirectory: home,
          applicationVersionProvider: app,
          environment: { ...process.env, HOME: home },
          onOutput(data) {
            outputs[index]!.push(data);
            callbacks.onOutput(data);
          },
          onExit(exit, launchKind) {
            ptyExits += 1;
            callbacks.onExit(exit, launchKind);
          },
        });
        const resize = terminal.resize.bind(terminal);
        const routedTerminal = {
          ...terminal,
          resize(size: { cols: number; rows: number }) {
            resizes[index]!.push(size);
            resize(size);
          },
        };
        terminals[index] = routedTerminal;
        return routedTerminal;
      },
      onSessionStartError() {
        throw new Error("Unexpected PTY start failure");
      },
      onSessionExit(_exit, context) {
        ended.push({
          closeRequested: context.closeRequested,
          liveSessions: context.liveSessions,
        });
      },
      onSessionStarted(_sessionId, _fallbackTitle) {
        launchKinds.push(
          sessionIndex === 2 ? "explicit-command" : "default-shell",
        );
      },
      onSessionSelected() {},
      writeClipboardText() {
        clipboardWrites += 1;
      },
      readClipboardText() {
        clipboardReads += 1;
        return "private";
      },
      confirmPaste: async () => false,
      showClipboardContextMenu() {},
      onTitleRequest() {
        titles += 1;
      },
      onBell() {
        bells += 1;
      },
      onUserInteraction() {},
      async openExternalLink() {
        externalLinks += 1;
      },
      onExternalLinkOpenError() {},
      loadSnippets: async () => ({ snippets: [] }),
    });
    registerTerminalWindowHost(window, controller, () => router.dispose());

    await window.loadFile(path.join(root, "renderer", "index.html"));
    await waitFor(
      () => launchKinds.length === 1 && resizes[0]!.length > 0,
      "default Restty session",
    );
    window.focus();
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          "document.activeElement?.closest('.restty-terminal-surface') !== null",
          true,
        ),
      "initial terminal focus",
    );

    await window.webContents.insertText("printf '__DEFAULT_INPUT__Olá🙂\\n'");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await waitFor(
      () => outputs[0]!.join("").includes("__DEFAULT_INPUT__Olá🙂"),
      "default shell Unicode input/output",
    );

    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor(
      () => launchKinds.length === 2 && resizes[1]!.length > 0,
      "explicit-command Restty tab",
    );
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          "document.querySelectorAll('#tab-strip button').length === 2",
          true,
        ),
      "two isolated tabs",
    );
    await waitFor(
      () => outputs[1]!.join("").includes("__EXPLICIT_READY__Olá🙂"),
      "explicit command output",
    );
    await window.webContents.insertText("second🙂");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await waitFor(
      () => outputs[1]!.join("").includes("__EXPLICIT_INPUT__second🙂"),
      "selected-tab Unicode input isolation",
    );

    window.blur();
    window.focus();
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          "document.activeElement?.closest('.restty-terminal-surface') !== null",
          true,
        ),
      "returned focus",
    );

    window.webContents.send(terminalIpc.tabCommand, { action: "close" });
    await waitFor(
      () =>
        ended.some((entry) => entry.closeRequested && entry.liveSessions === 1),
      "explicit tab close cleanup",
    );
    terminals[0]!.write("exit\r");
    await waitFor(
      () =>
        ended.some(
          (entry) => !entry.closeRequested && entry.liveSessions === 0,
        ),
      "ordinary shell exit",
    );

    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor(
      () => launchKinds.length === 3 && resizes[2]!.length > 0,
      "renderer-loss session",
    );
    const beforeDestroy = (await window.webContents.executeJavaScript(
      "({ canvases: document.querySelectorAll('.restty-terminal-surface canvas').length, tabs: document.querySelectorAll('.terminal-surface').length })",
      true,
    )) as { canvases: number; tabs: number };
    const renderedFontFamily = (await window.webContents.executeJavaScript(
      "document.querySelector('.restty-terminal-surface')?.dataset.resttyFont ?? null",
      true,
    )) as string | null;
    window.webContents.forcefullyCrashRenderer();
    await waitFor(() => ptyExits === 3, "renderer-loss PTY cleanup");

    const result = {
      beforeDestroy,
      configuredFontFamily,
      renderedFontFamily,
      clipboardReads,
      clipboardWrites,
      externalLinks,
      titles,
      bells,
      navigations,
      openedWindows,
      permissionRequests,
      ptyExits,
      launchKinds,
      output: outputs.map((chunks) => chunks.join("")),
      resizeCounts: resizes.map((entries) => entries.length),
      ended,
      sessionStarts: sessionIndex,
    };
    writeSync(1, prefix + JSON.stringify(result) + "\n");
    keeper.destroy();
    app.exit(0);
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    app.exit(1);
  });
