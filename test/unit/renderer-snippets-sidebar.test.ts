// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnippetsView } from "../../src/renderer/snippets-sidebar";
import {
  createRendererLanguage,
  type RendererLanguage,
} from "../../src/renderer/renderer-language";
import type { TerminalSnippetsResponse } from "../../src/shared/terminal-snippets";

const catalog: TerminalSnippetsResponse = {
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
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});
function fixture(
  load = vi.fn(async () => catalog),
  language?: RendererLanguage,
) {
  let interactive = true;
  const inject = vi.fn();
  const preview = vi.fn();
  const view = createSnippetsView(document, {
    loadSnippets: load,
    inject,
    preview,
    isInteractive: () => interactive,
    ...(language ? { language } : {}),
  });
  document.body.append(view.element);
  cleanups.push(view.dispose);
  const search = view.element.querySelector("input")!;
  const results = view.element.querySelector<HTMLElement>(".snippets-results")!;
  const input = (value: string) => {
    search.value = value;
    search.dispatchEvent(new Event("input"));
  };
  return {
    view,
    root: view.element,
    search,
    results,
    input,
    inject,
    preview,
    load,
    block: () => {
      interactive = false;
    },
    unblock: () => {
      interactive = true;
    },
  };
}
async function settle() {
  for (let n = 0; n < 6; n++) await Promise.resolve();
}

