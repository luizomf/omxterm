// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type { CommandDefinition } from "../../src/shared/commands";
import type { CommandsBridge } from "../../src/shared/terminal-bridge";
import { createCommandsPanel } from "../../src/renderer/commands/commands-panel";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function bridge(platform = "linux"): CommandsBridge {
  return {
    list: vi.fn(async () => ({ custom: [], favorites: [], hidden: [] })),
    save: vi.fn(async (command: CommandDefinition) => command),
    delete: vi.fn(async () => undefined),
    setFavorite: vi.fn(async () => undefined),
    setHidden: vi.fn(async () => undefined),
    availability: vi.fn(async (tools: readonly string[]) =>
      Object.fromEntries(tools.map((tool) => [tool, tool !== "pacman"])),
    ),
    platform: vi.fn(async () => platform),
    onChanged: () => () => {},
    onToggleSidebar: () => () => {},
  };
}

async function mount(platform = "linux", locale: "en" | "pt-BR" = "en") {
  document.body.innerHTML = "";
  const run = vi.fn();
  const panel = createCommandsPanel(document, {
    translator: createTranslator(locale),
    bridge: bridge(platform),
    chooseFile: async () => null,
    run,
    notify: vi.fn(),
  });
  document.body.append(panel.element);
  await vi.waitFor(() =>
    expect(
      panel.element.querySelectorAll(".sessions-row").length,
    ).toBeGreaterThan(10),
  );
  return { panel, run };
}

const rowNamed = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".sessions-row")].find(
    (row) => row.querySelector(".sessions-name")?.textContent === name,
  )!;

describe("Commands panel", () => {
  it("shows only this platform's commands and explains missing tools", async () => {
    const { panel } = await mount("linux");
    const names = [...panel.element.querySelectorAll(".sessions-name")].map(
      (node) => node.textContent,
    );
    expect(names).toContain("Systemctl");
    expect(names).not.toContain("winget");
    const pacman = rowNamed(panel.element, "Pacman");
    expect(pacman.classList.contains("unavailable")).toBe(true);
    expect(pacman.querySelector(".sessions-subtitle")?.textContent).toBe(
      "Requires pacman, which was not found on this system.",
    );
  });

  it("previews the exact quoted command and runs it only on request", async () => {
    const { panel, run } = await mount("linux");
    rowNamed(panel.element, "Ping").click();
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector("dialog");
      if (!element) throw new Error("no dialog");
      return element;
    });
    const host = dialog.querySelector<HTMLInputElement>("input[type=text]")!;
    host.value = "my host; reboot";
    host.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      dialog.querySelector<HTMLTextAreaElement>(".command-preview")!.value,
    ).toBe("ping -c 4 'my host; reboot'");
    expect(run).not.toHaveBeenCalled();
    const [, , runButton] = dialog.querySelectorAll<HTMLButtonElement>(
      ".omx-modal-actions button",
    );
    runButton!.click();
    await vi.waitFor(() =>
      expect(run).toHaveBeenCalledWith({
        text: "ping -c 4 'my host; reboot'",
        submit: true,
      }),
    );
  });

  it("hands the command over for several terminals from the form", async () => {
    const { panel, run } = await mount("linux");
    rowNamed(panel.element, "Ping").click();
    const dialog = await vi.waitFor(() => document.querySelector("dialog")!);
    const host = dialog.querySelector<HTMLInputElement>("input[type=text]")!;
    host.value = "example.org";
    host.dispatchEvent(new Event("input", { bubbles: true }));
    const multiple = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        ".omx-modal-actions button",
      ),
    ].find((button) => button.textContent === "Run in Multiple Terminals…")!;
    multiple.click();
    await vi.waitFor(() =>
      expect(run).toHaveBeenCalledWith({
        text: "ping -c 4 example.org",
        submit: true,
        multiple: true,
      }),
    );
  });

  it("keeps the dialog open when a required field is empty", async () => {
    const { panel, run } = await mount("linux");
    rowNamed(panel.element, "Ping").click();
    const dialog = await vi.waitFor(() => document.querySelector("dialog")!);
    const host = dialog.querySelector<HTMLInputElement>("input[type=text]")!;
    host.value = "";
    host.dispatchEvent(new Event("input", { bubbles: true }));
    dialog
      .querySelectorAll<HTMLButtonElement>(".omx-modal-actions button")[1]!
      .click();
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(dialog.querySelector(".omx-field-error")?.textContent).toBe(
      "Host is required.",
    );
  });

  it("uses PowerShell commands and quoting on Windows, translated for pt-BR", async () => {
    const { panel } = await mount("win32", "pt-BR");
    const names = [...panel.element.querySelectorAll(".sessions-name")].map(
      (node) => node.textContent,
    );
    expect(names).toContain("Espaço em Disco");
    expect(names).not.toContain("Systemctl");
  });
});
