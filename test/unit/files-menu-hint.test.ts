// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

it("keeps active/local and unverified, stale/remote context visible and accessible across language changes", async () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("extensions/files/files.css", "utf8");
  document.head.append(style);
  let language!: (value: SupportedLanguage) => void;
  const page = mountFilesPage(document, {
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
    request: async (value) =>
      (value as { operation: string }).operation === "home"
        ? { ok: true, directory: "/root" }
        : { ok: true, directory: "/root", rows: [], total: 0 },
  });
  dispose = page.dispose;
  await page.ready;
  const actions = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Actions…"]',
  )!;
  actions.click();
  const item = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Use last reported path"]',
  )!;
  const hint = item.querySelector<HTMLElement>(".menu-action-hint")!;
  expect(getComputedStyle(hint).display).toBe("block");
  const focused = document.activeElement as HTMLElement;
  focused.dispatchEvent(
    new KeyboardEvent("keydown", { key: "End", bubbles: true }),
  );
  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
  );
  expect(document.activeElement).toBe(item);
  expect(getComputedStyle(hint).display).toBe("block");
  expect(hint.textContent).toBe(
    "Active terminal; local folder. Unverified; may be stale or remote.",
  );
  expect(item.getAttribute("aria-describedby")).toBe(hint.id);
  language("pt-BR");
  expect(item.getAttribute("aria-label")).toBe("Usar último caminho informado");
  expect(hint.textContent).toBe(
    "Terminal ativo; pasta local. Não verificado; pode ser antigo ou remoto.",
  );
  expect(item.getAttribute("aria-describedby")).toBe(hint.id);
  expect(getComputedStyle(hint).display).toBe("block");
  item.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  expect(getComputedStyle(hint).display).toBe("block");
});
