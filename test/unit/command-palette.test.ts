// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";
import { createTranslator } from "../../src/shared/i18n";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  terminalDefaultKeybinds,
  type TerminalActionName,
} from "../../src/shared/terminal-keybinds";
import {
  createCommandPalette,
  fuzzyScore,
} from "../../src/renderer/command-palette";
import { registerCommandPaletteActions } from "../../src/main/command-palette-actions";
import type { IpcEvent } from "../../src/main/terminal-ipc-types";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("command palette", () => {
  it("matches characters in order and prefers word starts", () => {
    expect(fuzzyScore("spr", "Split Right")).toBeDefined();
    expect(fuzzyScore("xyz", "Split Right")).toBeUndefined();
    expect(fuzzyScore("sd", "Split Down")!).toBeGreaterThan(
      fuzzyScore("sd", "Show Sidebar")!,
    );
  });

  it("filters, moves with arrows and runs the entry after closing", async () => {
    document.body.innerHTML = "";
    const runs: string[] = [];
    const entry = (label: string) => ({
      label,
      section: "Actions",
      run: () => runs.push(label),
    });
    const palette = createCommandPalette(document, {
      translator: createTranslator("en"),
      entries: async () => [
        entry("Split Right"),
        entry("Split Down"),
        entry("New Tab"),
      ],
    });
    palette.toggle();
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector<HTMLDialogElement>(
        "dialog.command-palette",
      );
      if (!found) throw new Error("no palette");
      return found;
    });
    const input = dialog.querySelector("input")!;
    input.value = "split";
    input.dispatchEvent(new Event("input"));
    expect(
      [...dialog.querySelectorAll("li")].map(
        (item) => item.firstChild!.textContent,
      ),
    ).toEqual(["Split Down", "Split Right"]);
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(runs).toEqual(["Split Right"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("runs only known actions from trusted windows, like shortcuts", () => {
    let listener: ((event: IpcEvent, payload?: unknown) => void) | undefined;
    const ipcMain = {
      on: (channel: string, handler: typeof listener) => {
        if (channel === terminalIpc.runAction) listener = handler;
      },
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const splitRight = vi.fn();
    const invocations = new Proxy(
      {},
      {
        get: (_target, name) => (name === "splitRight" ? splitRight : vi.fn()),
      },
    ) as Record<TerminalActionName, () => void>;
    let trusted = true;
    registerCommandPaletteActions(ipcMain, () => trusted, invocations);
    const frame = {};
    const event = {
      sender: { mainFrame: frame, isDestroyed: () => false, send: vi.fn() },
      senderFrame: frame,
    };
    listener!(event, "splitRight");
    listener!(event, "rm -rf /");
    listener!({ ...event, senderFrame: {} }, "splitRight");
    trusted = false;
    listener!(event, "splitRight");
    expect(splitRight).toHaveBeenCalledOnce();
  });

  it("has a default shortcut on every platform", () => {
    expect(terminalDefaultKeybinds("linux").commandPalette).toBe(
      "Control+Shift+P",
    );
    expect(terminalDefaultKeybinds("darwin").commandPalette).toBe(
      "Command+Shift+P",
    );
    expect(terminalDefaultKeybinds("linux").find).toBe("Control+Shift+G");
    expect(terminalDefaultKeybinds("darwin").find).toBe("Command+F");
  });
});
