import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { createSettingsService } from "../../src/main/settings-service";
import { startSettings } from "../../src/main/settings-wiring";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { settingsIpc } from "../../src/shared/settings";
import {
  isCapturedShortcut,
  isSettingsKeybindChange,
  isShortcutCaptureRequest,
  isShortcutCaptureResult,
} from "../../src/shared/settings-keybinds";
import {
  acceleratorForKeyboardInput,
  terminalDefaultKeybinds,
  terminalActionForKeyboardInput,
  TERMINAL_ACTION_NAMES,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function service(contents?: string) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-shortcuts-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  if (contents !== undefined) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return {
    file,
    service: createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      reload: vi.fn(async () => ({ applied: true as const, notices: [] })),
    }),
  };
}

const key = (overrides: Record<string, unknown>) => ({
  type: "keyDown",
  key: "a",
  code: "KeyA",
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...overrides,
});

describe("recorded accelerators", () => {
  it.each([
    ["<", "Comma", true, "Control+Shift+,"],
    ["!", "Digit1", true, "Control+Shift+1"],
    ["+", "Equal", true, "Control+Shift+="],
    ["+", "IntlBackslash", false, "Control+Plus"],
    ["+", "IntlBackslash", true, "Control+Shift+Plus"],
    ["+", "NumpadAdd", false, "Control+Numadd"],
    ["-", "NumpadSubtract", false, "Control+Numsub"],
    ["*", "NumpadMultiply", false, "Control+Nummult"],
    ["/", "NumpadDivide", true, "Control+Shift+Numdiv"],
    [".", "NumpadDecimal", false, "Control+Numdec"],
    ["3", "Numpad3", false, "Control+Num3"],
  ] as const)(
    "roundtrips %s at %s (shift=%s) including Plus/keypad exceptions",
    (logical, code, shift, expected) => {
      const input = key({ key: logical, code, shift, control: true });
      expect(acceleratorForKeyboardInput(input, "linux")).toBe(expected);
      const bindings = Object.fromEntries(
        TERMINAL_ACTION_NAMES.map((action) => [action, null]),
      ) as TerminalKeybinds;
      expect(
        terminalActionForKeyboardInput(
          { ...bindings, find: expected },
          input,
          "linux",
        ),
      ).toBe("find");
    },
  );

  it("validates the exact bounded capture request and notification envelopes", () => {
    expect(
      isShortcutCaptureRequest({ captureId: "capture-1", active: true }),
    ).toBe(true);
    expect(
      isShortcutCaptureResult({
        captureId: "capture-1",
        shortcut: { cancelled: true },
      }),
    ).toBe(true);
    for (const captureId of [
      "",
      "x".repeat(65),
      "space not allowed",
      1,
      null,
    ]) {
      expect(isShortcutCaptureRequest({ captureId, active: true })).toBe(false);
      expect(
        isShortcutCaptureResult({ captureId, shortcut: { invalid: true } }),
      ).toBe(false);
    }
    for (const value of [
      true,
      { captureId: "capture-1" },
      { captureId: "capture-1", active: "yes" },
      { captureId: "capture-1", active: true, extra: false },
    ])
      expect(isShortcutCaptureRequest(value)).toBe(false);
    for (const value of [
      { accelerator: "F2" },
      { captureId: "capture-1", shortcut: { accelerator: "a" } },
      { captureId: "capture-1", shortcut: { cancelled: true }, extra: false },
    ])
      expect(isShortcutCaptureResult(value)).toBe(false);
  });
  it("rejects shifted characters whose spelling names a different native key", () => {
    expect(
      acceleratorForKeyboardInput(
        key({
          key: "<",
          code: "IntlBackslash",
          control: true,
          shift: true,
        }),
        "linux",
      ),
    ).toBeUndefined();
  });
  it("spells the native identity delivery matches", () => {
    const spell = (input: Record<string, unknown>, platform = "linux") =>
      acceleratorForKeyboardInput(key(input), platform);
    expect(spell({ key: "F", code: "KeyF", control: true, shift: true })).toBe(
      "Control+Shift+F",
    );
    expect(spell({ key: "F11", code: "F11" })).toBe("F11");
    expect(spell({ key: "e", code: "KeyE", altGr: true })).toBe("AltGr+E");
    expect(spell({ key: "k", code: "KeyK", meta: true }, "darwin")).toBe(
      "Command+K",
    );
    expect(spell({ key: "Control", code: "ControlLeft", control: true })).toBe(
      undefined,
    );
    expect(spell({ key: "a", code: "KeyA" })).toBeUndefined();
  });

  it("validates exact keybind changes and captured keys", () => {
    for (const change of [
      { action: "find", choice: { state: "inherit" } },
      { action: "find", choice: { state: "unbound" } },
      { action: "find", choice: { state: "custom", accelerator: "F11" } },
    ])
      expect(isSettingsKeybindChange(change)).toBe(true);
    for (const change of [
      { action: "nope", choice: { state: "inherit" } },
      { action: "find", choice: { state: "custom", accelerator: "a" } },
      { action: "find", choice: { state: "custom" } },
      { action: "find", choice: { state: "unbound", accelerator: "F2" } },
    ])
      expect(isSettingsKeybindChange(change)).toBe(false);
    expect(isCapturedShortcut({ accelerator: "Control+K" })).toBe(true);
    expect(isCapturedShortcut({ invalid: true })).toBe(true);
    expect(isCapturedShortcut({ accelerator: "k" })).toBe(false);
  });
});

