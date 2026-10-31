import { describe, expect, it, vi } from "vitest";
import { startCommandPalette } from "../../src/main/command-palette";
import {
  createCoreActionCatalog,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { paletteIpc } from "../../src/shared/command-palette";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { IpcEvent } from "../../src/main/terminal-ipc-types";

function scene() {
  const handlers = new Map<
    string,
    (event: IpcEvent, ...args: unknown[]) => unknown
  >();
  const sender = {
    mainFrame: {},
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };
  const other = { ...sender, mainFrame: {} };
  let selected: typeof sender | undefined = sender;
  let accepted = true;
  const invoked = vi.fn();
  const actions = new Proxy({} as TerminalApplicationMenuActions, {
    get: () => invoked,
  });
  let catalog = createCoreActionCatalog(
    "OMXTerm",
    actions,
    terminalDefaultKeybinds("linux"),
  );
  const manager = startCommandPalette({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel) => {
        handlers.delete(channel);
      },
    },
    isTrustedSender: () => accepted,
    selectedContents: () => selected,
    catalog: () => catalog,
  });
  const event = { sender, senderFrame: sender.mainFrame };
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)!(event, ...args);
  const snapshot = () =>
    call(paletteIpc.snapshot) as { token: string; actions: { id: string }[] };
  return {
    sender,
    other,
    event,
    handlers,
    manager,
    invoked,
    call,
    snapshot,
    select: (value: typeof selected) => {
      selected = value;
    },
    reject: () => {
      accepted = false;
    },
    reload: () => {
      catalog = createCoreActionCatalog(
        "OMXTerm",
        actions,
        terminalDefaultKeybinds("linux"),
      );
    },
  };
}

describe("main palette capability", () => {
  it.each([
    ["toggleTabBar", terminalIpc.tabBarToggle],
    ["toggleAuxiliaryPanel", terminalIpc.auxiliaryPanelToggle],
  ] as const)(
    "projects %s, executes once, and scopes dispatch only to the captured owner",
    (id, channel) => {
      const s = scene();
      const { token, actions } = s.snapshot();
      expect(actions.map(({ id }) => id)).toContain(id);
      expect(actions.map(({ id }) => id)).not.toContain("copy");
      s.invoked.mockImplementation(() => {
        s.manager.send(s.sender, channel);
        s.manager.send(s.other, channel);
      });
      s.call(paletteIpc.invoke, token, id);
      expect(s.sender.send.mock.calls).toContainEqual([
        paletteIpc.dispatch,
        { token, channel, payload: undefined },
      ]);
      expect(s.other.send.mock.calls).toContainEqual([channel, undefined]);
      s.call(paletteIpc.invoke, token, id);
      expect(s.invoked).toHaveBeenCalledTimes(1);
      s.manager.send(s.sender, channel);
      expect(s.sender.send).toHaveBeenLastCalledWith(channel, undefined);
    },
  );
  it.each(["selection", "catalog", "token", "excluded", "unknown"])(
    "rejects stale/invalid %s without retargeting",
    (kind) => {
      const s = scene();
      const { token } = s.snapshot();
      if (kind === "selection") s.manager.invalidate(s.sender);
      if (kind === "catalog") s.reload();
      s.call(
        paletteIpc.invoke,
        kind === "token" ? "other" : token,
        kind === "excluded"
          ? "copy"
          : kind === "unknown"
            ? "__proto__"
            : "toggleTabBar",
      );
      expect(s.invoked).not.toHaveBeenCalled();
      s.call(paletteIpc.invoke, token, "toggleTabBar");
      expect(s.invoked).not.toHaveBeenCalled();
    },
  );
  it("rejects foreign frames, unknown senders, dead owners and another selected window", () => {
    const s = scene();
    const request = s.handlers.get(paletteIpc.snapshot)!;
    expect(() => request({ ...s.event, senderFrame: {} })).toThrow("owner");
    s.select(s.other);
    expect(() => request(s.event)).toThrow("owner");
    s.select(s.sender);
    s.sender.isDestroyed.mockReturnValue(true);
    expect(() => request(s.event)).toThrow("owner");
    s.sender.isDestroyed.mockReturnValue(false);
    s.reject();
    expect(() => request(s.event)).toThrow("owner");
  });
  it("validates bounded argument shapes and removes handlers on disposal", () => {
    const s = scene();
    expect(() => s.call(paletteIpc.snapshot, {})).toThrow(TypeError);
    expect(() => s.call(paletteIpc.invoke, {}, "quit")).toThrow(TypeError);
    expect(() => s.call(paletteIpc.invoke, "x".repeat(257), "quit")).toThrow(
      TypeError,
    );
    expect(() => s.call(paletteIpc.invoke, "x", "quit", "extra")).toThrow(
      TypeError,
    );
    s.manager.show();
    expect(s.sender.send).toHaveBeenCalledWith(paletteIpc.open, undefined);
    s.manager.dispose();
    expect(s.handlers.size).toBe(0);
  });
});
