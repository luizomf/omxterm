import { app, BrowserWindow, ipcMain, session } from "electron";
import { spawnFixturePty } from "./native-fixture-pty";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { createResttyHostSessions } from "./restty-host-sessions";
import { createFixtureMetricReplyRouter } from "./restty-host-metric-replies";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import * as resttyConfiguration from "./restty-host-configuration";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { recordExport, resttyExportEvidence } from "./restty-host-export";
import { fixtureLocalImageLoader } from "./restty-local-image-links";
import { terminalIpc } from "../../src/shared/terminal-ipc";
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
import * as resttyPaste from "./restty-host-paste";
import * as resttyPlatform from "./restty-host-platform";
import {
  createOutputStressHarness,
  outputStressLaunchRequest,
} from "./restty-host-output-stress";
import * as resttyWindows from "./restty-host-window";
import * as resttyCancellation from "./restty-host-cancellation";
import * as resttyOracles from "./restty-host-oracle-scenarios";
import { createHostOracleSourceControl } from "./restty-host-oracle-controls";

const prefix = "__OMXTERM_RESTTY_HOST_RESULT__";
const root = __dirname;
const focusedCancellation = resttyCancellation.isFocused(process.argv);
const oracle = resttyOracles.focusedHostOracle(process.argv);
const sourceControl = createHostOracleSourceControl(process.argv);
const checkpointCount = process.argv.includes("--oracle-single-checkpoint")
  ? 1
  : 16;
const { home, environment: shellEnvironment } =
  resttyPlatform.prepareFixtureShell(root);
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
const outputStress = createOutputStressHarness({
  sessionIndex: oracle === "output-checkpoints" ? 0 : 2,
  checkpoints: checkpointCount,
  controlledRefit: process.argv.includes("--oracle-row-end-refit"),
});
const exitedSessionIndices = new Set<number>();
const { defaultShell, configuredFontFamily, reloadedFontFamily } =
  resttyPlatform.nativeFixturePlatform;

const { waitFor } = fixtureSessions;

