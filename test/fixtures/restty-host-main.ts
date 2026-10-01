import { app, BrowserWindow, ipcMain, session } from "electron";
import { spawnFixturePty } from "./native-fixture-pty";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { createResttyHostSessions } from "./restty-host-sessions";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { fixtureLocalImageLoader } from "./restty-local-image-links";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  installedFallbackFontData,
  installedFontData,
} from "../../src/main/installed-font-family";
import { exerciseExplicitResttyTab } from "./restty-host-explicit-tab";
import {
  createControlledFontLoads,
  exerciseConcurrentResttyTabs,
} from "./restty-host-concurrent-font";
import { exerciseResttyEvents } from "./restty-host-events";
import { exerciseResttyCapabilities } from "./restty-host-capabilities";
import * as resttyFailures from "./restty-host-failures";
import { captureResttyFontPaintEvidence } from "./restty-host-paint";
import * as resttyImages from "./restty-host-images";
import {
  dispatchDomPaste,
  exerciseLargePasteThroughPty,
  prepareLargePasteShell,
} from "./restty-host-paste";
import {
  exerciseDefaultResttyInput,
  explicitFixtureLaunchRequest,
  hasSelectionFixtureOutput,
  hasSelectionFixtureTranscript,
  nativeFixturePlatform,
  prepareFixtureShell,
  selectionFixtureCommand,
  selectionFixtureReset,
} from "./restty-host-platform";
import {
  createOutputStressHarness,
  outputStressLaunchRequest,
} from "./restty-host-output-stress";
import * as resttyWindows from "./restty-host-window";
import * as resttyCancellation from "./restty-host-cancellation";

const prefix = "__OMXTERM_RESTTY_HOST_RESULT__";
const root = __dirname;
const focusedCancellation = process.argv.includes("--link-cancellation");
const { home, environment: shellEnvironment } = prepareFixtureShell(root);
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}

