import { describe, expect, it, vi } from "vitest";
import type { SaveDialogOptions } from "electron";

const electron = vi.hoisted(() => ({
  popup: vi.fn(),
  template: undefined as unknown,
  showSaveDialog:
    vi.fn<() => Promise<{ canceled: boolean; filePath: string }>>(),
  showMessageBox: vi.fn(async () => ({ response: 0 })),
  writeFile: vi.fn(async () => {}),
}));
vi.mock("node:fs/promises", () => ({ writeFile: electron.writeFile }));
vi.mock("electron", () => ({
  app: { getPath: () => "/synthetic/Documents" },
  dialog: {
    showSaveDialog: electron.showSaveDialog,
    showMessageBox: electron.showMessageBox,
  },
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
  electronTerminalExportHost,
  popupTerminalContextMenu,
  saveTerminalExport,
  suggestedTerminalExportName,
  terminalExportFileContent,
  type TerminalExportHost,
} from "../../src/main/terminal-export";

function host(overrides: Partial<TerminalExportHost> = {}) {
  const saveDialogs: SaveDialogOptions[] = [];
  const value = {
    isAlive: () => true,
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
    expect(
      isTerminalContextMenuRequest({
        target: "terminal",
        hasSelection: false,
        contextId: 1,
      }),
    ).toBe(true);
    expect(isTerminalContextMenuRequest({ target: "field" })).toBe(true);
    for (const value of [
      { hasSelection: false },
      { target: "terminal", hasSelection: 1 },
      { target: "field", hasSelection: true },
      { target: "panel" },
    ])
      expect(isTerminalContextMenuRequest(value)).toBe(false);
    expect(isTerminalContextMenuRequest(undefined)).toBe(false);
  });
});

