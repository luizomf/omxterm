import type { BrowserWindow } from "electron";
import type { IpcMainPort } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";

export function createControlledFontLoads() {
  let total = 0;
  let requests = 0;
  let control: { readonly wait: Promise<void> } | undefined;
  return {
    ipcPort(port: IpcMainPort): IpcMainPort {
      return {
        handle: (channel, handler) =>
          port.handle(channel, (event, payload) => {
            if (channel === terminalIpc.fontData) requests += 1;
            return handler(event, payload);
          }),
        removeHandler: (channel) => port.removeHandler(channel),
        on: (channel, listener) => port.on(channel, listener),
        removeListener: (channel, listener) =>
          port.removeListener(channel, listener),
      };
    },
    async beforeLoad() {
      total += 1;
      const active = control;
      if (active) await active.wait;
    },
    begin() {
      const initial = total;
      const initialRequests = requests;
      let releaseLoad: () => void = () => undefined;
      const wait = new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      const active = { wait };
      control = active;
      return {
        release() {
          if (control === active) control = undefined;
          releaseLoad();
        },
        physicalLoads: () => total - initial,
        requests: () => requests - initialRequests,
      };
    },
  };
}

export async function exerciseConcurrentResttyTabs(options: {
  readonly window: BrowserWindow;
  readonly beginFontLoad: () => {
    readonly release: () => void;
    readonly physicalLoads: () => number;
    readonly requests: () => number;
  };
  readonly sessionStarts: () => number;
  readonly ptyExits: () => number;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const initialSessions = options.sessionStarts();
  const initialExits = options.ptyExits();
  // The preceding backend-loss fixture already captured its genuine error.
  // Reset only this synthetic DOM surface so a new false font error is visible.
  await options.window.webContents.executeJavaScript(
    "document.querySelector('#terminal-surface-failure').hidden = true; document.querySelector('#terminal-surface-failure').textContent = '';",
    true,
  );
  const controlledLoad = options.beginFontLoad();
  for (let tab = 0; tab < 4; tab += 1)
    options.window.webContents.send(terminalIpc.tabCommand, { action: "new" });

  try {
    await options.waitFor(
      () =>
        options.window.webContents.executeJavaScript(
          "document.querySelectorAll('.terminal-surface').length === 5",
          true,
        ) as Promise<boolean>,
      "four tabs entering Surface initialization on the live window generation",
    );
  } finally {
    controlledLoad.release();
  }
  await options.waitFor(
    () => options.sessionStarts() === initialSessions + 4,
    "four concurrently initialized Restty tabs",
  );
  await options.waitFor(
    () =>
      options.window.webContents.executeJavaScript(
        "document.querySelectorAll('.restty-terminal-surface canvas').length === 5",
        true,
      ),
    "five ready Restty Surfaces after concurrent font loading",
  );
  const failure = (await options.window.webContents.executeJavaScript(
    "({ hidden: document.querySelector('#terminal-surface-failure')?.hidden ?? false, text: document.querySelector('#terminal-surface-failure')?.textContent ?? '' })",
    true,
  )) as { hidden: boolean; text: string };

  for (let remaining = 4; remaining >= 1; remaining -= 1) {
    options.window.webContents.send(terminalIpc.tabCommand, {
      action: "close",
    });
    await options.waitFor(
      () =>
        options.window.webContents.executeJavaScript(
          `document.querySelectorAll('.terminal-surface').length === ${remaining}`,
          true,
        ),
      "concurrent fixture tab cleanup",
    );
  }
  await options.waitFor(
    () => options.ptyExits() === initialExits + 4,
    "concurrent fixture PTY cleanup",
  );

  return {
    requestedTabs: 4,
    readyTabs: options.sessionStarts() - initialSessions,
    rendererFontRequests: controlledLoad.requests(),
    physicalFontLoads: controlledLoad.physicalLoads(),
    falseErrorVisible: !failure.hidden || failure.text.length > 0,
  };
}
