// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it("explains a repeated terminal-directory request without reporting an unknown mutation outcome", async () => {
  let release!: (reply: { ok: boolean; directory: string }) => void;
  const pending = new Promise<{ ok: boolean; directory: string }>(
    (resolve) => (release = resolve),
  );
  let terminalRequests = 0;
  let language!: (value: SupportedLanguage) => void;
  const page = mountFilesPage(document, {
    request: async (value) => {
      const operation = (value as { operation: string }).operation;
      if (operation === "home") return { ok: true, directory: "/root" };
      if (operation === "terminal-directory")
        return ++terminalRequests === 1
          ? pending
          : {
              ok: false,
              reason: "terminal-directory-busy",
              error: "English fallback for older archives",
            };
      return { ok: true, directory: "/root", rows: [], total: 0 };
    },
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  const select = () => {
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Actions…"]')!
      .click();
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Use last reported path"]',
      )!
      .click();
  };
  select();
  select();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "A terminal directory request is already in progress. Try again.",
    ),
  );
  expect(document.body.textContent).not.toContain("Outcome unknown");
  language("pt-BR");
  expect(document.body.textContent).toContain(
    "Uma solicitação de diretório do terminal já está em andamento. Tente novamente.",
  );
  release({ ok: true, directory: "/other" });
  await Promise.resolve();
  expect(
    document.querySelector<HTMLInputElement>("form.location input")!.value,
  ).toBe("/root");
});