describe("saving an explicit export", () => {
  it.each(["controller", "window", "renderer"] as const)(
    "honors %s loss through the actual Electron host while choosing",
    async (owner) => {
      let controllerAlive = true;
      let windowDestroyed = false;
      let rendererDestroyed = false;
      let finish!: (value: { canceled: boolean; filePath: string }) => void;
      electron.showSaveDialog.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      electron.showMessageBox.mockClear();
      electron.writeFile.mockClear();
      const window = {
        isDestroyed: () => windowDestroyed,
        webContents: { isDestroyed: () => rendererDestroyed },
      };
      const saving = saveTerminalExport(
        { kind: "content", text: "synthetic" },
        electronTerminalExportHost(window as never, () => controllerAlive),
      );
      if (owner === "controller") controllerAlive = false;
      if (owner === "window") windowDestroyed = true;
      if (owner === "renderer") rendererDestroyed = true;
      finish({ canceled: false, filePath: "/synthetic/export.txt" });
      await expect(saving).resolves.toBe("cancelled");
      expect(electron.writeFile).not.toHaveBeenCalled();
      expect(electron.showMessageBox).not.toHaveBeenCalled();
    },
  );
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

  it.each([
    { canceled: true, filePath: "" },
    { canceled: true, filePath: "/synthetic/existing.txt" },
    { canceled: false, filePath: "" },
  ])(
    "writes nothing for cancellation or no destination: %j",
    async (choice) => {
      const fake = host({
        showSaveDialog: vi.fn(async () => choice),
      });
      await expect(
        saveTerminalExport({ kind: "content", text: "text" }, fake),
      ).resolves.toBe("cancelled");
      expect(fake.writeFile).not.toHaveBeenCalled();
      expect(fake.showMessageBox).not.toHaveBeenCalled();
    },
  );

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

  it("reports a size preflight rejection with a fixed actionable notice and no chooser/write", async () => {
    const fake = host();
    await expect(
      saveTerminalExport({ notice: "too-large" }, fake),
    ).resolves.toBe("too-large");
    expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Export Too Large",
        message: "The requested text exceeds the 16 MiB UTF-8 export limit.",
      }),
    );
    expect(vi.mocked(fake.showMessageBox).mock.calls[0]![0].detail).toContain(
      "Select a smaller portion",
    );
    expect(fake.showSaveDialog).not.toHaveBeenCalled();
    expect(fake.writeFile).not.toHaveBeenCalled();
  });

  it.each([{ notice: "too-large" }, { kind: "content", text: " " }] as const)(
    "never retries a rejected informational notice: %j",
    async (request) => {
      const fake = host({
        showMessageBox: vi.fn(async () => {
          throw new Error("private notice failure");
        }),
      });
      await expect(saveTerminalExport(request, fake)).resolves.toBe("failed");
      expect(fake.showMessageBox).toHaveBeenCalledTimes(1);
      expect(fake.showSaveDialog).not.toHaveBeenCalled();
      expect(fake.writeFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    { notice: "too-large" },
    { kind: "content", text: " " },
    { kind: "content", text: "text" },
  ] as const)("does nothing for an already lost owner: %j", async (request) => {
    const fake = host({ isAlive: () => false });
    await expect(saveTerminalExport(request, fake)).resolves.toBe("cancelled");
    expect(fake.showMessageBox).not.toHaveBeenCalled();
    expect(fake.showSaveDialog).not.toHaveBeenCalled();
    expect(fake.writeFile).not.toHaveBeenCalled();
  });

  it.each(["documentsPath", "now", "showSaveDialog"] as const)(
    "reports %s failures once without writing or exposing raw errors",
    async (operation) => {
      const fake = host({
        [operation]: vi.fn(() => {
          throw new Error("private native detail /synthetic/private");
        }),
      });
      await expect(
        saveTerminalExport({ kind: "content", text: "text" }, fake),
      ).resolves.toBe("failed");
      expect(fake.writeFile).not.toHaveBeenCalled();
      expect(fake.showMessageBox).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(vi.mocked(fake.showMessageBox).mock.calls),
      ).not.toContain("private");
    },
  );

  it("contains a rejected chooser and rejected error notice without retrying", async () => {
    const fake = host({
      showSaveDialog: vi.fn(async () => {
        throw new Error("native chooser");
      }),
      showMessageBox: vi.fn(async () => {
        throw new Error("notice unavailable");
      }),
    });
    await expect(
      saveTerminalExport({ kind: "content", text: "text" }, fake),
    ).resolves.toBe("failed");
    expect(fake.showMessageBox).toHaveBeenCalledTimes(1);
    expect(fake.writeFile).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "makes a late chooser %s inert after owner loss",
    async (settlement) => {
      let alive = true;
      let resolve!: (value: { canceled: boolean; filePath: string }) => void;
      let reject!: (cause: Error) => void;
      const fake = host({
        isAlive: () => alive,
        showSaveDialog: vi.fn(
          () =>
            new Promise((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        ),
      } as Partial<TerminalExportHost>);
      const saving = saveTerminalExport(
        { kind: "content", text: "text" },
        fake,
      );
      alive = false;
      if (settlement === "resolve")
        resolve({ canceled: false, filePath: "/synthetic/export.txt" });
      else reject(new Error("native chooser"));
      await expect(saving).resolves.toBe("cancelled");
      expect(fake.writeFile).not.toHaveBeenCalled();
      expect(fake.showMessageBox).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "allows an already-started write to settle (success: %s) without an orphan notice",
    async (success) => {
      let alive = true;
      let resolve!: () => void;
      let reject!: (cause: Error) => void;
      const fake = host({
        isAlive: () => alive,
        writeFile: vi.fn(
          () =>
            new Promise<void>((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        ),
      } as Partial<TerminalExportHost>);
      const saving = saveTerminalExport(
        { kind: "content", text: "text" },
        fake,
      );
      await vi.waitFor(() => expect(fake.writeFile).toHaveBeenCalledTimes(1));
      alive = false;
      if (success) resolve();
      else reject(new Error("private write failure"));
      await expect(saving).resolves.toBe(success ? "saved" : "failed");
      expect(fake.showMessageBox).not.toHaveBeenCalled();
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
        detail:
          "Try exporting again and choose a writable destination with enough free space.",
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
      const window = {
        isDestroyed: () => false,
        webContents: { send, isDestroyed: () => false },
      };
      popupTerminalContextMenu(window as never, {
        target: "terminal",
        hasSelection,
        contextId: 17,
      });
      const items = electron.template as Array<{
        label?: string;
        click?: () => void;
      }>;
      const item = items.find((entry) => entry.label?.startsWith("Export"))!;
      expect(item.label).toBe(label);
      item.click!();
      expect(send).toHaveBeenCalledExactlyOnceWith(terminalIpc.exportRequest, {
        kind,
        contextId: 17,
      });
      expect(electron.popup).toHaveBeenLastCalledWith({ window });
    },
  );

  it("offers only editing actions for a text field", () => {
    const send = vi.fn();
    popupTerminalContextMenu({ webContents: { send } } as never, {
      target: "field",
    });
    const labels = (electron.template as Array<{ label?: string }>).map(
      (entry) => entry.label,
    );
    expect(labels).toEqual(["Copy", "Paste", undefined, "Select All"]);
    expect(send).not.toHaveBeenCalled();
  });
});
