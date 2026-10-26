import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MessageBoxOptions,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from "electron";

const electron = vi.hoisted(() => ({
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
}));

import { translatorFor } from "../../src/shared/i18n";
import {
  electronTerminalExportHost,
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
    showMessageBox: vi.fn(async (_options: MessageBoxOptions) => ({
      response: 0,
    })),
    writeFile: vi.fn(async () => undefined),
    documentsPath: () => "/synthetic/Documents",
    now: () => new Date(2026, 9, 24, 9, 5, 7),
    ...overrides,
  };
  return { ...value, saveDialogs };
}

beforeEach(() => vi.clearAllMocks());

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
      filters: [
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
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

  it("uses UTF-8 and owner-only permissions through the Electron host", async () => {
    const window = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false },
    };
    electron.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/synthetic/export.txt",
    });
    await expect(
      saveTerminalExport(
        { kind: "selection", text: "café 👩‍💻\n\n" },
        electronTerminalExportHost(window as never, () => true),
      ),
    ).resolves.toBe("saved");
    expect(electron.showSaveDialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ title: "Export Selection" }),
    );
    expect(electron.writeFile).toHaveBeenCalledExactlyOnceWith(
      "/synthetic/export.txt",
      "café 👩‍💻\n",
      { encoding: "utf8", mode: 0o600 },
    );
  });

  it.each([
    { canceled: true, filePath: "" },
    { canceled: true, filePath: "/synthetic/existing.txt" },
    { canceled: false, filePath: "" },
  ])(
    "writes nothing for cancellation or no destination: %j",
    async (choice) => {
      const fake = host({ showSaveDialog: vi.fn(async () => choice) });
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
    "explains empty %s content without a chooser",
    async (kind, message) => {
      const fake = host();
      await expect(
        saveTerminalExport({ kind, text: " \n\t\n" }, fake),
      ).resolves.toBe("empty");
      expect(fake.showSaveDialog).not.toHaveBeenCalled();
      expect(fake.writeFile).not.toHaveBeenCalled();
      expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: "info", message }),
      );
    },
  );

  it("reports a size rejection with one fixed actionable notice and no chooser/write", async () => {
    const fake = host();
    await expect(
      saveTerminalExport({ notice: "too-large" }, fake),
    ).resolves.toBe("too-large");
    expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: "warning",
      title: "Export Too Large",
      message: "The requested text exceeds the 16 MiB UTF-8 export limit.",
      detail:
        "Select a smaller portion of the terminal text and export the selection. Nothing was saved or truncated.",
      buttons: ["OK"],
      noLink: true,
    });
    expect(fake.showSaveDialog).not.toHaveBeenCalled();
    expect(fake.writeFile).not.toHaveBeenCalled();
  });
});

describe("export error containment", () => {
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

  it.each(["documentsPath", "now", "showSaveDialog"] as const)(
    "contains synchronous %s failures without exposing raw errors",
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
      expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "Export Failed",
        message: "OMXTerm could not save the exported text.",
        detail:
          "Try exporting again and choose a writable destination with enough free space.",
        buttons: ["OK"],
        noLink: true,
      });
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

  it.each(["throw", "reject"] as const)(
    "contains a write %s with one fixed actionable error",
    async (failure) => {
      const fake = host({
        writeFile: vi.fn(() => {
          const error = new Error("EACCES /synthetic/private terminal-payload");
          if (failure === "throw") throw error;
          return Promise.reject(error);
        }),
      });
      await expect(
        saveTerminalExport({ kind: "content", text: "text" }, fake),
      ).resolves.toBe("failed");
      expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "Export Failed",
        message: "OMXTerm could not save the exported text.",
        detail:
          "Try exporting again and choose a writable destination with enough free space.",
        buttons: ["OK"],
        noLink: true,
      });
    },
  );
});

