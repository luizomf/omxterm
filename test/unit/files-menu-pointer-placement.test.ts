// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fixture() {
  let language!: (value: SupportedLanguage) => void;
  const request = vi.fn(async (value: unknown) =>
    (value as { operation: string }).operation === "home"
      ? { ok: true, directory: "/root" }
      : { ok: true, directory: "/root", rows: [], total: 0 },
  );
  const page = mountFilesPage(document, {
    request,
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  const actions = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Actions…"]',
  )!;
  actions.click();
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  const item = menu.querySelector<HTMLButtonElement>(
    'button[aria-label="Use last reported path"]',
  )!;
  return { actions, language, menu, item, request };
}

it("keeps the inline hint stable while a different menu item is pressed", async () => {
  const f = await fixture();
  const hint = f.item.querySelector<HTMLElement>(".menu-action-hint")!;
  const checkbox = f.menu.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  f.item.focus();
  expect(hint.hidden).toBe(false);
  checkbox.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  checkbox.focus();
  expect(hint.hidden).toBe(false);
  checkbox.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  checkbox.click();
  expect(f.menu.hidden).toBe(true);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("cancels the pressed menu rather than moving its target on language change", async () => {
  const f = await fixture();
  f.item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  f.item.focus();
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(true);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
  expect(f.actions.getAttribute("aria-label")).toBe("Ações…");
});

it("keeps the gesture guarded through pointerup until the click turn ends", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  f.item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  f.item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(true);
  vi.runAllTimers();
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("cancels the pressed menu rather than moving its target on viewport resize", async () => {
  const f = await fixture();
  f.item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  f.item.focus();
  window.dispatchEvent(new Event("resize"));
  expect(f.menu.hidden).toBe(true);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it.each(["pointercancel", "blur"])(
  "cancels an active gesture on %s without activation",
  async (event) => {
    const f = await fixture();
    f.item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    if (event === "blur") window.dispatchEvent(new Event("blur"));
    else document.body.dispatchEvent(new MouseEvent(event, { bubbles: true }));
    expect(f.menu.hidden).toBe(true);
    expect(f.request).not.toHaveBeenCalledWith({
      operation: "terminal-directory",
    });
  },
);

it("does not let a stale release move or close a reopened menu during a new press", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  f.item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  f.item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  f.item.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(f.menu.hidden).toBe(true);
  f.actions.click();
  const next = f.menu.querySelector<HTMLButtonElement>(
    'button[aria-label="Use last reported path"]',
  )!;
  next.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(true);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});
