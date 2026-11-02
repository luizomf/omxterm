// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("keeps the pointer target still during a press and reveals the hint after release outside", async () => {
  const request = vi.fn(async (value: unknown) =>
    (value as { operation: string }).operation === "home"
      ? { ok: true, directory: "/root" }
      : { ok: true, directory: "/root", rows: [], total: 0 },
  );
  const page = mountFilesPage(document, { request });
  dispose = page.dispose;
  await page.ready;
  const actions = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Actions…"]',
  )!;
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(196);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
    174,
  );
  vi.spyOn(actions, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 50, 34, 34),
  );
  Object.defineProperties(menu, {
    offsetWidth: { configurable: true, value: 181 },
    offsetHeight: {
      configurable: true,
      get: () =>
        menu.querySelector(".menu-action-hint:not([hidden])") ? 166 : 90,
    },
    clientTop: { configurable: true, value: 1 },
    clientHeight: { configurable: true, get: () => menu.offsetHeight - 2 },
  });
  vi.spyOn(menu, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        Number.parseFloat(menu.style.left) || 0,
        Number.parseFloat(menu.style.top) || 0,
        menu.offsetWidth,
        menu.offsetHeight,
      ),
  );
  actions.click();
  const item = menu.querySelector<HTMLButtonElement>(
    'button[aria-label="Use last reported terminal directory"]',
  )!;
  vi.spyOn(item, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        5,
        menu.getBoundingClientRect().top + 100 - menu.scrollTop,
        156,
        80,
      ),
  );
  expect(menu.style.top).toBe("84px");
  item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  item.focus();
  expect(menu.style.top).toBe("84px");
  document.body.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  await vi.waitFor(() => expect(menu.style.top).toBe("8px"));
  expect(document.activeElement).toBe(item);
  expect(menu.hidden).toBe(false);
  item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  item.click();
  expect(menu.hidden).toBe(true);
  expect(request).toHaveBeenCalledWith({ operation: "terminal-directory" });
  await vi.waitFor(() => expect(menu.hidden).toBe(true));
});
