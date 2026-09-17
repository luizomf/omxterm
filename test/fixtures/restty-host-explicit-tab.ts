import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { exerciseResttyLinks } from "./restty-link-gestures";

export async function exerciseExplicitResttyTab(options: {
  readonly window: BrowserWindow;
  readonly launchKinds: readonly string[];
  readonly resizes: Array<Array<{ cols: number; rows: number }>>;
  readonly outputs: string[][];
  readonly inputs: string[][];
  readonly deliverOutputs: ReadonlyArray<(data: string) => void>;
  readonly externalLinks: string[];
  readonly titleEvents: readonly unknown[];
  readonly bellSessionIds: readonly string[];
  readonly ended: ReadonlyArray<{
    readonly closeRequested: boolean;
    readonly liveSessions: number;
  }>;
  readonly reload: () => Promise<unknown>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const { window, waitFor } = options;
  window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await waitFor(
    () => options.launchKinds.length === 2 && options.resizes[1]!.length > 0,
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
  try {
    await waitFor(
      () => options.outputs[1]!.join("").includes("__EXPLICIT_READY__Olá🙂"),
      "explicit command output",
    );
  } catch (cause) {
    throw new Error(
      `Explicit command produced no readiness marker; synthetic PTY tail: ${JSON.stringify(options.outputs[1]!.join("").slice(-2_000))}`,
      { cause },
    );
  }
  await waitFor(
    () => options.titleEvents.length >= 3 && options.bellSessionIds.length >= 2,
    "second tab parsed title and bell callbacks",
  );
  await options.reload();
  const reloadState = (await window.webContents.executeJavaScript(
    "({ fonts: [...document.querySelectorAll('.restty-terminal-surface')].map((element) => element.dataset.resttyFont), notice: document.querySelector('#user-file-errors')?.textContent ?? '' })",
    true,
  )) as { fonts: string[]; notice: string };
  await window.webContents.executeJavaScript(
    "document.querySelector('#tab-strip button:last-child')?.click()",
    true,
  );
  window.focus();
  window.webContents.focus();
  await waitFor(
    () =>
      window.webContents.executeJavaScript(
        "document.activeElement?.closest('.restty-terminal-surface') !== null",
        true,
      ),
    "selected Restty focus before Unicode input",
  );
  await window.webContents.executeJavaScript(
    `(() => {
      const input = [...document.querySelectorAll('.restty-terminal-surface textarea')].find((candidate) => candidate.closest('.terminal-surface')?.hidden === false);
      input.dispatchEvent(new InputEvent('input', { data: 'second🙂', inputType: 'insertText', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    })()`,
    true,
  );
  await waitFor(
    () => options.outputs[1]!.join("").includes("__EXPLICIT_INPUT__second🙂"),
    "selected-tab Unicode input isolation",
  );
  const linkEvidence = await exerciseResttyLinks({
    window,
    deliverOutput: options.deliverOutputs[1]!,
    inputs: options.inputs[1]!,
    resizes: options.resizes[1]!,
    externalLinks: options.externalLinks,
    waitFor,
  });
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
      options.ended.some(
        (entry) => entry.closeRequested && entry.liveSessions === 1,
      ),
    "explicit tab close cleanup",
  );
  options.deliverOutputs[1]!("\u001b]0;late-private-title\u0007\u0007");
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { reloadState, linkEvidence };
}
