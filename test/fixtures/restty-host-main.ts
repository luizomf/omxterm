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
import { exerciseExplicitResttyTab } from "./restty-host-explicit-tab";
import { exerciseResttyEvents } from "./restty-host-events";
import { exerciseResttyCapabilities } from "./restty-host-capabilities";
import { exerciseResttyBackendLoss } from "./restty-host-failures";
import { captureResttyFontPaintEvidence } from "./restty-host-paint";
import * as resttyImages from "./restty-host-images";
import {
  dispatchDomPaste,
  exerciseLargePasteThroughPty,
} from "./restty-host-paste";
import {
  explicitFixtureLaunchRequest,
  nativeFixturePlatform,
  selectionFixtureCommand,
} from "./restty-host-platform";
import {
  createOutputStressHarness,
  outputStressLaunchRequest,
} from "./restty-host-output-stress";

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
let selectAllCoveredScrollback = false;
let selectedUnicodeExactly = false;
let protectedPasteConfirmations = 0;
let contextMenus = 0;
const externalLinks: string[] = [];
const titleEvents: Array<{
  sessionId: string;
  fixture: "first" | "overlong" | "second" | "unexpected";
}> = [];
const bellSessionIds: string[] = [];
let titleQueryReplyBytes = 0;
let navigations = 0;
let openedWindows = 0;
let permissionRequests = 0;
let ptyExits = 0;
let sessionIndex = 0;
const outputStress = createOutputStressHarness();
const { defaultShell, configuredFontFamily, reloadedFontFamily } =
  nativeFixturePlatform;

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  const deadline = Date.now() + 120_000;
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
    ),
    webContents: window.webContents,
    createSession(callbacks) {
      const index = sessionIndex++;
      outputs[index] = [];
      inputs[index] = [];
      deliverOutputs[index] = callbacks.onOutput;
      resizes[index] = [];
      const explicit = index === 1;
      const stressLaunchRequest = outputStressLaunchRequest(index);
      const terminal = createLocalTerminalSession(nodePty.spawn, {
        shell: defaultShell,
        ...(stressLaunchRequest
          ? { launchRequest: stressLaunchRequest }
          : explicit
            ? {
                launchRequest: explicitFixtureLaunchRequest(),
              }
            : {}),
        platform: process.platform,
        homeDirectory: home,
        applicationVersionProvider: app,
        environment: { ...process.env, HOME: home },
        onOutput(data) {
          if (!outputStress.observeOutput(index, data))
            outputs[index]!.push(data);
          callbacks.onOutput(data);
        },
        onExit(exit, launchKind) {
          outputStress.observeExit(index, exit);
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
      launchKinds.push(terminals[sessionIndex - 1]!.launchKind!);
    },
    onSessionSelected() {},
    writeClipboardText(text) {
      clipboardWrites += 1;
      outputStress.observeClipboard(text);
      selectAllCoveredScrollback ||=
        text.includes("__SELECT_ALL_FIRST__") &&
        text.includes("__SELECT_ALL_LAST__");
      selectedUnicodeExactly ||= text.includes(
        "__UNICODE__A漢e\u0301❤️👩‍💻Z__END__",
      );
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
    onTitleRequest(sessionId, title) {
      titleEvents.push({
        sessionId,
        fixture:
          title === "first-title"
            ? "first"
            : title === `\ufeff${"z".repeat(256)}`
              ? "overlong"
              : title === "second-title"
                ? "second"
                : "unexpected",
      });
    },
    onBell(sessionId) {
      bellSessionIds.push(sessionId);
    },
    onUserInteraction() {},
    async openExternalLink(url) {
      externalLinks.push(url);
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
      controller.applyConfiguration(terminalRendererConfiguration(state, 0)),
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

    ({ titleQueryReplyBytes } = await exerciseResttyEvents({
      deliverOutput: deliverOutputs[0]!,
      input: () => inputs[0]!.join(""),
      eventCount: () => ({
        titles: titleEvents.length,
        bells: bellSessionIds.length,
      }),
      waitFor,
    }));

    const renderedPixels = await captureResttyFontPaintEvidence(
      window,
      deliverOutputs[0]!,
    );

    window.focus();
    window.webContents.focus();
    await window.webContents.executeJavaScript(
      "document.querySelector('.restty-terminal-surface canvas')?.focus()",
      true,
    );
    await window.webContents.executeJavaScript(
      `(() => {
        const input = document.querySelector('.restty-terminal-surface textarea');
        input.dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(nativeFixturePlatform.defaultInputCommand)}, inputType: 'insertText', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()`,
      true,
    );
    await waitFor(
      () => outputs[0]!.join("").includes("__DEFAULT_INPUT__Olá🙂"),
      "default shell Unicode input/output",
    );

    const capabilityReplies = await exerciseResttyCapabilities({
      deliverOutput: deliverOutputs[0]!,
      input: () => inputs[0]!.join(""),
      clearPtyInput: () => terminals[0]!.write("\u0015"),
      waitFor,
    });

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
    terminals[0]!.write(process.platform === "win32" ? "\u0003" : "x\u0015");

    if (process.platform !== "win32") {
      terminals[0]!.write("stty -echo; printf '__PASTE_ECHO_OFF__\\n'\r");
      await waitFor(
        () => outputs[0]!.join("").includes("__PASTE_ECHO_OFF__"),
        "owned PTY echo disable",
      );
    }
    const largePaste = await exerciseLargePasteThroughPty({
      window,
      write: (data) => terminals[0]!.write(data),
      output: () => outputs[0]!.join(""),
      waitFor,
    });

    window.webContents.send(terminalIpc.clipboardAction, "paste");
    await waitFor(
      () => inputs[0]!.join("").includes("private"),
      "native Paste host route",
    );
    terminals[0]!.write("\u0003");
    terminals[0]!.write(selectionFixtureCommand());
    await waitFor(
      () => outputs[0]!.join("").includes("__SELECT_ALL_LAST__"),
      "scrollback selection fixture",
    );
    window.webContents.send(terminalIpc.clipboardAction, "select-all");
    window.webContents.send(terminalIpc.clipboardAction, "copy");
    await waitFor(
      () => selectAllCoveredScrollback,
      "explicit Select All and Copy across scrollback",
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('.restty-terminal-surface')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
      true,
    );
    await waitFor(() => contextMenus === 1, "native context menu route");

    await reloader.reload();
    const initialImageEvidence =
      await resttyImages.exerciseResttyImagesThroughPty({
        window,
        terminal: terminals[0]!,
        root,
        outputs,
        inputs,
        deliverOutputs,
        resizes,
        waitFor,
      });

    const { reloadState, linkEvidence } = await exerciseExplicitResttyTab({
      window,
      launchKinds,
      resizes,
      outputs,
      inputs,
      deliverOutputs,
      externalLinks,
      titleEvents,
      bellSessionIds,
      ended,
      reload: () => reloader.reload(),
      waitFor,
    });
    const imageEvidence = await resttyImages.completeResttyImageEvidence(
      window,
      initialImageEvidence,
      resizes[0]!.at(-1)!,
    );

    const outputStressEvidence = await outputStress.exercise({
      window,
      terminals,
      resizes,
      launchKinds,
      waitFor,
    });

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

    const backendLoss = await exerciseResttyBackendLoss({
      window,
      launchKinds,
      resizes,
      ptyExits: () => ptyExits,
      terminals,
      outputs,
      waitFor,
    });
    const beforeDestroy = (await window.webContents.executeJavaScript(
      "({ canvases: document.querySelectorAll('.restty-terminal-surface canvas').length, tabs: document.querySelectorAll('.terminal-surface').length })",
      true,
    )) as { canvases: number; tabs: number };
    const renderedFontFamily = (await window.webContents.executeJavaScript(
      "document.querySelector('.restty-terminal-surface')?.dataset.resttyFont ?? null",
      true,
    )) as string | null;
    const exitsBeforeRendererLoss = ptyExits;
    window.webContents.forcefullyCrashRenderer();
    await waitFor(
      () => ptyExits === exitsBeforeRendererLoss + 1,
      "renderer-loss PTY cleanup",
    );

    const result = {
      beforeDestroy,
      backendLoss,
      configuredFontFamily,
      renderedFontFamily,
      renderedPixels,
      reloadState,
      clipboardReads,
      clipboardWrites,
      selectAllCoveredScrollback,
      selectedUnicodeExactly,
      protectedPasteConfirmations,
      contextMenus,
      largePasteLength: largePaste.length,
      externalLinks,
      ...linkEvidence,
      titleEvents,
      bellSessionIds,
      titleQueryReplyBytes,
      capabilityReplies,
      imageEvidence,
      outputStress: outputStressEvidence,
      navigations,
      openedWindows,
      permissionRequests,
      ptyExits,
      launchKinds,
      outputEvidence: {
        defaultUnicode: outputs[0]!.join("").includes("__DEFAULT_INPUT__Olá🙂"),
        explicitReady: outputs[1]!.join("").includes("__EXPLICIT_READY__Olá🙂"),
        explicitInput: outputs[1]!
          .join("")
          .includes("__EXPLICIT_INPUT__second🙂"),
      },
      resizeCounts: resizes.map((entries) => entries.length),
      ended,
      sessionStarts: sessionIndex,
    };
    writeSync(1, prefix + JSON.stringify(result) + "\n");
    keeper.destroy();
    app.exit(0);
  })
  .catch((error) => {
    for (const terminal of terminals) terminal.close();
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    app.exit(1);
  });
