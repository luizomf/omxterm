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

function pointer(target: EventTarget, type: string, id: number) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}

it("keeps a scrollable menu open when a touch pan cancels its pointer", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 10);
  pointer(f.item, "pointercancel", 10);
  expect(f.menu.hidden).toBe(false);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(false);
  expect(f.actions.getAttribute("aria-label")).toBe("Ações…");
});

it("preserves scrolling and cancels activation if a held target moves", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  f.menu.scrollTop = 45;
  f.menu.dispatchEvent(new Event("scroll"));
  pointer(f.item, "pointerup", 1);
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  Object.defineProperty(click, "pointerId", { value: 1 });
  const checkbox = f.menu.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  checkbox.dispatchEvent(click);
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  expect(f.menu.scrollTop).toBe(45);
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("also guards a scroll between pointerup and the browser click", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  pointer(f.item, "pointerup", 1);
  f.menu.scrollTop = 20;
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  Object.defineProperty(click, "pointerId", { value: 1 });
  f.item.dispatchEvent(click);
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  expect(f.menu.scrollTop).toBe(20);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("refuses a delayed click after a scrolled gesture's release timer", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  f.menu.scrollTop = 45;
  f.menu.dispatchEvent(new Event("scroll"));
  pointer(f.item, "pointerup", 1);
  vi.runAllTimers();
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  Object.defineProperty(click, "pointerId", { value: 1 });
  f.item.dispatchEvent(click);
  expect(f.menu.hidden).toBe(false);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("does not activate a retained item after its pressed menu was dismissed", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 10);
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(true);
  pointer(f.item, "pointerup", 10);
  f.item.click();
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
  f.actions.click();
  f.item.click();
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

it("does not snap back after a stationary scrollbar press", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  Object.defineProperty(f.menu, "clientHeight", { value: 80 });
  vi.spyOn(f.menu, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 180, 80),
  );
  vi.spyOn(document.activeElement!, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, -40, 160, 30),
  );
  f.menu.scrollTop = 60;
  pointer(f.menu, "pointerdown", 1);
  pointer(f.menu, "pointerup", 1);
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  expect(f.menu.scrollTop).toBe(60);
});

it("delivers an unchanged pointer click normally", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  pointer(f.item, "pointerup", 1);
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  Object.defineProperty(click, "pointerId", { value: 1 });
  f.item.dispatchEvent(click);
  expect(f.request).toHaveBeenCalledWith({ operation: "terminal-directory" });
});

it("ignores an unrelated pointer cancellation and delivers the held click", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  pointer(document.body, "pointercancel", 2);
  expect(f.menu.hidden).toBe(false);
  pointer(f.item, "pointerup", 1);
  f.item.click();
  expect(f.request).toHaveBeenCalledWith({ operation: "terminal-directory" });
});

it("cancels an active gesture on window blur without activation", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 10);
  window.dispatchEvent(new Event("blur"));
  expect(f.menu.hidden).toBe(true);
  expect(f.request).not.toHaveBeenCalledWith({
    operation: "terminal-directory",
  });
});

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
