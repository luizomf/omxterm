import { expect, it, vi } from "vitest";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { startSettings } from "../../src/main/settings-wiring";
import {
  themeDocumentIpc,
  isThemeDocumentOpenResult,
  isThemeDocumentSaveResult,
  isThemeDocumentExportResult,
} from "../../src/shared/settings-theme-documents";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { IpcEvent, IpcHandler } from "../../src/main/terminal-ipc-types";

function harness() {
  const handlers = new Map<string, IpcHandler>();
  let destroyed = false;
  const sender = { mainFrame: {}, isDestroyed: () => destroyed, send: vi.fn() };
  const event: IpcEvent = { sender, senderFrame: sender.mainFrame };
  const opened = {
    status: "opened" as const,
    theme: { ...DEFAULT_TERMINAL_THEME, appearance: { paneDivider: null } },
    base: { path: "themes/a.json", revision: "a".repeat(64) },
  };
  const files = {
    openTheme: vi.fn(async () => opened),
    saveTheme: vi.fn(async () => ({
      status: "saved" as const,
      base: opened.base,
    })),
    importTheme: vi.fn(async () => ({
      status: "opened" as const,
      theme: opened.theme,
    })),
    exportTheme: vi.fn(async () => ({ status: "exported" as const })),
  };
  const dialogs = {
    chooseImport: vi.fn(
      async (): Promise<string | null> => "/chosen/import.json",
    ),
    chooseExport: vi.fn(
      async (): Promise<string | null> => "/chosen/export.json",
    ),
  };
  const settings = startSettings({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    },
    isTrustedSender: (e) => e.senderFrame === sender.mainFrame,
    selectedContents: () => sender,
    service: {
      snapshot: vi.fn(),
      themes: vi.fn(),
      change: vi.fn(),
      saveText: vi.fn(),
      changeKeybind: vi.fn(),
      themeDocumentFiles: files,
    },
    themeDialogs: dialogs,
  });
  const invoke = (channel: string, ...payload: unknown[]) =>
    (
      handlers.get(channel) as (
        event: IpcEvent,
        ...payload: unknown[]
      ) => Promise<unknown>
    )(event, ...payload);
  const bridge = createSettingsBridge({
    invoke: (channel, payload) => invoke(channel, payload),
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  return {
    handlers,
    event,
    opened,
    files,
    dialogs,
    settings,
    invoke,
    bridge,
    destroy: () => {
      destroyed = true;
    },
  };
}

it("opens complete theme documents only from trusted main frames and validates responses", async () => {
  const h = harness();
  const invoke = h.handlers.get(themeDocumentIpc.open)!;
  await expect(
    invoke({ ...h.event, senderFrame: {} }, "themes/a.json"),
  ).rejects.toThrow();
  for (const path of [
    "../a.json",
    "themes/nested/a.json",
    "themes/a.json\0",
    null,
    {},
  ])
    await expect(h.invoke(themeDocumentIpc.open, path)).rejects.toThrow();
  await expect(
    h.invoke(themeDocumentIpc.open, "themes/a.json", "extra"),
  ).rejects.toThrow();
  expect(h.files.openTheme).not.toHaveBeenCalled();
  expect(await h.bridge.themeDocuments!.openTheme("themes/a.json")).toEqual(
    h.opened,
  );
  const malformed = createSettingsBridge({
    invoke: vi.fn(async () => ({
      ...h.opened,
      theme: { ...h.opened.theme, appearance: { unknown: null } },
    })),
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  await expect(
    malformed.themeDocuments!.openTheme("themes/a.json"),
  ).rejects.toThrow();
  h.settings.dispose();
  for (const channel of Object.values(themeDocumentIpc))
    expect(h.handlers.has(channel)).toBe(false);
});

it("rejects forged write paths, extra arguments and untrusted requests before dialogs or file access", async () => {
  const h = harness();
  for (const channel of Object.values(themeDocumentIpc)) {
    await expect(
      h.handlers.get(channel)!({ ...h.event, senderFrame: {} }),
    ).rejects.toThrow("Rejected settings sender");
  }
  for (const target of [
    { path: "/arbitrary.json", revision: "a".repeat(64) },
    { path: "themes/nested/out.json", revision: "a".repeat(64) },
    { newFilename: "../out.json" },
    { newFilename: "a.json", extra: true },
  ])
    await expect(
      h.invoke(themeDocumentIpc.save, {
        theme: DEFAULT_TERMINAL_THEME,
        target,
      }),
    ).rejects.toThrow();
  for (const channel of [themeDocumentIpc.import, themeDocumentIpc.export]) {
    await expect(
      h.invoke(
        channel,
        channel === themeDocumentIpc.export
          ? DEFAULT_TERMINAL_THEME
          : undefined,
        "extra",
      ),
    ).rejects.toThrow();
  }
  await expect(
    h.invoke(themeDocumentIpc.import, { path: "/arbitrary" }),
  ).rejects.toThrow();
  await expect(
    h.invoke(themeDocumentIpc.export, {
      ...DEFAULT_TERMINAL_THEME,
      colors: {},
    }),
  ).rejects.toThrow();
  expect(h.dialogs.chooseImport).not.toHaveBeenCalled();
  expect(h.dialogs.chooseExport).not.toHaveBeenCalled();
  expect(h.files.saveTheme).not.toHaveBeenCalled();
  expect(
    await h.bridge.themeDocuments!.saveTheme({
      theme: DEFAULT_TERMINAL_THEME,
      target: h.opened.base,
    }),
  ).toEqual({ status: "saved", base: h.opened.base });
  h.settings.dispose();
});

it("binds native choosers to their invoking owner, preserves captured export bytes and discards retired choices", async () => {
  const h = harness();
  expect(await h.bridge.themeDocuments!.importTheme()).toEqual({
    status: "opened",
    theme: h.opened.theme,
  });
  expect(h.dialogs.chooseImport).toHaveBeenCalledWith(h.event.sender);
  expect(h.files.importTheme).toHaveBeenCalledWith("/chosen/import.json");
  h.dialogs.chooseImport.mockResolvedValueOnce(null);
  expect(await h.bridge.themeDocuments!.importTheme()).toEqual({
    status: "cancelled",
  });
  expect(h.files.importTheme).toHaveBeenCalledTimes(1);
  let choose!: (path: string | null) => void;
  h.dialogs.chooseExport.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  const mutable = {
    ...DEFAULT_TERMINAL_THEME,
    colors: { ...DEFAULT_TERMINAL_THEME.colors },
  };
  const exported = h.bridge.themeDocuments!.exportTheme(mutable);
  mutable.colors.red = "#112233";
  choose("/chosen/new.json");
  expect(await exported).toEqual({ status: "exported" });
  expect(h.files.exportTheme).toHaveBeenCalledWith(
    "/chosen/new.json",
    DEFAULT_TERMINAL_THEME,
  );
  h.dialogs.chooseExport.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  const retired = h.bridge.themeDocuments!.exportTheme(DEFAULT_TERMINAL_THEME);
  h.destroy();
  choose("/chosen/retired.json");
  expect(await retired).toEqual({ status: "cancelled" });
  expect(h.files.exportTheme).toHaveBeenCalledTimes(1);
  h.settings.dispose();
});

it("accepts only exact bounded document outcomes through preload", async () => {
  for (const value of [
    null,
    {},
    { status: "cancelled", extra: true },
    { status: "failed", reason: "unknown" },
    { status: "failed", reason: "read", detail: "secret\n" },
    { status: "failed", reason: "read", detail: "a".repeat(257) },
  ]) {
    expect(isThemeDocumentOpenResult(value)).toBe(false);
    expect(isThemeDocumentSaveResult(value)).toBe(false);
    expect(isThemeDocumentExportResult(value)).toBe(false);
  }
  expect(
    isThemeDocumentOpenResult({
      status: "opened",
      theme: { ...DEFAULT_TERMINAL_THEME, appearance: {} },
    }),
  ).toBe(true);
  expect(
    isThemeDocumentOpenResult({
      status: "opened",
      theme: DEFAULT_TERMINAL_THEME,
      base: { path: "../bad.json", revision: "a".repeat(64) },
    }),
  ).toBe(false);
  expect(
    isThemeDocumentSaveResult({
      status: "saved",
      base: { path: "themes/.json", revision: "a".repeat(64) },
      warning: "cleanup",
    }),
  ).toBe(true);
  expect(
    isThemeDocumentExportResult({ status: "exported", warning: "cleanup" }),
  ).toBe(true);
  const bridge = createSettingsBridge({
    invoke: vi.fn(async () => ({
      status: "saved",
      base: { path: "/arbitrary", revision: "x" },
    })),
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  await expect(
    bridge.themeDocuments!.saveTheme({
      theme: DEFAULT_TERMINAL_THEME,
      target: { newFilename: "new.json" },
    }),
  ).rejects.toThrow();
  await expect(
    bridge.themeDocuments!.exportTheme(DEFAULT_TERMINAL_THEME),
  ).rejects.toThrow();
});
