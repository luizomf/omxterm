// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSnippetsSidebar } from "../../src/renderer/snippets-sidebar";
import type { TerminalSnippetsResponse } from "../../src/shared/terminal-snippets";

function createRoot(): HTMLElement {
  const root = document.createElement("aside");
  root.hidden = true;
  document.body.appendChild(root);
  return root;
}

const twoSnippets: TerminalSnippetsResponse = {
  snippets: [
    {
      name: "greet",
      body: "printf hello",
      description: "say hi",
      execute: false,
    },
    { name: "update brew", body: "brew update", execute: true },
  ],
};

describe("Snippets Sidebar", () => {
  it("opens on toggle, lists snippets, focuses search, and closes on the next toggle", async () => {
    const root = createRoot();
    const focusTerminal = vi.fn();
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => twoSnippets),
      inject: vi.fn(),
      focusTerminal,
    });

    await sidebar.toggle();
    expect(sidebar.isOpen()).toBe(true);
    expect(root.hidden).toBe(false);
    expect(root.querySelectorAll("li").length).toBe(2);
    expect(root.textContent).toContain("greet");
    expect(root.textContent).toContain("say hi");
    expect(document.activeElement).toBe(root.querySelector("input"));

    await sidebar.toggle();
    expect(sidebar.isOpen()).toBe(false);
    expect(focusTerminal).toHaveBeenCalledOnce();
  });

  it("rereads the file on every open so edits appear without restart", async () => {
    const root = createRoot();
    const loadSnippets = vi
      .fn<() => Promise<TerminalSnippetsResponse>>()
      .mockResolvedValueOnce({ snippets: [] })
      .mockResolvedValueOnce(twoSnippets);
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets,
      inject: vi.fn(),
      focusTerminal: vi.fn(),
    });

    await sidebar.toggle();
    expect(root.querySelectorAll("li").length).toBe(0);
    expect(root.textContent).toContain("No snippets");
    await sidebar.toggle();
    await sidebar.toggle();
    expect(loadSnippets).toHaveBeenCalledTimes(2);
    expect(root.querySelectorAll("li").length).toBe(2);
  });

  it("filters by name and description as the user types", async () => {
    const root = createRoot();
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => twoSnippets),
      inject: vi.fn(),
      focusTerminal: vi.fn(),
    });
    await sidebar.toggle();
    const search = root.querySelector("input")!;

    search.value = "brew";
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("li").length).toBe(1);
    expect(root.textContent).toContain("update brew");

    search.value = "say hi";
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("li").length).toBe(1);
    expect(root.textContent).toContain("greet");

    search.value = "nothing matches this";
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("li").length).toBe(0);
    expect(root.textContent).toContain("No snippets match the search.");
  });

  it("injects the clicked snippet and returns focus to the terminal", async () => {
    const root = createRoot();
    const inject = vi.fn();
    const focusTerminal = vi.fn();
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => twoSnippets),
      inject,
      focusTerminal,
    });
    await sidebar.toggle();

    root.querySelectorAll<HTMLButtonElement>("li button")[1]!.click();

    expect(inject).toHaveBeenCalledExactlyOnceWith(twoSnippets.snippets[1]);
    expect(focusTerminal).toHaveBeenCalledOnce();
    expect(sidebar.isOpen()).toBe(true);
  });

  it("shows the exact error in place of the list for an invalid file, as text only", async () => {
    const root = createRoot();
    const error =
      'Snippets "/isolated/omxterm/snippets.json" at "snippets[0].body": <img src=x> must be a non-empty string. Fix the file and reopen the Snippets Sidebar.';
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => ({ snippets: [], error })),
      inject: vi.fn(),
      focusTerminal: vi.fn(),
    });

    await sidebar.toggle();

    expect(sidebar.isOpen()).toBe(true);
    expect(root.querySelectorAll("li").length).toBe(0);
    expect(root.textContent).toContain("snippets[0].body");
    expect(root.querySelector("img")).toBeNull();
    const errorElement = root.querySelector<HTMLElement>(".snippets-error")!;
    expect(errorElement.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".snippets-empty")!.hidden).toBe(
      true,
    );
  });

  it("clears its content and listeners on dispose", async () => {
    const root = createRoot();
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => twoSnippets),
      inject: vi.fn(),
      focusTerminal: vi.fn(),
    });
    await sidebar.toggle();
    sidebar.dispose();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
    await sidebar.toggle();
    expect(root.hidden).toBe(true);
  });

  it("closes from the header button and returns focus to the terminal", async () => {
    const root = createRoot();
    const focusTerminal = vi.fn();
    const sidebar = createSnippetsSidebar(root, {
      loadSnippets: vi.fn(async () => twoSnippets),
      inject: vi.fn(),
      focusTerminal,
      labels: {
        title: "Snippets",
        close: "Fechar Barra Lateral",
        search: "Buscar snippets",
        empty: "Nenhum",
        noMatch: "Nada",
      },
    });
    await sidebar.toggle();
    const close = root.querySelector<HTMLButtonElement>(
      '.snippets-header [aria-label="Fechar Barra Lateral"]',
    )!;
    expect(root.querySelector("h2")?.textContent).toBe("Snippets");
    close.click();
    expect(sidebar.isOpen()).toBe(false);
    expect(focusTerminal).toHaveBeenCalledOnce();
  });
});
