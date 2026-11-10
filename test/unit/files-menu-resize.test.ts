// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("keeps the focused menu item inside a vertically resized viewport", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as Record<string, string>;
    if (input.operation === "home") return { ok: true, directory: "/root" };
    if (input.operation === "list")
      return { ok: true, directory: input.path!, rows: [] };
    return { ok: true };
  });
  const page = mountFilesPage(document, {
    request,
  });
  dispose = page.dispose;
  await page.ready;
  const actions = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((item) => item.getAttribute("aria-label") === "Actions…")!;
  const popup = document.querySelector<HTMLElement>('[role="menu"]')!;
  let height = 400;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(196);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockImplementation(
    () => height,
  );
  vi.spyOn(actions, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 50, 34, 34),
  );
  Object.defineProperties(popup, {
    offsetWidth: { configurable: true, value: 181 },
    offsetHeight: {
      configurable: true,
      get: () => Math.min(246, height - 8),
    },
    clientTop: { configurable: true, value: 1 },
    clientHeight: {
      configurable: true,
      get: () => Math.min(246, height - 8) - 2,
    },
  });
  vi.spyOn(popup, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        parseFloat(popup.style.left) || 0,
        parseFloat(popup.style.top) || 0,
        popup.offsetWidth,
        popup.offsetHeight,
      ),
  );
  actions.click();
  const item = popup.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  vi.spyOn(item, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        popup.getBoundingClientRect().left + 5,
        popup.getBoundingClientRect().top + 180 - popup.scrollTop,
        156,
        65,
      ),
  );
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "End", bubbles: true }),
  );
  expect(document.activeElement).toBe(item);
  expect(popup.style.top).toBe("84px");
  const focus = vi.spyOn(item, "focus");
  const reads = request.mock.calls.length;
  height = 174;
  window.dispatchEvent(new Event("resize"));
  expect(popup.style.top).toBe("8px");
  expect(item.getBoundingClientRect().top - 4).toBeGreaterThanOrEqual(9);
  expect(item.getBoundingClientRect().bottom + 4).toBeLessThanOrEqual(173);
  expect(document.activeElement).toBe(item);
  expect(focus).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(reads);
});