describe("Snippets auxiliary view", () => {
  it.each(["reject", "throw"])(
    "relabels a visible generic %s failure without reloading or replacing the view",
    async (outcome) => {
      const language = createRendererLanguage();
      const load = vi.fn<() => Promise<TerminalSnippetsResponse>>(() => {
        if (outcome === "throw") throw new Error("private details");
        return Promise.reject(new Error("private details"));
      });
      const f = fixture(load, language);
      f.view.activate();
      f.input("retained query");
      f.view.focus();
      await settle();
      const error = f.root.querySelector<HTMLElement>(".snippets-error")!;
      expect(error.hidden).toBe(false);
      expect(error.textContent).toBe(
        "Could not load snippets. Close and reopen Snippets to retry.",
      );
      language.set("pt-BR");
      expect(error.textContent).toBe(
        "Não foi possível carregar os snippets. Feche e abra Snippets de novo para tentar outra vez.",
      );
      expect(f.search.placeholder).toBe("Buscar snippets");
      language.set("en-US");
      expect(error.textContent).toBe(
        "Could not load snippets. Close and reopen Snippets to retry.",
      );
      expect(f.root.querySelector("input")).toBe(f.search);
      expect(f.search.value).toBe("retained query");
      expect(document.activeElement).toBe(f.search);
      expect(load).toHaveBeenCalledOnce();
      expect(f.root.textContent).not.toContain("private details");
      f.view.dispose();
      language.set("pt-BR");
      expect(error.textContent).toBe(
        "Could not load snippets. Close and reopen Snippets to retry.",
      );
    },
  );
  it("keeps file diagnostics literal after replacing a transport failure, then clears them on fresh data", async () => {
    const language = createRendererLanguage();
    // Even a diagnostic matching a catalog string is not an application notice.
    const diagnostic =
      "Could not load snippets. Close and reopen Snippets to retry.";
    const load = vi
      .fn<() => Promise<TerminalSnippetsResponse>>()
      .mockRejectedValueOnce(new Error("private details"))
      .mockResolvedValueOnce({ snippets: [], error: diagnostic })
      .mockResolvedValueOnce(catalog);
    const f = fixture(load, language);
    f.view.activate();
    await settle();
    language.set("pt-BR");
    f.view.deactivate();
    f.view.activate();
    await settle();
    const error = f.root.querySelector<HTMLElement>(".snippets-error")!;
    expect(error.textContent).toBe(diagnostic);
    language.set("en-US");
    language.set("pt-BR");
    expect(error.textContent).toBe(diagnostic);
    expect(error.hidden).toBe(false);
    f.view.deactivate();
    f.view.activate();
    await settle();
    language.set("en-US");
    expect(error.hidden).toBe(true);
    expect(error.textContent).toBe("");
    expect(f.root.querySelectorAll("li")).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("reveals loading/search synchronously, rereads on activation, and never refocuses on completion", async () => {
    const f = fixture();
    f.view.activate();
    f.view.focus();
    expect(f.root.textContent).toContain("Loading snippets");
    expect(document.activeElement).toBe(f.search);
    f.search.blur();
    await settle();
    expect(f.root.querySelectorAll("li")).toHaveLength(2);
    expect(document.activeElement).not.toBe(f.search);
    f.view.deactivate();
    f.view.activate();
    await settle();
    expect(f.load).toHaveBeenCalledTimes(2);
  });

  it("filters name/description, retaining query and clamped scroll across activations", async () => {
    const f = fixture();
    f.view.activate();
    await settle();
    f.input("brew");
    expect(f.root.querySelectorAll("li")).toHaveLength(1);
    expect(f.root.textContent).toContain("update brew");
    f.input("say hi");
    expect(f.root.querySelectorAll("li")).toHaveLength(1);
    expect(f.root.textContent).toContain("greet");
    Object.defineProperties(f.results, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 100 },
    });
    f.results.scrollTop = 300;
    f.view.deactivate();
    f.view.activate();
    await settle();
    expect(f.search.value).toBe("say hi");
    expect(f.results.scrollTop).toBe(300);
    f.view.deactivate();
    Object.defineProperty(f.results, "scrollHeight", { value: 140 });
    f.view.activate();
    await settle();
    expect(f.results.scrollTop).toBe(40);
    f.input("absent");
    expect(f.root.textContent).toContain("No snippets match");
  });

  it("delivers the exact current row and invalidates detached/hidden/loading/blocked callbacks", async () => {
    const f = fixture();
    f.view.activate();
    await settle();
    const old = f.root.querySelectorAll(
      "li .snippet-activate",
    )[1] as HTMLButtonElement;
    old.click();
    expect(f.inject).toHaveBeenCalledExactlyOnceWith(catalog.snippets[1]);
    f.inject.mockClear();
    f.input("brew");
    old.click();
    const filtered = f.root.querySelector<HTMLButtonElement>(
      "li .snippet-activate",
    )!;
    f.view.deactivate();
    filtered.click();
    f.view.activate();
    filtered.click();
    await settle();
    f.block();
    f.root.querySelector<HTMLButtonElement>("li .snippet-activate")!.click();
    expect(f.inject).not.toHaveBeenCalled();
  });

  it("shows each row's default intent and opens a preview without delivering", async () => {
    const f = fixture();
    f.view.activate();
    await settle();
    expect(
      [...f.root.querySelectorAll(".snippet-intent")].map((e) => e.textContent),
    ).toEqual(["Insert", "Run · adds Enter"]);
    const previews = f.root.querySelectorAll<HTMLButtonElement>(
      "li .snippet-preview-open",
    );
    expect(previews[1]!.getAttribute("aria-label")).toBe("Preview update brew");
    previews[1]!.click();
    expect(f.inject).not.toHaveBeenCalled();
    expect(f.preview).toHaveBeenCalledExactlyOnceWith(
      catalog.snippets[1],
      expect.any(Function),
    );
    f.block();
    previews[0]!.click();
    expect(f.preview).toHaveBeenCalledOnce();
  });

  it("returns focus to the preview control, then search, never to a hidden view", async () => {
    const f = fixture();
    f.view.activate();
    await settle();
    f.root
      .querySelector<HTMLButtonElement>("li .snippet-preview-open")!
      .click();
    const [, returnFocus] = f.preview.mock.calls[0] as [unknown, () => boolean];
    expect(returnFocus()).toBe(true);
    expect(document.activeElement).toHaveProperty(
      "className",
      "snippet-preview-open",
    );
    f.input("brew");
    expect(returnFocus()).toBe(true);
    expect(document.activeElement).toBe(f.search);
    f.block();
    expect(returnFocus()).toBe(false);
    f.unblock();
    f.view.deactivate();
    (document.activeElement as HTMLElement).blur();
    expect(returnFocus()).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it.each(["resolve", "reject"])(
    "ignores stale %s after close/reopen and disposal",
    async (outcome) => {
      let resolve!: (response: TerminalSnippetsResponse) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<TerminalSnippetsResponse>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const load = vi
        .fn<() => Promise<TerminalSnippetsResponse>>()
        .mockReturnValueOnce(pending)
        .mockResolvedValue({ snippets: [] });
      const f = fixture(load);
      f.view.activate();
      await settle();
      f.view.deactivate();
      f.view.activate();
      await settle();
      if (outcome === "resolve") resolve(catalog);
      else reject(new Error("private details"));
      await settle();
      expect(f.root.querySelectorAll("li")).toHaveLength(0);
      expect(f.root.textContent).toContain("No snippets. Create snippets.yaml");
      f.view.dispose();
      f.view.dispose();
      expect(f.root.childElementCount).toBe(0);
    },
  );

  it("replaces old rows with fresh empty/errors, rendering diagnostics safely", async () => {
    const load = vi
      .fn<() => Promise<TerminalSnippetsResponse>>()
      .mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce({
        snippets: [],
        error: "<img src=x> invalid YAML",
      })
      .mockRejectedValueOnce(new Error("private details"));
    const f = fixture(load);
    f.view.activate();
    await settle();
    f.view.deactivate();
    f.view.activate();
    await settle();
    expect(f.root.querySelectorAll("li")).toHaveLength(0);
    expect(f.root.querySelector("img")).toBeNull();
    expect(f.root.querySelector<HTMLElement>(".snippets-error")!.hidden).toBe(
      false,
    );
    expect(f.root.querySelector<HTMLElement>(".snippets-empty")!.hidden).toBe(
      true,
    );
    f.view.deactivate();
    f.view.activate();
    await settle();
    expect(f.root.textContent).toContain("Could not load snippets");
    expect(f.root.textContent).not.toContain("private details");
  });

  it("settles a visible blocked read without focusing; disposal invalidates pending work", async () => {
    let resolve!: (response: TerminalSnippetsResponse) => void;
    const f = fixture(
      vi.fn(
        () =>
          new Promise<TerminalSnippetsResponse>((yes) => {
            resolve = yes;
          }),
      ),
    );
    f.view.activate();
    await settle();
    f.block();
    resolve(catalog);
    await settle();
    expect(f.root.querySelectorAll("li")).toHaveLength(2);
    expect(document.activeElement).not.toBe(f.search);
    f.view.deactivate();
    f.view.activate();
    await settle();
    f.view.dispose();
    resolve(catalog);
    await settle();
    expect(f.root.childElementCount).toBe(0);
  });
});
