import { describe, expect, it, vi } from "vitest";
import { startSettings } from "../../src/main/settings-wiring";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { settingsIpc, type SettingsSnapshot } from "../../src/shared/settings";
import type { IpcEvent, IpcHandler } from "../../src/main/terminal-ipc-types";

const snapshot: SettingsSnapshot = {
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "absent",
  text: null,
  values: { "font.size": 16 },
};

function wiring() {
  const handlers = new Map<string, IpcHandler>();
  const service = {
    snapshot: vi.fn(async () => snapshot),
    change: vi.fn(async () => ({
      status: "saved" as const,
      snapshot,
      application: { applied: true as const, notices: [] },
    })),
    saveText: vi.fn(async () => ({
      status: "conflict" as const,
      message: "changed",
      snapshot,
    })),
  };
  const send = vi.fn();
  const sender = { mainFrame: {}, isDestroyed: () => false, send };
  const trustedEvent: IpcEvent = { sender, senderFrame: sender.mainFrame };
  const settings = startSettings({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    },
    isTrustedSender: (event) => event.senderFrame === sender.mainFrame,
    service,
    selectedContents: () => sender,
  });
  return { handlers, service, send, trustedEvent, settings, sender };
}

describe("settings IPC in main", () => {
  it("serves only trusted main frames with typed payloads", async () => {
    const { handlers, service, trustedEvent, sender } = wiring();
    const forged = { sender, senderFrame: {} };
    await expect(handlers.get(settingsIpc.snapshot)!(forged)).rejects.toThrow(
      "Rejected settings sender",
    );
    await expect(
      handlers.get(settingsIpc.change)!(trustedEvent, {
        path: "font.size",
        value: 4,
      }),
    ).rejects.toThrow("Invalid settings change");
    await expect(
      handlers.get(settingsIpc.change)!(trustedEvent, {
        path: "keybinds.copy",
        value: "Alt+C",
      }),
    ).rejects.toThrow("Invalid settings change");
    await expect(
      handlers.get(settingsIpc.saveText)!(trustedEvent, { text: "{}" }),
    ).rejects.toThrow("Invalid settings text");
    expect(service.change).not.toHaveBeenCalled();
    expect(service.saveText).not.toHaveBeenCalled();

    await handlers.get(settingsIpc.change)!(trustedEvent, {
      path: "font.size",
      value: 18,
    });
    await handlers.get(settingsIpc.change)!(trustedEvent, {
      path: "theme.path",
      value: null,
    });
    await handlers.get(settingsIpc.saveText)!(trustedEvent, {
      text: "{}",
      revision: "absent",
    });
    expect(service.change.mock.calls).toEqual([
      [{ path: "font.size", value: 18 }],
      [{ path: "theme.path", value: null }],
    ]);
    expect(service.saveText).toHaveBeenCalledExactlyOnceWith("{}", "absent");
  });

  it("opens Settings in the selected window and removes its handlers once", () => {
    const { handlers, send, settings } = wiring();
    settings.show();
    expect(send).toHaveBeenCalledExactlyOnceWith(settingsIpc.open, undefined);
    settings.dispose();
    settings.dispose();
    expect(handlers.size).toBe(0);
    settings.show();
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("settings preload bridge", () => {
  function bridge(response: unknown) {
    const listeners = new Map<
      string,
      (event: unknown, payload: unknown) => void
    >();
    const invoke = vi.fn(async () => response);
    const value = createSettingsBridge({
      invoke,
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener: (channel) => listeners.delete(channel),
    });
    return { value, invoke, listeners };
  }

  it("validates requests and responses", async () => {
    const valid = bridge(snapshot);
    await expect(valid.value.snapshot()).resolves.toEqual(snapshot);
    await expect(
      valid.value.change({ path: "font.size", value: "big" }),
    ).rejects.toThrow("Invalid settings change");

    const invalid = bridge({ ...snapshot, values: { "keybinds.copy": 1 } });
    await expect(invalid.value.snapshot()).rejects.toThrow(
      "Invalid settings response",
    );
    const badResult = bridge({ status: "saved", snapshot });
    await expect(
      badResult.value.change({ path: "font.size", value: 18 }),
    ).rejects.toThrow("Invalid settings response");
    const conflict = bridge({
      status: "conflict",
      message: "changed",
      snapshot,
    });
    await expect(
      conflict.value.saveText("{}", "absent"),
    ).resolves.toMatchObject({ status: "conflict" });
    expect(conflict.invoke).toHaveBeenCalledWith(settingsIpc.saveText, {
      text: "{}",
      revision: "absent",
    });
  });

  it("delivers an early open request once and ignores payloads", () => {
    const { value, listeners } = bridge(snapshot);
    const handler = listeners.get(settingsIpc.open)!;
    handler({}, "payload");
    handler({}, undefined);
    const listener = vi.fn();
    const remove = value.onOpen(listener);
    expect(listener).toHaveBeenCalledOnce();
    handler({}, undefined);
    expect(listener).toHaveBeenCalledTimes(2);
    remove();
    expect(listeners.has(settingsIpc.open)).toBe(false);
  });
});
