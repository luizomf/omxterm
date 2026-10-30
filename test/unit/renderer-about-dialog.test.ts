// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAboutDialog } from "../../src/renderer/about/about-dialog";
import { createRendererLanguage } from "../../src/renderer/renderer-language";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  document.body.replaceChildren();
});

it("coalesces pending opens and ignores metadata and link failures after dismissal/disposal", async () => {
  let resolve!: (info: {
    name: string;
    version: string;
    copyright: string;
  }) => void;
  let rejectLink!: (error: Error) => void;
  const focusTerminal = vi.fn();
  const info = vi.fn(
    () =>
      new Promise<{ name: string; version: string; copyright: string }>((r) => {
        resolve = r;
      }),
  );
  const about = createAboutDialog(document, {
    info,
    openLink: () =>
      new Promise<void>((_, reject) => {
        rejectLink = reject;
      }),
    focusTerminal,
    onActivityChange: vi.fn(),
  });
  about.open();
  about.open();
  expect(info).toHaveBeenCalledOnce();
  expect(document.querySelectorAll("dialog")).toHaveLength(1);
  expect(document.activeElement?.textContent).toBe("Close");
  document.querySelector<HTMLButtonElement>(".about-links button")!.click();
  document
    .querySelector("dialog")!
    .dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(focusTerminal).toHaveBeenCalledOnce();
  resolve({ name: "stale", version: "old", copyright: "old" });
  rejectLink(new Error("private native detail"));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector("dialog")).toBeNull();
  about.open();
  about.dispose();
  about.dispose();
  about.open();
  resolve({ name: "disposed", version: "old", copyright: "old" });
  await Promise.resolve();
  expect(document.querySelector("dialog")).toBeNull();
  expect(focusTerminal).toHaveBeenCalledOnce();
});

it("foregrounds the project and collective contributors without individual copyright, opening only named links", async () => {
  const openLink = vi.fn(async () => {});
  const focusTerminal = vi.fn();
  const about = createAboutDialog(document, {
    info: async () => ({
      name: "OMXTerm",
      version: "7.8.9",
      copyright: "Copyright © 2026 Luiz Otávio Miranda",
    }),
    openLink,
    focusTerminal,
    onActivityChange: vi.fn(),
  });
  about.open();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Version 7.8.9"),
  );
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "./application-icon.png",
  );
  const dialog = document.querySelector("dialog")!;
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(dialog.getAttribute("aria-labelledby")).toBe("about-title");
  expect(document.getElementById("about-title")?.textContent).toBe(
    "About OMXTerm",
  );
  expect(dialog.querySelector(".about-name")?.textContent).toBe("OMXTerm");
  expect(dialog.textContent).not.toContain("Copyright");
  expect(dialog.textContent).not.toContain("Luiz Otávio Miranda");
  expect(
    [...dialog.querySelectorAll(".about-links button")].map(
      (button) => button.textContent,
    ),
  ).toEqual(["Project", "Contributors", "Report an issue", "MIT License"]);
  expect(document.body.textContent).toContain("MIT License");
  expect(document.querySelector("ul")).toBeNull();
  expect(document.body.textContent).not.toContain("Copyleft");
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    )!;
  for (const [label, link] of [
    ["Project", "website"],
    ["Contributors", "contributors"],
    ["Report an issue", "issues"],
    ["MIT License", "license"],
  ]) {
    button(label!).click();
    expect(openLink).toHaveBeenLastCalledWith(link);
    expect(about.isActive()).toBe(true);
  }
  button("Close").click();
  expect(about.isActive()).toBe(false);
  expect(document.querySelector("dialog")).toBeNull();
  expect(focusTerminal).toHaveBeenCalledOnce();
  about.dispose();
});

it("keeps project links and localized loading/error presentation when metadata fails", async () => {
  const language = createRendererLanguage("en-US");
  const openLink = vi.fn(async () => {});
  const about = createAboutDialog(document, {
    info: async () => {
      throw new Error("private native detail");
    },
    openLink,
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
    language,
  });
  about.open();
  expect(document.body.textContent).toContain("Loading version…");
  language.set("pt-BR");
  expect(document.body.textContent).toContain("Carregando versão…");
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "Informações do aplicativo indisponíveis.",
    ),
  );
  language.set("en-US");
  expect(document.body.textContent).toContain(
    "Application information unavailable.",
  );
  expect(document.body.textContent).not.toContain("private native detail");
  expect(document.querySelector(".about-name")?.textContent).toBe("OMXTerm");
  document
    .querySelectorAll<HTMLButtonElement>(".about-links button")[1]!
    .click();
  expect(openLink).toHaveBeenCalledExactlyOnceWith("contributors");
  expect(about.isActive()).toBe(true);
  about.dispose();
});

it("relabels the open dialog when the window language changes, keeping loaded values", async () => {
  const language = createRendererLanguage("pt-BR");
  const about = createAboutDialog(document, {
    info: async () => ({ name: "OMXTerm", version: "1.2.3", copyright: "©" }),
    openLink: async () => {
      throw new Error("private native detail");
    },
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
    language,
  });
  about.open();
  const text = () =>
    [...document.querySelectorAll("dialog h2, dialog p, dialog button")].map(
      (element) => element.textContent,
    );
  expect(text()).toContain("Carregando versão…");
  await vi.waitFor(() => expect(text()).toContain("Versão 1.2.3"));
  document.querySelector<HTMLButtonElement>(".about-links button")!.click();
  await vi.waitFor(() =>
    expect(text()).toContain("Não foi possível abrir o link."),
  );
  expect(text()).toEqual(
    expect.arrayContaining(["Sobre o OMXTerm", "Projeto", "Fechar"]),
  );
  language.set("en-US");
  expect(text()).toEqual(
    expect.arrayContaining([
      "About OMXTerm",
      "Version 1.2.3",
      "Project",
      "Could not open the link.",
      "Close",
    ]),
  );
  about.dispose();
  language.set("pt-BR");
  expect(document.querySelector("dialog")).toBeNull();
});
