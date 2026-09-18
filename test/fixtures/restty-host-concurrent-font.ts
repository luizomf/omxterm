import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";

export function createControlledFontLoads() {
  let total = 0;
  let control:
    { readonly started: () => void; readonly wait: Promise<void> } | undefined;
  return {
    async beforeLoad() {
      total += 1;
      const active = control;
      if (active) {
        active.started();
        await active.wait;
      }
    },
    begin() {
      const initial = total;
      let markStarted: () => void = () => undefined;
      let releaseLoad: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });
      const active = { started: markStarted, wait };
      control = active;
      return {
        started,
        release() {
          if (control === active) control = undefined;
          releaseLoad();
        },
        physicalLoads: () => total - initial,
      };
    },
  };
}

export async function exerciseConcurrentResttyTabs(options: {
  readonly window: BrowserWindow;
  readonly beginFontLoad: () => {
    readonly started: Promise<void>;
    readonly release: () => void;
    readonly physicalLoads: () => number;
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

  await controlledLoad.started;
  // Keep the first physical read pending long enough for every renderer Surface
  // to cross the real preload/main IPC boundary deterministically.
  await new Promise((resolve) => setTimeout(resolve, 100));
  controlledLoad.release();
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
    physicalFontLoads: controlledLoad.physicalLoads(),
    falseErrorVisible: !failure.hidden || failure.text.length > 0,
  };
}
