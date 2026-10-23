// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isAboutInfo, isAboutLink } from "../../src/shared/about";
import { createTranslator } from "../../src/shared/i18n";
import type { AboutBridge } from "../../src/shared/terminal-bridge";
import { openAboutDialog } from "../../src/renderer/about/about-dialog";
import {
  APPLICATION_AUTHORS,
  APPLICATION_COPYLEFT,
} from "../../src/main/application-about";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function bridge(): AboutBridge {
  return {
    info: vi.fn(async () => ({
      name: "OMXTerm",
      version: "1.2.3",
      authors: [...APPLICATION_AUTHORS],
      copyleft: APPLICATION_COPYLEFT,
      website: "https://github.com/ruscher/omxterm",
    })),
    openLink: vi.fn(async () => undefined),
    onOpen: () => () => {},
  };
}

describe("About dialog", () => {
  it("validates what crosses the bridge", () => {
    expect(isAboutLink("issues")).toBe(true);
    expect(isAboutLink("https://example.org")).toBe(false);
    expect(
      isAboutInfo({
        name: "OMXTerm",
        version: "1",
        authors: ["a"],
        copyleft: "c",
        website: "w",
      }),
    ).toBe(true);
    expect(isAboutInfo({ name: "OMXTerm", authors: "a" })).toBe(false);
  });

  it("shows the copyleft, the MIT warranty notice and its links", async () => {
    document.body.innerHTML = "";
    const about = bridge();
    const closed = openAboutDialog(
      document,
      createTranslator("pt-BR"),
      about,
      vi.fn(),
    );
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector("dialog");
      if (!element) throw new Error("no dialog");
      return element;
    });
    expect(APPLICATION_COPYLEFT).toBe("Copyleft 🄯 2026");
    expect(dialog.querySelector(".about-copyleft")?.textContent).toBe(
      APPLICATION_COPYLEFT,
    );
    expect(dialog.querySelector(".about-version")?.textContent).toBe(
      "Versão 1.2.3",
    );
    expect(
      [...dialog.querySelectorAll(".about-authors li")].map((item) => [
        item.querySelector(".about-author-name")?.textContent,
        item.querySelector(".about-author-email")?.textContent,
      ]),
    ).toEqual([
      ["Luiz Otávio Miranda", "luizomf@gmail.com"],
      ["Rafael Ruscher", "rruscher@gmail.com"],
    ]);
    expect(dialog.querySelector(".about-warranty")?.textContent).toBe(
      "Este aplicativo vem sem absolutamente nenhuma garantia. Consulte a Licença MIT para mais detalhes.",
    );
    dialog
      .querySelector<HTMLButtonElement>(".about-warranty .about-link")!
      .click();
    expect(about.openLink).toHaveBeenCalledWith("license");
    const [report] = dialog.querySelectorAll<HTMLButtonElement>(
      ".omx-modal-actions button",
    );
    expect(report!.textContent).toBe("Relatar um Problema");
    report!.click();
    await closed;
    expect(about.openLink).toHaveBeenLastCalledWith("issues");
  });
});
