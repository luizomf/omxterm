import type { BrowserWindow } from "electron";
import { writeSync } from "node:fs";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { exerciseResttyBackendLoss, preparePeer } from "./restty-host-failures";
import {
  completeResttyImageEvidence,
  exerciseResttyImagesThroughPty,
} from "./restty-host-images";
import type { createOutputStressHarness } from "./restty-host-output-stress";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { exerciseResttyOrdinaryGestures } from "./restty-link-gestures";
import { exerciseResttyScrollbackSearch } from "./restty-host-search";
import {
  exerciseResttyTerminalExport,
  type ResttyExportEvidenceSink,
} from "./restty-host-export";

export type FocusedHostOracle =
  | "output-checkpoints"
  | "surviving-session"
  | "image-palette"
  | "image-palette-reload"
  | "gesture-routing"
  | "scrollback-search"
  | "terminal-export";

export function focusedHostOracle(
  arguments_: readonly string[],
): FocusedHostOracle | undefined {
  for (const oracle of [
    "output-checkpoints",
    "surviving-session",
    "image-palette",
    "image-palette-reload",
    "gesture-routing",
    "scrollback-search",
    "terminal-export",
  ] as const)
    if (arguments_.includes(`--oracle-${oracle}`)) return oracle;
  return undefined;
}

export async function runFocusedResttyHostOracle(options: {
  readonly oracle: FocusedHostOracle;
  readonly root: string;
  readonly window: BrowserWindow;
  readonly outputStress: ReturnType<typeof createOutputStressHarness>;
  readonly terminals: LocalTerminalSession[];
  readonly launchKinds: string[];
  readonly outputs: string[][];
  readonly inputs: string[][];
  readonly externalLinks: string[];
  readonly localImageRequests: LocalImageRequest[];
  readonly deliverOutputs: Array<(data: string) => void>;
  readonly resizes: Array<Array<{ cols: number; rows: number }>>;
  readonly exportEvidence: ResttyExportEvidenceSink;
  readonly ptyExits: () => number;
  readonly sessionStarts: () => number;
  readonly sessionExited: (index: number) => boolean;
  readonly reload: () => Promise<unknown>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
  readonly complete: (code: number) => Promise<void>;
}) {
  const { oracle, window } = options;
  // Bounds only focused diagnostic controls, not the broad host's waits.
  const waitFor: typeof options.waitFor = async (predicate, label) => {
    const deadline = Date.now() + 10_000;
    await options.waitFor(async () => {
      if (Date.now() > deadline)
        throw new Error(`Focused oracle timed out: ${label}`);
      return predicate();
    }, label);
  };
  let evidence: object;
  if (oracle === "output-checkpoints") {
    evidence = {
      outputStress: await options.outputStress.exercise({
        ...options,
        existingSession: true,
        waitFor,
      }),
    };
  } else if (oracle === "surviving-session") {
    await preparePeer({ ...options, peerIndex: 0, waitFor });
    evidence = {
      backendLoss: await exerciseResttyBackendLoss({
        ...options,
        peerIndex: 0,
        failedIndex: 1,
        diagnosticTimeoutMs: 3_000,
        waitFor,
      }),
    };
  } else if (oracle === "scrollback-search") {
    await waitFor(
      () => (options.resizes[0]?.length ?? 0) > 0,
      "search Surface sized",
    );
    evidence = {
      searchEvidence: await exerciseResttyScrollbackSearch({
        window,
        deliverOutput: options.deliverOutputs[0]!,
        inputs: options.inputs[0]!,
        waitFor,
      }),
    };
  } else if (oracle === "terminal-export") {
    await waitFor(
      () => (options.resizes[0]?.length ?? 0) > 0,
      "export Surface sized",
    );
    evidence = {
      exportEvidence: await exerciseResttyTerminalExport({
        window,
        deliverOutput: options.deliverOutputs[0]!,
        evidence: options.exportEvidence,
        waitFor,
      }),
    };
  } else if (oracle === "gesture-routing") {
    await waitFor(
      () =>
        options.outputs[0]!.join("").includes("__OMXTERM_CANCELLATION_READY__"),
      "gesture PTY echo suppression readiness",
    );
    evidence = {
      gestureEvidence: await exerciseResttyOrdinaryGestures(
        {
          ...options,
          inputs: options.inputs[0]!,
          resizes: options.resizes[0]!,
          deliverOutput: options.deliverOutputs[0]!,
          waitFor,
        },
        options.resizes[0]!.at(-1)!,
      ),
    };
  } else {
    // Reproduce the broad clipboard-to-image handoff: selection paint cannot
    // stand in for the initial runtime palette, and must be reset before emit.
    window.webContents.send(terminalIpc.clipboardAction, "select-all");
    await window.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      true,
    );
    const original = options.terminals[0]!;
    const initial = await exerciseResttyImagesThroughPty({
      ...options,
      terminal: original,
      reloadOnly: oracle === "image-palette-reload",
      waitFor,
    });
    writeSync(1, `__OMXTERM_IMAGE_SCENARIO__${initial.geometryScenario}\n`);
    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor(
      () =>
        options.launchKinds.length === 2 &&
        (options.resizes[1]?.length ?? 0) > 0,
      "image Surface hidden behind initialized peer",
    );
    await options.reload();
    window.webContents.send(terminalIpc.tabCommand, { action: "close" });
    await waitFor(() => options.ptyExits() === 1, "image peer owned cleanup");
    const completed = await completeResttyImageEvidence(
      window,
      initial,
      [options.deliverOutputs[0]!, options.inputs[0]!],
      waitFor,
    );
    const sessionRetained =
      original === options.terminals[0] && !options.sessionExited(0);
    if (!sessionRetained)
      throw new Error(
        "Original image session was replaced or exited during theme reload",
      );
    evidence = { imageEvidence: { ...completed, sessionRetained } };
  }
  writeSync(
    1,
    `__OMXTERM_RESTTY_HOST_RESULT__${JSON.stringify({ oracle, ...evidence, sessionStarts: options.sessionStarts(), ptyExits: options.ptyExits() })}\n`,
  );
  await options.complete(0);
}
