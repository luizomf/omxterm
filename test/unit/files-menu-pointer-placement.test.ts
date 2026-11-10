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
type Fixture = Awaited<ReturnType<typeof fixture>>;

function pointer(target: EventTarget, type: string, id = 1) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}
function click(target: EventTarget, id = 1) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}
const activated = (f: Fixture) =>
  f.request.mock.calls.some(
    ([value]) =>
      (value as { operation: string }).operation === "terminal-directory",
  );

it.each<[string, boolean, (f: Fixture) => void]>([
  [
    "language change while pressed",
    true,
    (f) => {
      pointer(f.item, "pointerdown");
      f.language("pt-BR");
      pointer(f.item, "pointerup");
      f.item.click();
    },
  ],
  [
    "language change between release and click turn",
    true,
    (f) => {
      pointer(f.item, "pointerdown");
      pointer(f.item, "pointerup");
      f.language("pt-BR");
    },
  ],
  [
    "viewport resize while pressed",
    true,
    (f) => {
      pointer(f.item, "pointerdown");
      window.dispatchEvent(new Event("resize"));
    },
  ],
  [
    "window blur while pressed",
    true,
    (f) => {
      pointer(f.item, "pointerdown");
      window.dispatchEvent(new Event("blur"));
    },
  ],
  [
    "scroll while held",
    false,
    (f) => {
      pointer(f.item, "pointerdown");
      f.menu.scrollTop = 45;
      f.menu.dispatchEvent(new Event("scroll"));
      pointer(f.item, "pointerup");
      click(f.item);
    },
  ],
  [
    "scroll between release and click",
    false,
    (f) => {
      pointer(f.item, "pointerdown");
      pointer(f.item, "pointerup");
      f.menu.scrollTop = 20;
      click(f.item);
    },
  ],
  [
    "delayed click after a scrolled release",
    false,
    (f) => {
      pointer(f.item, "pointerdown");
      f.menu.scrollTop = 45;
      f.menu.dispatchEvent(new Event("scroll"));
      pointer(f.item, "pointerup");
      vi.runAllTimers();
      click(f.item);
    },
  ],
])(
  "does not activate a pressed menu item after %s",
  async (_, closes, gesture) => {
    vi.useFakeTimers();
    const f = await fixture();
    gesture(f);
    const scrolled = f.menu.scrollTop;
    vi.runAllTimers();
    expect(f.menu.hidden).toBe(closes);
    if (!closes) expect(f.menu.scrollTop).toBe(scrolled);
    expect(activated(f)).toBe(false);
  },
);

it("delivers an unchanged click, even after an unrelated pointer cancellation", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 1);
  pointer(document.body, "pointercancel", 2);
  expect(f.menu.hidden).toBe(false);
  pointer(f.item, "pointerup", 1);
  click(f.item, 1);
  expect(activated(f)).toBe(true);
});

it("keeps a scrollable menu open when a touch pan cancels its pointer", async () => {
  const f = await fixture();
  pointer(f.item, "pointerdown", 10);
  pointer(f.item, "pointercancel", 10);
  expect(f.menu.hidden).toBe(false);
  f.language("pt-BR");
  expect(f.menu.hidden).toBe(false);
  expect(activated(f)).toBe(false);
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
  pointer(f.menu, "pointerdown");
  pointer(f.menu, "pointerup");
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  expect(f.menu.scrollTop).toBe(60);
});

it("does not let a stale release close a reopened menu during a new press", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  pointer(f.item, "pointerdown");
  pointer(f.item, "pointerup");
  f.item.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(f.menu.hidden).toBe(true);
  f.actions.click();
  pointer(f.item, "pointerdown");
  vi.runAllTimers();
  expect(f.menu.hidden).toBe(false);
  expect(activated(f)).toBe(false);
});
