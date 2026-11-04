import { describe, expect, it, vi } from "vitest";
import { startSettings } from "../../src/main/settings-wiring";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { emptyThemes } from "../fixtures/settings-themes";
import { settingsIpc } from "../../src/shared/settings";
import {
  isSettingsThemesResult,
  MAX_SETTINGS_THEMES,
  MAX_SETTINGS_THEME_REASON_LENGTH,
  type SettingsThemesResult,
} from "../../src/shared/settings-themes";
import type { IpcEvent, IpcHandler } from "../../src/main/terminal-ipc-types";

const theme = {
  path: "themes/one.json",
  name: "Synthetic",
  colors: {
    background: "#001122",
    foreground: "#112233",
    red: "#223344",
    green: "#334455",
    yellow: "#445566",
    blue: "#556677",
    magenta: "#667788",
    cyan: "#778899",
  },
};
const result: SettingsThemesResult = {
  status: "ok",
  themes: [theme],
  invalid: [
    { path: "themes/bad.json", reason: "invalid", detail: "Invalid JSON." },
  ],
  truncated: false,
  hasConfiguredTheme: true,
  selectedPath: theme.path,
};

describe("settings themes IPC", () => {
  it("only serves no-payload requests from trusted main frames and removes its handler", async () => {
    const handlers = new Map<string, IpcHandler>();
    const themes = vi.fn(async () => result);
    const sender = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
    const trusted: IpcEvent = { sender, senderFrame: sender.mainFrame };
    const settings = startSettings({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        removeHandler: (channel) => handlers.delete(channel),
      },
      isTrustedSender: (event) => event.senderFrame === sender.mainFrame,
      service: {
        themes,
        snapshot: vi.fn(),
        change: vi.fn(),
        changeKeybind: vi.fn(),
        saveText: vi.fn(),
      },
      selectedContents: () => sender,
    });
    const invoke = handlers.get(settingsIpc.themes)!;
    await expect(invoke({ sender, senderFrame: {} })).rejects.toThrow(
      "Rejected settings sender",
    );
    for (const payload of [
      null,
      {},
      { directory: "/arbitrary" },
      "x".repeat(1_000_000),
    ]) {
      await expect(invoke(trusted, payload)).rejects.toThrow(
        "Invalid settings request",
      );
    }
    const extraArguments = invoke as (
      event: IpcEvent,
      ...payload: unknown[]
    ) => Promise<unknown>;
    await expect(
      extraArguments(trusted, undefined, "/arbitrary"),
    ).rejects.toThrow("Invalid settings request");
    expect(themes).not.toHaveBeenCalled();
    await expect(invoke(trusted)).resolves.toEqual(result);
    expect(themes).toHaveBeenCalledOnce();
    settings.dispose();
    expect(handlers.has(settingsIpc.themes)).toBe(false);
    await expect(invoke(trusted)).rejects.toThrow("Rejected settings sender");
  });

  it("delivers only validated bounded responses through preload", async () => {
    const invoke = vi.fn(async () => result as unknown);
    const bridge = createSettingsBridge({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    await expect(bridge.themes()).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(settingsIpc.themes);
    for (const response of [
      null,
      { ...result, status: "unknown" },
      { ...result, hasConfiguredTheme: false },
      { ...result, hasConfiguredTheme: undefined },
      { ...result, selectedPath: "themes/bad.json" },
      { ...result, selectedPath: "themes/not-present.json" },
      { ...result, themes: [{ ...theme, path: "../outside.json" }] },
      { ...result, themes: [{ ...theme, path: "themes/nested/outside.json" }] },
      { ...result, themes: [{ ...theme, name: "unsafe\nname" }] },
      {
        ...result,
        themes: [
          {
            ...theme,
            colors: { ...theme.colors, red: "url(https://invalid)" },
          },
        ],
      },
      {
        ...result,
        themes: [
          { ...theme, colors: { ...theme.colors, unexpected: "#000000" } },
        ],
      },
      { ...result, themes: [theme, theme] },
      {
        ...result,
        invalid: [
          { path: "themes/bad.json", reason: "invalid", detail: "bad\ntext" },
        ],
      },
      {
        ...result,
        invalid: [
          {
            path: "themes/bad.json",
            reason: "invalid",
            detail: "x".repeat(MAX_SETTINGS_THEME_REASON_LENGTH + 1),
          },
        ],
      },
      {
        ...result,
        themes: Array.from({ length: MAX_SETTINGS_THEMES + 1 }, (_, index) => ({
          ...theme,
          path: `themes/${index}.json`,
        })),
      },
      {
        ...result,
        invalid: [{ path: "themes/bad.json", reason: "unknown-value" }],
      },
      {
        ...result,
        invalid: [
          { path: "themes/bad.json", reason: "read", detail: "not allowed" },
        ],
      },
      { ...result, status: "missing" },
      { ...result, extra: "untrusted" },
    ]) {
      invoke.mockResolvedValueOnce(response);
      await expect(bridge.themes()).rejects.toThrow(
        "Invalid settings themes response",
      );
    }
  });

  it("accepts empty, missing, unavailable and explicitly truncated results", () => {
    for (const candidate of [
      result,
      emptyThemes,
      {
        status: "ok",
        themes: [],
        invalid: [],
        truncated: false,
        hasConfiguredTheme: false,
      },
      {
        status: "missing",
        themes: [],
        invalid: [],
        truncated: false,
        hasConfiguredTheme: true,
      },
      { status: "unavailable", themes: [], invalid: [], truncated: false },
      {
        status: "ok",
        themes: [],
        invalid: [],
        truncated: true,
        hasConfiguredTheme: false,
      },
    ])
      expect(isSettingsThemesResult(candidate)).toBe(true);
  });
});