const outputs: string[][] = [];
const inputs: string[][] = [];
const deliverOutputs: Array<(data: string) => void> = [];
const resizes: Array<Array<{ cols: number; rows: number }>> = [];
const launchKinds: string[] = [];
const fixtureSessions = createResttyHostSessions({
  spawn: spawnFixturePty,
  app,
  windows: () => BrowserWindow.getAllWindows(),
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
const terminals: Array<ReturnType<typeof fixtureSessions.createSession>> = [];
const ended: Array<{ closeRequested: boolean; liveSessions: number }> = [];
let clipboardReads = 0;
let clipboardWrites = 0;
let selectAllCoveredScrollback = false;
let selectedUnicodeExactly = false;
let protectedPasteConfirmations = 0;
let contextMenus = 0;
const externalLinks: string[] = [];
const localImageRequests: LocalImageRequest[] = [];
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
const fontLoads = createControlledFontLoads();
const outputStress = createOutputStressHarness();
const { defaultShell, configuredFontFamily, reloadedFontFamily } =
  nativeFixturePlatform;

const { waitFor } = fixtureSessions;

function createHost(window: BrowserWindow) {
  const router = registerTerminalIpcRouter(
    fontLoads.ipcPort(outputStress.ipcPort(ipcMain as unknown as IpcMainPort)),
    undefined,
    async (family) => {
      await fontLoads.beforeLoad();
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
      const fixtureLaunchRequest = focusedCancellation
        ? resttyCancellation.cancellationFixtureLaunchRequest()
        : outputStressLaunchRequest(index);
      const terminal = fixtureSessions.createSession({
        shell: defaultShell,
        ...(fixtureLaunchRequest
          ? { launchRequest: fixtureLaunchRequest }
          : index === 1
            ? {
                launchRequest: explicitFixtureLaunchRequest(),
              }
            : {}),
        platform: process.platform,
        homeDirectory: home,
        applicationVersionProvider: app,
        environment: shellEnvironment,
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
      // Both claims must come from the same complete copy, not separate writes
      // or marker substrings in the submitted command.
      const completeSelection = hasSelectionFixtureTranscript(text);
      selectAllCoveredScrollback ||= completeSelection;
      selectedUnicodeExactly ||= completeSelection;
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
      const fixture =
        title === "first-title"
          ? "first"
          : title === `\ufeff${"z".repeat(256)}`
            ? "overlong"
            : title === "second-title"
              ? "second"
              : "unexpected";
      // Windows PowerShell and child programs legitimately update the console
      // title. Keep this fixture focused on its own parsed synthetic events.
      if (process.platform === "win32" && fixture === "unexpected") return;
      titleEvents.push({ sessionId, fixture });
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
    loadLocalImage: fixtureLocalImageLoader(window, root, localImageRequests),
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
    fontLigatures: false,
    fontSize: 18,
  };
  const reloads = [changedConfiguration, initialConfiguration];
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initialConfiguration, userFileErrors: [] },
    load: async () => ({ configuration: reloads.shift()! }),
    apply: (state) =>
      controller.applyConfiguration(terminalRendererConfiguration(state, 0)),
    terminalSurfaceFontBaseline: {
      fontFamily: configuredFontFamily,
      fontLineHeight: 1,
    },
    activeTerminalSurfaceFontConfigurations: () =>
      router.activeTerminalSurfaceFontConfigurations(),
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

    const { window } = resttyWindows.createResttyHostWindows(
      root,
      () => (openedWindows += 1),
      () => (navigations += 1),
    );

    const { reloader } = createHost(window);

    await resttyWindows.initializeResttyHostWindow(
      window,
      root,
      () => launchKinds.length === 1 && resizes[0]!.length > 0,
      waitFor,
    );

    if (focusedCancellation) {
      await resttyCancellation.completeResttyLinkCancellationScenario({
        window,
        deliverOutput: deliverOutputs[0]!,
        inputs: inputs[0]!,
        resizes: resizes[0]!,
        externalLinks,
        waitFor,
        initialOutput: () => outputs[0]!.join(""),
        closeSession: () => terminals[0]!.close(),
        ptyExits: () => ptyExits,
        sessionStarts: () => sessionIndex,
        complete: fixtureSessions.complete,
      });
      return;
    }

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

    await exerciseDefaultResttyInput(
      window,
      () => outputs[0]!.join(""),
      waitFor,
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
    await prepareLargePasteShell({
      write: (data) => terminals[0]!.write(data),
      output: () => outputs[0]!.join(""),
      waitFor,
    });
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
    terminals[0]!.write(selectionFixtureReset() + selectionFixtureCommand());
    await waitFor(
      () => hasSelectionFixtureOutput(outputs[0]!.join("")),
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
      root,
      launchKinds,
      resizes,
      outputs,
      inputs,
      deliverOutputs,
      externalLinks,
      localImageRequests,
      titleEvents,
      bellSessionIds,
      ended,
      reload: () => reloader.reload(),
      waitFor,
    });
    const imageEvidence = await resttyImages.completeResttyImageEvidence(
      window,
      initialImageEvidence,
      [deliverOutputs[0]!, inputs[0]!],
      waitFor,
    );

    const outputStressEvidence = await outputStress.exercise({
      window,
      terminals,
      resizes,
      launchKinds,
      waitFor,
    });

    // Keep a real tab owner between phases. Last-tab removal now commits
    // renderer closure; a fixture must not revive an intentionally empty host.
    await resttyFailures.preparePeer({ window, launchKinds, resizes, waitFor });
    terminals[0]!.close();
    await waitFor(
      () =>
        ended.length === 3 &&
        !ended[2]!.closeRequested &&
        ended[2]!.liveSessions === 1,
      "owned default-shell termination",
    );
    window.webContents.send(terminalIpc.tabCommand, {
      action: "close-session",
      sessionId: "s1",
    });

    const backendLoss = await resttyFailures.exerciseResttyBackendLoss({
      window,
      launchKinds,
      resizes,
      ptyExits: () => ptyExits,
      terminals,
      outputs,
      waitFor,
    });
    const concurrentFontInitialization = await exerciseConcurrentResttyTabs({
      window,
      beginFontLoad: fontLoads.begin,
      sessionStarts: () => sessionIndex,
      ptyExits: () => ptyExits,
      waitFor,
    });
    const { fontMutation, ...beforeDestroy } =
      (await window.webContents.executeJavaScript(
        "({ fontMutation: globalThis.__fontMutationResult(), canvases: document.querySelectorAll('.restty-terminal-surface canvas').length, tabs: document.querySelectorAll('.terminal-surface').length })",
        true,
      )) as { fontMutation: unknown; canvases: number; tabs: number };
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
      fontMutation,
      beforeDestroy,
      backendLoss,
      concurrentFontInitialization,
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
    await fixtureSessions.complete(0);
  })
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    await fixtureSessions.complete(1).catch(() => {
      process.stderr.write("Restty fixture completion failed\n");
    });
  });
