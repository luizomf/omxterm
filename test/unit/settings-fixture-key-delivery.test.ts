import { EventEmitter } from "node:events";
import { ipcMain, type BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";
import {
  createCoreActionCatalog,
  coreActionInvocations,
  coreActionKeybinds,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import type { KeybindKeyboardInput } from "../../src/main/keybind-delivery";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import { settingsIpc } from "../../src/shared/settings";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { createSettingsExercise } from "../fixtures/settings-dialog-exercise";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

const defaultChord: KeybindKeyboardInput = {
  type: "keyDown",
  key: "P",
  code: "KeyP",
  shift: true,
  meta: process.platform === "darwin",
  control: process.platform !== "darwin",
  alt: false,
};

function fixture() {
  vi.mocked(ipcMain.handle).mockClear();
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  const showPalette = vi.fn();
  const unexpected = () => {
    throw new Error("Unexpected fixture action");
  };
  const actions: TerminalApplicationMenuActions = {
    newWindow: unexpected,
    closeSelectedWindow: unexpected,
    newTabInSelectedWindow: unexpected,
    closeSelectedTab: unexpected,
    selectNextTab: unexpected,
    selectPreviousTab: unexpected,
    selectTabInSelectedWindow: unexpected,
    requestQuit: unexpected,
    toggleSelectedFullScreen: unexpected,
    toggleSelectedAlwaysOnTop: unexpected,
    toggleSelectedDevTools: unexpected,
    zoomInSelectedWindow: unexpected,
    zoomOutSelectedWindow: unexpected,
    resetSelectedWindowZoom: unexpected,
    copySelectedTerminal: unexpected,
    pasteSelectedTerminal: unexpected,
    selectAllSelectedTerminal: unexpected,
    findInSelectedTerminal: unexpected,
    toggleSelectedSnippets: unexpected,
    toggleSelectedTabBar: unexpected,
    toggleSelectedTitleBar: unexpected,
    reloadUserConfiguration: unexpected,
    openLocalImage: unexpected,
    showAbout: unexpected,
    showSettings: unexpected,
    showCommandPalette: showPalette,
    splitSelectedPane: unexpected,
    closeSelectedPane: unexpected,
    focusSelectedPane: unexpected,
    equalizeSelectedPanes: unexpected,
  };
  let bindings = terminalDefaultKeybinds(process.platform);
  let catalog = createCoreActionCatalog("OMXTerm", actions, bindings);
  const settings = createSettingsExercise(
    "/unused-fixture-profile",
    { isTrustedSender: () => true } as unknown as TerminalIpcRouter,
    () => window as unknown as BrowserWindow,
    () => undefined,
    {
      keybinds: () => coreActionKeybinds(catalog),
      invokeAction: (action) => coreActionInvocations(catalog)[action](),
    },
  );
  const sendKey = (input: KeybindKeyboardInput, prevented = false) => {
    const event = {
      defaultPrevented: prevented,
      preventDefault: vi.fn(() => {
        event.defaultPrevented = true;
      }),
    };
    contents.emit("before-input-event", event, input);
    return event;
  };
  const capture = async (captureId: string) => {
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === settingsIpc.capture)![1];
    await handler(
      {
        sender: contents,
        senderFrame: contents.mainFrame,
      } as unknown as Electron.IpcMainInvokeEvent,
      { active: true, captureId },
    );
  };
  return {
    contents,
    window,
    settings,
    showPalette,
    sendKey,
    capture,
    remap() {
      bindings = { ...bindings, commandPalette: "F6" };
      catalog = createCoreActionCatalog("OMXTerm", actions, bindings);
    },
  };
}

it("uses one Settings fixture delivery owner for the composed palette catalog", () => {
  const f = fixture();
  try {
    expect(f.contents.listenerCount("before-input-event")).toBe(1);
    expect(f.sendKey(defaultChord).preventDefault).toHaveBeenCalledOnce();
    f.sendKey({ ...defaultChord, type: "keyUp" });
    expect(f.showPalette).toHaveBeenCalledTimes(1);

    f.remap();
    expect(f.sendKey(defaultChord).preventDefault).not.toHaveBeenCalled();
    const remapped: KeybindKeyboardInput = {
      type: "keyDown",
      key: "F6",
      code: "F6",
      control: false,
      meta: false,
      alt: false,
      shift: false,
    };
    expect(f.sendKey(remapped).preventDefault).toHaveBeenCalledOnce();
    f.sendKey({ ...remapped, type: "keyUp" });
    expect(f.showPalette).toHaveBeenCalledTimes(2);
    expect(f.contents.listenerCount("before-input-event")).toBe(1);
  } finally {
    f.settings.dispose();
  }
});

it("honors an earlier owner's defaultPrevented event", () => {
  const f = fixture();
  try {
    expect(f.sendKey(defaultChord, true).preventDefault).not.toHaveBeenCalled();
    expect(f.showPalette).not.toHaveBeenCalled();
    f.sendKey(defaultChord);
    expect(f.showPalette).toHaveBeenCalledOnce();
  } finally {
    f.settings.dispose();
  }
});

it("shares Settings capture with palette delivery through repeats, keyup and window blur", async () => {
  const f = fixture();
  try {
    await f.capture("palette-recording");
    expect(f.sendKey(defaultChord).preventDefault).toHaveBeenCalledOnce();
    expect(f.contents.send).toHaveBeenCalledExactlyOnceWith(
      settingsIpc.captured,
      {
        captureId: "palette-recording",
        shortcut: {
          accelerator:
            process.platform === "darwin"
              ? "Command+Shift+P"
              : "Control+Shift+P",
        },
      },
    );
    expect(
      f.sendKey({ ...defaultChord, isAutoRepeat: true }).preventDefault,
    ).toHaveBeenCalledOnce();
    expect(
      f.sendKey({ ...defaultChord, type: "keyUp" }).preventDefault,
    ).toHaveBeenCalledOnce();
    expect(f.showPalette).not.toHaveBeenCalled();
    f.sendKey(defaultChord);
    expect(f.showPalette).toHaveBeenCalledTimes(1);

    await f.capture("blur-recording");
    f.window.emit("blur");
    expect(f.contents.send).toHaveBeenLastCalledWith(settingsIpc.captured, {
      captureId: "blur-recording",
      shortcut: { cancelled: true },
    });
    f.sendKey(defaultChord);
    expect(f.showPalette).toHaveBeenCalledTimes(2);
  } finally {
    f.settings.dispose();
  }
});
