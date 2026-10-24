import type { BrowserWindow } from "electron";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { initializeResttyHostWindow } from "../fixtures/restty-host-window";

vi.mock("electron", () => ({ BrowserWindow: vi.fn() }));

const originalFocusPredicate =
  "document.activeElement?.closest('.restty-terminal-surface') !== null";

function fixture({
  activate = true,
  restoreTerminal = true,
  ready = true,
} = {}) {
  const events: string[] = [];
  let nativeFocused = false;
  let terminalFocused = false;
  let sessionReady = ready;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const window = {
    loadFile: vi.fn(async () => {
      events.push("load");
    }),
    showInactive: vi.fn(() => {
      events.push("show-inactive");
    }),
    focus: vi.fn(() => {
      events.push("native-focus");
      nativeFocused = activate;
      // Model the production page-focus owner, not a fixture DOM focus call.
      terminalFocused = activate && restoreTerminal;
    }),
    isFocused: vi.fn(() => nativeFocused),
    webContents: {
      executeJavaScript: vi.fn(async (script: string) => {
        events.push("observe-dom-focus");
        expect(script).toBe(originalFocusPredicate);
        return terminalFocused;
      }),
    },
  };
  const initialize = () =>
    initializeResttyHostWindow(
      window as unknown as BrowserWindow,
      "/fixture",
      () => sessionReady,
      async (predicate, label) => {
        events.push(label);
        if (label === "default Restty session" && !sessionReady) await gate;
        if (!(await predicate())) throw new Error(`Not ready: ${label}`);
      },
    );
  return {
    window,
    events,
    initialize,
    finishSession() {
      sessionReady = true;
      release();
    },
  };
}

it("activates only after session readiness, then observes the unchanged terminal focus oracle", async () => {
  const f = fixture({ ready: false });
  const initialization = f.initialize();
  await vi.waitFor(() => expect(f.events).toContain("default Restty session"));
  expect(f.window.focus).not.toHaveBeenCalled();
  expect(f.window.webContents.executeJavaScript).not.toHaveBeenCalled();
  f.finishSession();
  await initialization;
  expect(f.window.loadFile).toHaveBeenCalledExactlyOnceWith(
    path.join("/fixture", "renderer", "index.html"),
  );
  expect(f.events).toEqual([
    "load",
    "show-inactive",
    "default Restty session",
    "native-focus",
    "native host window activation",
    "initial terminal focus",
    "observe-dom-focus",
  ]);
  expect(f.window.focus).toHaveBeenCalledOnce();
  expect(
    f.window.webContents.executeJavaScript,
  ).toHaveBeenCalledExactlyOnceWith(originalFocusPredicate, true);
});

it("reports missing native activation before attempting the DOM focus assertion", async () => {
  const f = fixture({ activate: false });
  await expect(f.initialize()).rejects.toThrow(
    "Not ready: native host window activation",
  );
  expect(f.window.webContents.executeJavaScript).not.toHaveBeenCalled();
});

it("still rejects missing terminal DOM focus after successful native activation", async () => {
  const f = fixture({ restoreTerminal: false });
  await expect(f.initialize()).rejects.toThrow(
    "Not ready: initial terminal focus",
  );
  expect(f.window.isFocused).toHaveReturnedWith(true);
  expect(
    f.window.webContents.executeJavaScript,
  ).toHaveBeenCalledExactlyOnceWith(originalFocusPredicate, true);
});

it("does not activate a window when renderer loading fails", async () => {
  const f = fixture();
  f.window.loadFile.mockRejectedValueOnce(new Error("load failed"));
  await expect(f.initialize()).rejects.toThrow("load failed");
  expect(f.window.showInactive).not.toHaveBeenCalled();
  expect(f.window.focus).not.toHaveBeenCalled();
});
