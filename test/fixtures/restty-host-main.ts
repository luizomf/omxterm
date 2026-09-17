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
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
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
const inputs: string[][] = [];
const deliverOutputs: Array<(data: string) => void> = [];
const resizes: Array<Array<{ cols: number; rows: number }>> = [];
const launchKinds: string[] = [];
const terminals: Array<ReturnType<typeof createLocalTerminalSession>> = [];
const ended: Array<{ closeRequested: boolean; liveSessions: number }> = [];
let clipboardReads = 0;
let clipboardWrites = 0;
let protectedPasteConfirmations = 0;
let contextMenus = 0;
let externalLinks = 0;
let titles = 0;
let bells = 0;
let navigations = 0;
let openedWindows = 0;
let permissionRequests = 0;
let ptyExits = 0;
let sessionIndex = 0;
const configuredFontFamily =
  process.platform === "darwin"
    ? "Helvetica"
    : process.platform === "win32"
      ? "Consolas"
      : "DejaVu Sans";
const reloadedFontFamily =
  process.platform === "darwin"
    ? "Times New Roman"
    : process.platform === "win32"
      ? "Courier New"
      : "Liberation Mono";

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

function createHost(window: BrowserWindow) {
  const router = registerTerminalIpcRouter(
    ipcMain as unknown as IpcMainPort,
    undefined,
    async (family) => {
      if (family !== configuredFontFamily && family !== reloadedFontFamily)
        throw new Error("Unexpected configured font request");
      const data = await installedFontData(family);
      if (!data) throw new Error("Configured native fixture font is missing");
      return {
        configured: { family, data },
        fallbacks: await installedFallbackFontData(),
      };
    },
  );
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
      inputs[index] = [];
      deliverOutputs[index] = callbacks.onOutput;
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
      const write = terminal.write.bind(terminal);
      const routedTerminal = {
        ...terminal,
        write(data: string) {
          inputs[index]!.push(data);
          write(data);
        },
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
    onSessionStarted() {
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
    confirmPaste: async () => {
      protectedPasteConfirmations += 1;
      return true;
    },
    showClipboardContextMenu() {
      contextMenus += 1;
    },
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
  const initialConfiguration = {
    ...DEFAULT_USER_CONFIGURATION,
    fontFamily: configuredFontFamily,
  };
  const changedConfiguration = {
    ...DEFAULT_USER_CONFIGURATION,
    fontFamily: reloadedFontFamily,
    fontLineHeight: 1.25,
    fontSize: 18,
  };
  const reloads = [changedConfiguration, initialConfiguration];
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initialConfiguration, userFileErrors: [] },
    load: async () => ({ configuration: reloads.shift()! }),
    apply: (state) =>
      controller.applyConfiguration(
        terminalRendererConfiguration(state, 0, "restty"),
      ),
    resttyRestartBaseline: {
      fontFamily: configuredFontFamily,
      fontLineHeight: 1,
    },
    activeResttySurfaceFontConfigurations: () =>
      router.activeResttySurfaceFontConfigurations(),
  });
  return { reloader };
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

    const { reloader } = createHost(window);

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

    const canvasBounds = (await window.webContents.executeJavaScript(
      "(() => { const bounds = document.querySelector('.restty-terminal-surface canvas')?.getBoundingClientRect(); return bounds ? { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) } : null })()",
      true,
    )) as { x: number; y: number; width: number; height: number } | null;
    if (!canvasBounds) throw new Error("Restty canvas bounds are unavailable");
    const paintedPixels = async () => {
      const bitmap = (
        await window.webContents.capturePage(canvasBounds)
      ).toBitmap();
      let painted = 0;
      for (let offset = 0; offset < bitmap.length; offset += 4)
        if (
          bitmap[offset] !== 0 ||
          bitmap[offset + 1] !== 0 ||
          bitmap[offset + 2] !== 0
        )
          painted += 1;
      return painted;
    };
    deliverOutputs[0]!("\u001b[2J\u001b[H\u001b[?25l");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const blankPaintedPixels = await paintedPixels();
    deliverOutputs[0]!("WWW");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const configuredPaintedPixels = await paintedPixels();
    deliverOutputs[0]!("\r\n漢");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cjkPaintedPixels = await paintedPixels();
    deliverOutputs[0]!("\r\n🙂⌘");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const fallbackPaintedPixels = await paintedPixels();

    await window.webContents.insertText("printf '__DEFAULT_INPUT__Olá🙂\\n'");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await waitFor(
      () => outputs[0]!.join("").includes("__DEFAULT_INPUT__Olá🙂"),
      "default shell Unicode input/output",
    );

    window.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "V",
      modifiers: ["control"],
    });
    window.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "V",
      modifiers: ["control"],
    });
    await waitFor(
      () => inputs[0]!.join("").includes("\u0016"),
      "bare Ctrl+V terminal input",
    );
    terminals[0]!.write("x\u0015");

    const largePasteLength = 80_000;
    await window.webContents.executeJavaScript(
      `(() => {
        const text = "printf '__LARGE_PASTE__${largePasteLength}\\n'; #" + "A".repeat(${largePasteLength}) + "\\n";
        const target = document.querySelector('.restty-terminal-surface textarea');
        if (!target) throw new Error('Restty paste target is missing');
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { getData: (type) => type === 'text/plain' ? text : '' } });
        target.dispatchEvent(event);
      })()`,
      true,
    );
    await waitFor(
      () => outputs[0]!.join("").includes(`__LARGE_PASTE__${largePasteLength}`),
      "large DOM paste through the owned PTY",
    );

    window.webContents.send(terminalIpc.clipboardAction, "paste");
    await waitFor(
      () => inputs[0]!.join("").includes("private"),
      "native Paste host route",
    );
    terminals[0]!.write("\u0003");
    deliverOutputs[0]!("selected output");
    window.webContents.send(terminalIpc.clipboardAction, "select-all");
    window.webContents.send(terminalIpc.clipboardAction, "copy");
    await waitFor(() => clipboardWrites >= 1, "explicit copy host route");
    await window.webContents.executeJavaScript(
      `document.querySelector('.restty-terminal-surface')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
      true,
    );
    await waitFor(() => contextMenus === 1, "native context menu route");

    await reloader.reload();
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
    await reloader.reload();
    const reloadState = (await window.webContents.executeJavaScript(
      "({ fonts: [...document.querySelectorAll('.restty-terminal-surface')].map((element) => element.dataset.resttyFont), notice: document.querySelector('#user-file-errors')?.textContent ?? '' })",
      true,
    )) as { fonts: string[]; notice: string };
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
    terminals[0]!.close();
    await waitFor(
      () =>
        ended.some(
          (entry) => !entry.closeRequested && entry.liveSessions === 0,
        ),
      "owned default-shell termination",
    );
    window.webContents.send(terminalIpc.tabCommand, {
      action: "close-session",
      sessionId: "s1",
    });

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
      renderedPixels: {
        blank: blankPaintedPixels,
        configured: configuredPaintedPixels,
        cjk: cjkPaintedPixels,
        emojiAndSymbol: fallbackPaintedPixels,
      },
      reloadState,
      clipboardReads,
      clipboardWrites,
      protectedPasteConfirmations,
      contextMenus,
      largePasteLength,
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
