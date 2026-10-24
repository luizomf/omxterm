import { describe, expect, it, vi } from "vitest";
import type { SaveDialogOptions } from "electron";

const electron = vi.hoisted(() => ({
  popup: vi.fn(),
  template: undefined as unknown,
}));
vi.mock("electron", () => ({
  app: {},
  dialog: {},
  Menu: {
    buildFromTemplate: (template: unknown) => {
      electron.template = template;
      return { popup: electron.popup };
    },
  },
}));

import {
  isTerminalContextMenuRequest,
  isTerminalExportRequest,
  MAX_TERMINAL_EXPORT_BYTES,
  utf8ByteLength,
} from "../../src/shared/terminal-contract";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  popupTerminalContextMenu,
  saveTerminalExport,
  suggestedTerminalExportName,
  terminalExportFileContent,
  type TerminalExportHost,
} from "../../src/main/terminal-export";

function host(overrides: Partial<TerminalExportHost> = {}) {
  const saveDialogs: SaveDialogOptions[] = [];
  const value = {
    showSaveDialog: vi.fn(async (options: SaveDialogOptions) => {
      saveDialogs.push(options);
      return { canceled: false, filePath: "/synthetic/export.txt" };
    }),
    showMessageBox: vi.fn(async () => ({ response: 0 })),
    writeFile: vi.fn(async () => undefined),
    documentsPath: () => "/synthetic/Documents",
    now: () => new Date(2026, 9, 24, 9, 5, 7),
    ...overrides,
  };
  return { ...value, saveDialogs };
}

describe("export request contract", () => {
  it("measures UTF-8 bytes rather than UTF-16 code units", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("日本")).toBe(6);
    expect(utf8ByteLength("👩‍💻")).toBe(11);
    expect(utf8ByteLength("\ud800")).toBe(3);
    for (const text of ["", "plain", "é日👩‍💻\ud800x"])
      expect(utf8ByteLength(text)).toBe(
        new TextEncoder().encode(text).byteLength,
      );
  });

  it("accepts exact requests up to the byte bound", () => {
    const limit = "a".repeat(MAX_TERMINAL_EXPORT_BYTES);
    expect(isTerminalExportRequest({ kind: "content", text: limit })).toBe(
      true,
    );
    expect(
      isTerminalExportRequest({ kind: "content", text: `${limit}a` }),
    ).toBe(false);
    expect(
      isTerminalExportRequest({
        kind: "selection",
        text: "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2 + 1),
      }),
    ).toBe(false);
    for (const value of [
      null,
      { kind: "selection" },
      { kind: "all", text: "" },
      { kind: "content", text: "", extra: true },
    ])
      expect(isTerminalExportRequest(value)).toBe(false);
    expect(isTerminalContextMenuRequest({ hasSelection: false })).toBe(true);
    expect(isTerminalContextMenuRequest({ hasSelection: 1 })).toBe(false);
    expect(isTerminalContextMenuRequest(undefined)).toBe(false);
  });
});

describe("saving an explicit export", () => {
  it("ends the file with exactly one LF and drops trailing blank rows", () => {
    expect(terminalExportFileContent("a\nb")).toBe("a\nb\n");
    expect(terminalExportFileContent("a\n\n\n")).toBe("a\n");
    expect(terminalExportFileContent("  indented\n\nkept")).toBe(
      "  indented\n\nkept\n",
    );
  });

  it("suggests a kind-specific timestamped name in Documents", async () => {
    expect(
      suggestedTerminalExportName("selection", new Date(2026, 0, 2, 3, 4, 5)),
    ).toBe("omxterm-selection-20260102-030405.txt");
    const fake = host();
    await saveTerminalExport({ kind: "content", text: "日本語" }, fake);
    expect(fake.saveDialogs[0]).toMatchObject({
      title: "Export Terminal Content",
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    expect(fake.saveDialogs[0]!.defaultPath).toMatch(
      /Documents.omxterm-terminal-20261024-090507\.txt$/u,
    );
  });

  it("writes the requested text only after the user picks a destination", async () => {
    const fake = host();
    await expect(
      saveTerminalExport({ kind: "selection", text: "café 👩‍💻\n\n" }, fake),
    ).resolves.toBe("saved");
    expect(fake.writeFile).toHaveBeenCalledExactlyOnceWith(
      "/synthetic/export.txt",
      "café 👩‍💻\n",
    );
    expect(fake.showMessageBox).not.toHaveBeenCalled();
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const fake = host({
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: "" })),
    });
    await expect(
      saveTerminalExport({ kind: "content", text: "text" }, fake),
    ).resolves.toBe("cancelled");
    expect(fake.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ["selection", "The selection has no text to export."],
    ["content", "The terminal has no text to export."],
  ] as const)(
    "explains empty %s content without opening a dialog",
    async (kind, message) => {
      const fake = host();
      await expect(
        saveTerminalExport({ kind, text: " \n\t\n" }, fake),
      ).resolves.toBe("empty");
      expect(fake.showSaveDialog).not.toHaveBeenCalled();
      expect(fake.writeFile).not.toHaveBeenCalled();
      expect(fake.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ type: "info", message }),
      );
    },
  );

  it("reports a failed write with an actionable error", async () => {
    const fake = host({
      writeFile: vi.fn(async () => {
        throw new Error("EACCES: permission denied");
      }),
    });
    await expect(
      saveTerminalExport({ kind: "content", text: "text" }, fake),
    ).resolves.toBe("failed");
    expect(fake.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Export Failed",
        detail: "EACCES: permission denied",
      }),
    );
  });
});

describe("terminal context menu", () => {
  it.each([
    [true, "selection", "Export Selection…"],
    [false, "content", "Export Terminal Content…"],
  ] as const)(
    "labels and requests the %s export from the reported selection",
    (hasSelection, kind, label) => {
      const send = vi.fn();
      const window = { webContents: { send } };
      popupTerminalContextMenu(window as never, { hasSelection });
      const items = electron.template as Array<{
        label?: string;
        click?: () => void;
      }>;
      const item = items.find((entry) => entry.label?.startsWith("Export"))!;
      expect(item.label).toBe(label);
      item.click!();
      expect(send).toHaveBeenCalledExactlyOnceWith(
        terminalIpc.exportRequest,
        kind,
      );
      expect(electron.popup).toHaveBeenLastCalledWith({ window });
    },
  );
});