describe("saving shortcuts", () => {
  it("saves and resets the default-unbound auxiliary panel binding", async () => {
    const view = await service('{ "version": 1 }\n');
    expect(
      (await view.service.snapshot()).keybinds?.toggleAuxiliaryPanel,
    ).toEqual({ effective: null, state: "inherit" });
    for (const choice of [
      { state: "custom", accelerator: "Control+Alt+J" },
      { state: "unbound" },
      { state: "inherit" },
    ] as const) {
      const result = await view.service.changeKeybind({
        action: "toggleAuxiliaryPanel",
        choice,
      });
      expect(result.status).toBe("saved");
      expect(result.snapshot.keybinds?.toggleAuxiliaryPanel).toEqual({
        effective: choice.state === "custom" ? choice.accelerator : null,
        state: choice.state,
      });
    }
    expect(JSON.parse(await readFile(view.file, "utf8"))).toEqual({
      version: 1,
    });
  });

  it("writes custom, null and inherited states without touching other entries", async () => {
    const view = await service(
      '{\n  "version": 1,\n  "font": { "size": 18 },\n  "keybinds": { "newTab": "Control+Alt+T" }\n}\n',
    );
    const snapshot = await view.service.snapshot();
    expect(snapshot.keybinds?.newTab).toEqual({
      effective: "Control+Alt+T",
      state: "custom",
    });
    expect(snapshot.keybinds?.find).toEqual({
      effective: terminalDefaultKeybinds("linux").find,
      state: "inherit",
    });

    await view.service.changeKeybind({
      action: "find",
      choice: { state: "unbound" },
    });
    let file = JSON.parse(await readFile(view.file, "utf8")) as Record<
      string,
      unknown
    >;
    expect(file).toEqual({
      version: 1,
      font: { size: 18 },
      keybinds: { newTab: "Control+Alt+T", find: null },
    });

    const result = await view.service.changeKeybind({
      action: "find",
      choice: { state: "custom", accelerator: "F2" },
    });
    expect(result.snapshot.keybinds?.find).toEqual({
      effective: "F2",
      state: "custom",
    });

    await view.service.changeKeybind({
      action: "find",
      choice: { state: "inherit" },
    });
    await view.service.changeKeybind({
      action: "newTab",
      choice: { state: "inherit" },
    });
    file = JSON.parse(await readFile(view.file, "utf8")) as Record<
      string,
      unknown
    >;
    expect(file).toEqual({ version: 1, font: { size: 18 } });
  });

  it("rejects a colliding shortcut with the loader's actionable message", async () => {
    const view = await service('{ "version": 1 }\n');
    const before = await readFile(view.file, "utf8");
    const result = await view.service.changeKeybind({
      action: "find",
      choice: { state: "custom", accelerator: "Control+Shift+T" },
    });
    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.message).toContain("newTab");
    expect(await readFile(view.file, "utf8")).toBe(before);
  });
});