describe("export owner lifetime", () => {
  it.each([
    { notice: "too-large" },
    { kind: "content", text: " " },
    { kind: "content", text: "text" },
  ] as const)("does nothing for an already lost owner: %j", async (request) => {
    const fake = host({
      isAlive: () => false,
      documentsPath: vi.fn(),
      now: vi.fn(),
    });
    await expect(saveTerminalExport(request, fake)).resolves.toBe("cancelled");
    expect(fake.showMessageBox).not.toHaveBeenCalled();
    expect(fake.showSaveDialog).not.toHaveBeenCalled();
    expect(fake.writeFile).not.toHaveBeenCalled();
    expect(fake.documentsPath).not.toHaveBeenCalled();
    expect(fake.now).not.toHaveBeenCalled();
  });

  it.each(["controller", "window", "renderer"] as const)(
    "honors initial %s loss through the actual Electron host",
    async (owner) => {
      const window = {
        isDestroyed: () => owner === "window",
        webContents: { isDestroyed: () => owner === "renderer" },
      };
      const adapter = electronTerminalExportHost(
        window as never,
        () => owner !== "controller",
      );
      for (const request of [
        { kind: "content", text: "synthetic" },
        { kind: "selection", text: " " },
        { notice: "too-large" },
      ] as const)
        await expect(saveTerminalExport(request, adapter)).resolves.toBe(
          "cancelled",
        );
      expect(electron.writeFile).not.toHaveBeenCalled();
      expect(electron.showMessageBox).not.toHaveBeenCalled();
      expect(electron.showSaveDialog).not.toHaveBeenCalled();
    },
  );

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
            new Promise<SaveDialogReturnValue>((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        ),
      });
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
      let started!: () => void;
      const writeStarted = new Promise<void>((yes) => {
        started = yes;
      });
      const fake = host({
        isAlive: () => alive,
        writeFile: vi.fn(
          () =>
            new Promise<void>((yes, no) => {
              resolve = yes;
              reject = no;
              started();
            }),
        ),
      });
      const saving = saveTerminalExport(
        { kind: "content", text: "text" },
        fake,
      );
      await writeStarted;
      expect(fake.writeFile).toHaveBeenCalledTimes(1);
      alive = false;
      if (success) resolve();
      else reject(new Error("private write failure"));
      await expect(saving).resolves.toBe(success ? "saved" : "failed");
      expect(fake.showMessageBox).not.toHaveBeenCalled();
    },
  );
});

describe("translated export text", () => {
  it("uses Portuguese titles, filters and empty messages", async () => {
    const { t } = translatorFor("pt-BR");
    const fake = host();
    await saveTerminalExport({ kind: "content", text: "texto" }, fake, t);
    expect(fake.saveDialogs[0]).toMatchObject({
      title: "Exportar Conteúdo do Terminal",
      filters: [
        { name: "Texto", extensions: ["txt"] },
        { name: "Todos os Arquivos", extensions: ["*"] },
      ],
    });
    for (const [kind, title, message] of [
      [
        "selection",
        "Exportar Seleção",
        "A seleção não tem texto para exportar.",
      ],
      [
        "content",
        "Exportar Conteúdo do Terminal",
        "O terminal não tem texto para exportar.",
      ],
    ] as const) {
      await saveTerminalExport({ kind, text: " " }, fake, t);
      expect(fake.showMessageBox).toHaveBeenLastCalledWith({
        type: "info",
        title,
        message,
        buttons: ["OK"],
        noLink: true,
      });
    }
  });

  it("uses a generic Portuguese size notice with a smaller-selection remedy", async () => {
    const fake = host();
    await saveTerminalExport(
      { notice: "too-large" },
      fake,
      translatorFor("pt-BR").t,
    );
    expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: "warning",
      title: "Exportação Muito Grande",
      message:
        "O texto solicitado excede o limite de exportação de 16 MiB em UTF-8.",
      detail:
        "Selecione uma parte menor do texto do terminal e exporte a seleção. Nada foi salvo ou truncado.",
      buttons: ["OK"],
      noLink: true,
    });
    expect(fake.showSaveDialog).not.toHaveBeenCalled();
    expect(fake.writeFile).not.toHaveBeenCalled();
  });

  it.each(["documentsPath", "showSaveDialog", "writeFile"] as const)(
    "uses the same private-detail-free Portuguese remedy for %s failures",
    async (operation) => {
      const fake = host({
        [operation]: vi.fn(() => {
          throw new Error("RAW /synthetic/private");
        }),
      });
      await expect(
        saveTerminalExport(
          { kind: "selection", text: "texto" },
          fake,
          translatorFor("pt-BR").t,
        ),
      ).resolves.toBe("failed");
      expect(fake.showMessageBox).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "Falha na Exportação",
        message: "O OMXTerm não conseguiu salvar o texto exportado.",
        detail:
          "Tente exportar de novo e escolha um destino com permissão de escrita e espaço livre suficiente.",
        buttons: ["OK"],
        noLink: true,
      });
    },
  );
});
