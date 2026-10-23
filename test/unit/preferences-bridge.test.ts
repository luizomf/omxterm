import { describe, expect, it, vi } from "vitest";
import type { IpcRenderer } from "electron";
import { createPreferencesBridge } from "../../src/preload/preferences-bridge";
import { preferencesIpc } from "../../src/shared/preferences";
import { preferencesValues } from "../../src/main/preferences-document";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

const values = preferencesValues(DEFAULT_USER_CONFIGURATION, "omtheme", {
  restoreWindows: false,
  highlightOutput: false,
});
const snapshot = {
  values,
  defaults: values,
  schemes: [],
  fontFamilies: [],
  platform: "linux",
};

function ipc(answer: unknown) {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  const fake = {
    invoke: vi.fn(async () => answer),
    on: vi.fn(
      (
        channel: string,
        listener: (event: unknown, payload: unknown) => void,
      ) => {
        listeners.set(channel, listener);
      },
    ),
    removeListener: vi.fn(),
  };
  return {
    bridge: createPreferencesBridge(fake as unknown as IpcRenderer),
    fake,
    emit: (channel: string, payload: unknown) =>
      listeners.get(channel)?.({}, payload),
  };
}

describe("preload Preferences bridge", () => {
  it("validates answers from main", async () => {
    await expect(ipc(snapshot).bridge.get()).resolves.toEqual(snapshot);
    await expect(ipc({ values: {} }).bridge.get()).rejects.toThrow(TypeError);
    await expect(
      ipc({ ok: true, snapshot, extra: 1 }).bridge.save({ fontSize: 18 }),
    ).rejects.toThrow(TypeError);
  });

  it("sends only valid changes", async () => {
    const { bridge, fake } = ipc({ ok: true, snapshot });
    await bridge.save({ fontSize: 18 });
    expect(fake.invoke).toHaveBeenCalledWith(preferencesIpc.save, {
      fontSize: 18,
    });
    await expect(bridge.save({ windowsShell: 5 } as never)).rejects.toThrow(
      TypeError,
    );
    await expect(bridge.captureShortcut("yes" as never)).rejects.toThrow(
      TypeError,
    );
    expect(fake.invoke).toHaveBeenCalledOnce();
  });

  it("passes on only well-formed captured keys", () => {
    const { bridge, emit } = ipc(undefined);
    const listener = vi.fn();
    bridge.onCapturedKey(listener);
    const key = {
      key: "y",
      code: "KeyY",
      control: true,
      meta: false,
      alt: false,
      shift: true,
    };
    emit(preferencesIpc.capturedKey, key);
    emit(preferencesIpc.capturedKey, { ...key, code: 7 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(key);
  });
});