describe("main-owned capture", () => {
  function target() {
    const sent: unknown[] = [];
    return {
      sent,
      send: (_channel: string, payload: unknown) => sent.push(payload),
    };
  }

  it("reports one key instead of running its keybind, and swallows its release", () => {
    let time = 0;
    const capture = createKeybindCapture("linux", () => time);
    const window = target();
    const invoke = vi.fn();
    const contents = Object.assign(new EventEmitter(), { send: window.send });
    deliverKeybindsFromKeyEvents(
      contents,
      () => terminalDefaultKeybinds("linux"),
      invoke,
      "linux",
      capture,
    );
    const press = (input: Record<string, unknown>) => {
      const event = { preventDefault: vi.fn() };
      contents.emit("before-input-event", event, key(input));
      return event.preventDefault.mock.calls.length > 0;
    };
    const find = { key: "F", code: "KeyF", control: true, shift: true };

    capture.set(contents, { captureId: "first", active: true });
    expect(press({ key: "Control", code: "ControlLeft", control: true })).toBe(
      true,
    );
    expect(press({ key: "a", code: "KeyA" })).toBe(true);
    expect(press(find)).toBe(true);
    expect(press({ ...find, type: "keyUp" })).toBe(true);
    expect(window.sent).toEqual([
      { captureId: "first", shortcut: { invalid: true } },
      { captureId: "first", shortcut: { accelerator: "Control+Shift+F" } },
    ]);
    expect(invoke).not.toHaveBeenCalled();

    // Capture ended after one key: the keybind runs exactly once again.
    expect(press(find)).toBe(true);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("find");
    expect(press({ ...find, type: "keyUp" })).toBe(false);

    capture.set(contents, { captureId: "escape", active: true });
    expect(press({ key: "Escape", code: "Escape" })).toBe(true);
    expect(window.sent.at(-1)).toEqual({
      captureId: "escape",
      shortcut: { cancelled: true },
    });

    capture.set(contents, { captureId: "timeout", active: true });
    time = 30_001;
    expect(press({ key: "b", code: "KeyB" })).toBe(false);
    expect(window.sent.at(-1)).toEqual({
      captureId: "timeout",
      shortcut: { cancelled: true },
    });
  });

  it("accepts capture only from a trusted sender with an exact bounded generation request", async () => {
    const handlers = new Map<
      string,
      (event: never, payload?: unknown) => Promise<unknown>
    >();
    const sender = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
    const capture = { set: vi.fn() };
    const view = await service('{ "version": 1 }\n');
    startSettings({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler as never),
        removeHandler: (channel) => handlers.delete(channel),
      },
      isTrustedSender: (event) => event.senderFrame === sender.mainFrame,
      service: view.service,
      selectedContents: () => sender,
      capture,
    });
    const run = handlers.get(settingsIpc.capture)!;
    const trusted = { sender, senderFrame: sender.mainFrame } as never;
    const request = { captureId: "first", active: true };
    await run(trusted, request);
    expect(capture.set).toHaveBeenCalledExactlyOnceWith(sender, request);
    await expect(run(trusted, "yes")).rejects.toThrow(TypeError);
    await expect(
      run({ sender, senderFrame: {} } as never, false),
    ).rejects.toThrow("Rejected settings sender");
    await expect(
      handlers.get(settingsIpc.keybind)!(trusted, {
        action: "find",
        choice: { state: "custom", accelerator: "a" },
      }),
    ).rejects.toThrow("Invalid shortcut change");
  });

  it("starts and ends capture through the bridge, keeping it after an invalid key", async () => {
    const listeners = new Map<
      string,
      (event: unknown, payload: unknown) => void
    >();
    const invoke = vi.fn(
      async (_channel: string, _payload?: unknown) => undefined,
    );
    const bridge = createSettingsBridge({
      invoke,
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener: (channel) => listeners.delete(channel),
    });
    const received = vi.fn();
    bridge.captureShortcut(received);
    const request = invoke.mock.calls.at(-1)![1] as {
      captureId: string;
      active: boolean;
    };
    expect(typeof request.captureId).toBe("string");
    expect(request.captureId.length).toBeGreaterThan(0);
    expect(request.active).toBe(true);
    const deliver = (shortcut: unknown) =>
      listeners.get(settingsIpc.captured)?.(
        {},
        { captureId: request.captureId, shortcut },
      );
    deliver({ invalid: true });
    deliver({ accelerator: "nonsense" });
    deliver({ accelerator: "Control+K" });
    deliver({ accelerator: "Control+L" });
    expect(received.mock.calls).toEqual([
      [{ invalid: true }],
      [{ accelerator: "Control+K" }],
    ]);
    expect(invoke).toHaveBeenLastCalledWith(settingsIpc.capture, {
      captureId: request.captureId,
      active: false,
    });
    await Promise.resolve();
  });
});
