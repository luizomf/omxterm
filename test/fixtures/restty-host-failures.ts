import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { readLocalImageCoreCells } from "./restty-local-image-core-probe";
import {
  hasSiblingResponse,
  siblingResponseCommand,
  waitForSiblingResponse,
} from "./restty-sibling-response";

export async function exerciseResttyRendererLoss(options: {
  readonly window: BrowserWindow;
  readonly ptyExits: () => number;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const { window } = options;
  const { fontMutation, ...beforeDestroy } =
    (await window.webContents.executeJavaScript(
      "({ fontMutation: globalThis.__fontMutationResult(), canvases: document.querySelectorAll('.restty-terminal-surface canvas').length, tabs: document.querySelectorAll('.terminal-surface').length })",
      true,
    )) as { fontMutation: unknown; canvases: number; tabs: number };
  const renderedFontFamily = (await window.webContents.executeJavaScript(
    "document.querySelector('.restty-terminal-surface')?.dataset.resttyFont ?? null",
    true,
  )) as string | null;
  const before = options.ptyExits();
  window.webContents.forcefullyCrashRenderer();
  await options.waitFor(
    () => options.ptyExits() === before + 1,
    "renderer-loss PTY cleanup",
  );
  return { fontMutation, beforeDestroy, renderedFontFamily };
}

export async function preparePeer(
  options: Pick<
    Parameters<typeof exerciseResttyBackendLoss>[0],
    "window" | "launchKinds" | "resizes" | "waitFor" | "peerIndex"
  >,
) {
  const peerIndex = options.peerIndex ?? 3;
  // A focused host starts its first peer normally; broad adds a new peer.
  if (peerIndex !== 0)
    options.window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await options.waitFor(
    () =>
      options.launchKinds.length === peerIndex + 1 &&
      (options.resizes[peerIndex]?.length ?? 0) > 0,
    "unaffected rendering-loss peer",
  );
}

export async function exerciseResttyBackendLoss(options: {
  readonly window: BrowserWindow;
  readonly launchKinds: readonly string[];
  readonly resizes: Array<Array<{ cols: number; rows: number }>>;
  readonly ptyExits: () => number;
  readonly outputs: readonly string[][];
  readonly inputs: readonly string[][];
  readonly peerIndex?: number;
  readonly failedIndex?: number;
  readonly diagnosticTimeoutMs?: number;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const peerIndex = options.peerIndex ?? 3;
  const failedIndex = options.failedIndex ?? 4;
  const { window, waitFor } = options;
  // Wait for the predecessor's acknowledged tab removal before saving the real
  // peer identities. No replacement Surface/canvas can satisfy later checks.
  await waitFor(
    () =>
      window.webContents.executeJavaScript(
        `(() => {
          const surfaces = [...document.querySelectorAll('.terminal-surface')];
          return surfaces.length === 1 && !surfaces[0].hidden && !!surfaces[0].querySelector('canvas');
        })()`,
        true,
      ) as Promise<boolean>,
    "sole initialized surviving Surface before backend loss",
  );
  await window.webContents.executeJavaScript(
    `(() => {
      const surface = document.querySelector('.terminal-surface');
      globalThis.__siblingResponseIdentity = { surface, canvas: surface.querySelector('canvas') };
    })()`,
    true,
  );
  try {
    window.webContents.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor(
      () =>
        options.launchKinds.length === failedIndex + 1 &&
        (options.resizes[failedIndex]?.length ?? 0) > 0,
      "rendering-loss session",
    );

    const exitsBeforeLoss = options.ptyExits();
    const message = (await window.webContents.executeJavaScript(
      `(() => {
        const surfaces = [...document.querySelectorAll('.terminal-surface')];
        const selected = surfaces.find((surface) => surface.hidden === false);
        const canvas = selected?.querySelector('canvas');
        if (!canvas || canvas === globalThis.__siblingResponseIdentity.canvas)
          throw new Error('Selected failed sibling Restty canvas is missing');
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        return document.querySelector('#terminal-surface-failure')?.textContent ?? '';
      })()`,
      true,
    )) as string;
    await waitFor(
      () => options.ptyExits() === exitsBeforeLoss + 1,
      "rendering-loss owned PTY cleanup",
    );
    // This host-only fixture supplies the application acknowledgement explicitly.
    // The real dialog lifecycle is exercised by failure-acknowledgement.test.ts.
    window.webContents.send(terminalIpc.tabCommand, {
      action: "close-session",
      sessionId: `s${failedIndex + 1}`,
    });
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          "document.querySelectorAll('.terminal-surface').length === 1",
          true,
        ) as Promise<boolean>,
      "acknowledged rendering-loss tab cleanup",
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#tab-strip button:first-child')?.click()",
      true,
    );
    const assertPeerIdentity = async () => {
      const identity = (await window.webContents.executeJavaScript(
        `(() => {
          const { surface, canvas } = globalThis.__siblingResponseIdentity;
          return {
            surfaceRetained: surface.isConnected && surface === document.querySelector('.terminal-surface') && !surface.hidden,
            canvasRetained: canvas.isConnected && canvas === surface.querySelector('canvas'),
          };
        })()`,
        true,
      )) as { surfaceRetained: boolean; canvasRetained: boolean };
      if (!identity.surfaceRetained || !identity.canvasRetained)
        throw new Error(
          "Sibling destination Surface/canvas identity changed after backend loss",
        );
      return identity;
    };
    await assertPeerIdentity();
    if (hasSiblingResponse((await readLocalImageCoreCells(window))?.text ?? ""))
      throw new Error(
        "Sibling destination response was already present before input",
      );

    const sourceOffset = options.outputs[peerIndex]!.join("").length;
    const inputOffset = options.inputs[peerIndex]!.join("").length;
    const command = siblingResponseCommand();
    await window.webContents.executeJavaScript(
      `(() => {
        const { surface, canvas } = globalThis.__siblingResponseIdentity;
        if (surface.hidden || !canvas.isConnected) throw new Error('Surviving sibling is not selected');
        canvas.focus();
        const input = surface.querySelector('textarea');
        if (!input) throw new Error('Surviving sibling textarea is missing');
        input.dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(command)}, inputType: 'insertText', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()`,
      true,
    );
    const response = await waitForSiblingResponse({
      sourceOutput: () =>
        options.outputs[peerIndex]!.join("").slice(sourceOffset),
      destinationText: async () => {
        await assertPeerIdentity();
        return (await readLocalImageCoreCells(window))?.text ?? "";
      },
      waitFor,
      ...(options.diagnosticTimeoutMs === undefined
        ? {}
        : { diagnosticTimeoutMs: options.diagnosticTimeoutMs }),
    });
    const submittedInput =
      options.inputs[peerIndex]!.join("").slice(inputOffset);
    if (
      !submittedInput.includes(`${command}\r`) ||
      hasSiblingResponse(submittedInput)
    )
      throw new Error(
        "Sibling Surface input did not submit the split command and Enter to the peer",
      );
    const identity = await assertPeerIdentity();
    const ownedExitDelta = options.ptyExits() - exitsBeforeLoss;
    if (ownedExitDelta !== 1)
      throw new Error(
        "Backend loss exited more than its owned sibling session",
      );
    return {
      message,
      ownedSessionExited: true,
      ownedExitDelta,
      unaffectedSessionResponded: true,
      ...response,
      ...identity,
      submittedInput,
    };
  } finally {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      await window.webContents.executeJavaScript(
        "delete globalThis.__siblingResponseIdentity",
        true,
      );
  }
}
