import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";

export async function preparePeer(
  options: Pick<
    Parameters<typeof exerciseResttyBackendLoss>[0],
    "window" | "launchKinds" | "resizes" | "waitFor"
  >,
) {
  options.window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await options.waitFor(
    () => options.launchKinds.length === 4 && options.resizes[3]!.length > 0,
    "unaffected rendering-loss peer",
  );
}

export async function exerciseResttyBackendLoss(options: {
  readonly window: BrowserWindow;
  readonly launchKinds: readonly string[];
  readonly resizes: Array<Array<{ cols: number; rows: number }>>;
  readonly ptyExits: () => number;
  readonly terminals: ReadonlyArray<{ write(data: string): void }>;
  readonly outputs: readonly string[][];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  options.window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await options.waitFor(
    () => options.launchKinds.length === 5 && options.resizes[4]!.length > 0,
    "rendering-loss session",
  );

  const exitsBeforeLoss = options.ptyExits();
  const message = (await options.window.webContents.executeJavaScript(
    `(() => {
      const surfaces = [...document.querySelectorAll('.terminal-surface')];
      const selected = surfaces.find((surface) => surface.hidden === false);
      const canvas = selected?.querySelector('canvas');
      if (!canvas) throw new Error('Selected Restty canvas is missing');
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      return document.querySelector('#terminal-surface-failure')?.textContent ?? '';
    })()`,
    true,
  )) as string;
  await options.waitFor(
    () => options.ptyExits() === exitsBeforeLoss + 1,
    "rendering-loss owned PTY cleanup",
  );
  await options.window.webContents.executeJavaScript(
    "document.querySelector('#tab-strip button:first-child')?.click()",
    true,
  );
  options.terminals[3]!.write(
    process.platform === "win32"
      ? "Write-Output '__UNAFFECTED_AFTER_BACKEND_LOSS__'\r"
      : "printf '__UNAFFECTED_AFTER_BACKEND_LOSS__\\n'\r",
  );
  await options.waitFor(
    () =>
      options.outputs[3]!.join("").includes(
        "__UNAFFECTED_AFTER_BACKEND_LOSS__",
      ),
    "unaffected session after rendering loss",
  );
  return {
    message,
    ownedSessionExited: options.ptyExits() === exitsBeforeLoss + 1,
    unaffectedSessionResponded: true,
  };
}