function createHost(window: BrowserWindow) {
  const router = registerTerminalIpcRouter(
    fontLoads.ipcPort(outputStress.ipcPort(ipcMain as unknown as IpcMainPort)),
    undefined,
    (family) =>
      resttyConfiguration.loadResttyHostFont(family, fontLoads.beforeLoad),
  );
  const controller = router.registerController({
    configuration: terminalRendererConfiguration(
      {
        configuration: resttyConfiguration.initialResttyHostConfiguration(
          oracle === "image-palette" || oracle === "image-palette-reload",
        ),
        userFileErrors: [],
      },
      0,
    ),
    webContents: window.webContents,
    createSession(callbacks) {
      const index = sessionIndex++;
      outputs[index] = [];
      inputs[index] = [];
      resizes[index] = [];
      const fixtureLaunchRequest =
        focusedCancellation || oracle === "gesture-routing"
          ? resttyCancellation.cancellationFixtureLaunchRequest()
          : outputStressLaunchRequest(
              index,
              oracle === "output-checkpoints" ? 0 : 2,
              checkpointCount,
              process.argv.includes("--oracle-row-end-refit"),
            );
      const terminal = fixtureSessions.createSession({
        shell: defaultShell,
        ...(fixtureLaunchRequest
          ? { launchRequest: fixtureLaunchRequest }
          : index === 1
            ? {
                launchRequest: resttyPlatform.explicitFixtureLaunchRequest(),
              }
            : {}),
        platform: process.platform,
        homeDirectory: home,
        applicationVersionProvider: app,
        environment: shellEnvironment,
        onOutput(data) {
          if (!outputStress.observeOutput(index, data))
            outputs[index]!.push(data);
          callbacks.onOutput(sourceControl.transform(index, data));
        },
        onExit(exit, launchKind) {
          exitedSessionIndices.add(index);
          outputStress.observeExit(index, exit);
          ptyExits += 1;
          callbacks.onExit(exit, launchKind);
        },
      });
      const { deliverOutput, terminal: routedTerminal } =
        createFixtureMetricReplyRouter(terminal, callbacks.onOutput, {
          inputs: inputs[index]!,
          resizes: resizes[index]!,
        });
      deliverOutputs[index] = deliverOutput;
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
      resttyExportEvidence.clipboardTexts.push(text);
      outputStress.observeClipboard(text);
      // Both claims must come from the same complete copy, not separate writes
      // or marker substrings in the submitted command.
      const completeSelection =
        resttyPlatform.hasSelectionFixtureTranscript(text);
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
    showClipboardContextMenu(request) {
      contextMenus += 1;
      resttyExportEvidence.contextMenuRequests.push(request);
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
    saveTerminalExport: recordExport,
    loadLocalImage: fixtureLocalImageLoader(window, root, localImageRequests),
  });
  registerTerminalWindowHost(window, controller, () => router.dispose());
  const reloader = resttyConfiguration.createResttyHostConfigurationReloader(
    router,
    controller,
    oracle === "image-palette" || oracle === "image-palette-reload",
  );
  return { reloader };
}

async function completeFocusedScenario(
  window: BrowserWindow,
  reload: () => Promise<unknown>,
) {
  const shared = {
    window,
    externalLinks,
    localImageRequests,
    waitFor,
    complete: fixtureSessions.complete,
  };
  if (focusedCancellation) {
    await resttyCancellation.completeResttyLinkCancellationScenario({
      ...shared,
      deliverOutput: deliverOutputs[0]!,
      inputs: inputs[0]!,
      resizes: resizes[0]!,
      initialOutput: () => outputs[0]!.join(""),
      closeSession: () => terminals[0]!.close(),
      ptyExits: () => ptyExits,
      sessionStarts: () => sessionIndex,
    });
  } else if (oracle) {
    await resttyOracles.runFocusedResttyHostOracle({
      ...shared,
      oracle,
      root,
      outputStress,
      terminals,
      launchKinds,
      outputs,
      inputs,
      deliverOutputs,
      resizes,
      exportEvidence: resttyExportEvidence,
      ptyExits: () => ptyExits,
      sessionStarts: () => sessionIndex,
      sessionExited: (index) => exitedSessionIndices.has(index),
      reload,
    });
  }
  return focusedCancellation || Boolean(oracle);
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

    if (await completeFocusedScenario(window, () => reloader.reload())) return;

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

    await resttyPlatform.exerciseDefaultResttyInput(
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
    await resttyPaste.prepareLargePasteShell({
      write: (data) => terminals[0]!.write(data),
      output: () => outputs[0]!.join(""),
      waitFor,
    });
    const largePaste = await resttyPaste.exerciseLargePasteThroughPty({
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
    terminals[0]!.write(
      resttyPlatform.selectionFixtureReset() +
        resttyPlatform.selectionFixtureCommand(),
    );
    await waitFor(
      () => resttyPlatform.hasSelectionFixtureOutput(outputs[0]!.join("")),
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
    const originalImageSession = terminals[0]!;
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
    const completedImages = await resttyImages.completeResttyImageEvidence(
      window,
      initialImageEvidence,
      [deliverOutputs[0]!, inputs[0]!],
      waitFor,
    );
    const sessionRetained =
      originalImageSession === terminals[0] && !exitedSessionIndices.has(0);
    if (!sessionRetained)
      throw new Error("Original image session changed during theme reload");
    const imageEvidence = { ...completedImages, sessionRetained };

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
      inputs,
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
    const { fontMutation, beforeDestroy, renderedFontFamily } =
      await resttyFailures.exerciseResttyRendererLoss({
        window,
        ptyExits: () => ptyExits,
        waitFor,
      });

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
      `${error instanceof Error ? error.stack : String(error)}\nSource control: ${JSON.stringify(sourceControl.evidence())}\n`,
    );
    await fixtureSessions.complete(1).catch(() => {
      process.stderr.write("Restty fixture completion failed\n");
    });
  });
