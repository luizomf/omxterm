// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

async function setup() {
  let finish!: (value: { ok: boolean; reason?: string }) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<{ ok: boolean; reason?: string }>(
    (resolve, fail) => {
      finish = resolve;
      reject = fail;
    },
  );
  const request = vi.fn((value: unknown) => {
    const request = value as { operation: string; path?: string };
    if (request.operation === "home")
      return Promise.resolve({ ok: true, directory: "/root" });
    if (request.operation === "list")
      return Promise.resolve({
        ok: true,
        directory: "/root",
        rows: [
          { name: "a 'quote'\nname", kind: "file", size: 0 },
          { name: "folder", kind: "directory", size: 0 },
        ],
        total: 2,
      });
    return pending;
  });
  let visibility!: (visible: boolean) => void;
  let language!: (language: SupportedLanguage) => void;
  const page = mountFilesPage(document, {
    request,
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
    onLanguage(listener) {
      language = listener;
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  const row = (name: string) =>
    [...document.querySelectorAll<HTMLElement>(".file-row")].find((element) =>
      element.dataset.path?.endsWith(name),
    )!;
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) =>
        !element.closest("[hidden]") &&
        (element.getAttribute("aria-label") === label ||
          element.textContent?.includes(label)),
    )!;
  return { request, finish, reject, visibility, language, row, button };
}
function key(element: HTMLElement, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
  return event;
}
function pathCalls(request: ReturnType<typeof vi.fn>) {
  return request.mock.calls.filter(
    ([value]) =>
      (value as { operation: string }).operation === "terminal.insertPath.v1",
  );
}

it("offers a visible, accessible menu action only for a selected row", async () => {
  const f = await setup();
  f.button("Actions…").click();
  const disabled = f.button("Insert path into terminal");
  expect(disabled.disabled).toBe(true);
  expect(disabled.getAttribute("aria-keyshortcuts")).toBe("Shift+Enter");
  expect(disabled.textContent).toContain("Shift+Enter");
  f.button("Actions…").click();
  f.row("folder").click();
  f.button("Actions…").click();
  f.button("Insert path into terminal").click();
  expect(pathCalls(f.request)).toEqual([
    [{ operation: "terminal.insertPath.v1", path: "/root/folder" }],
  ]);
  f.finish({ ok: true });
});

it.each(["ContextMenu", "F10"])(
  "selects an initially focused row before its %s context action",
  async (menuKey) => {
    const f = await setup();
    const target = f.row("folder");
    target.focus();
    key(target, { key: menuKey, shiftKey: menuKey === "F10" });
    const action = f.button("Insert path into terminal");
    expect(action.disabled).toBe(false);
    expect(action.getAttribute("aria-label")).toBe("Insert path into terminal");
    action.click();
    expect(pathCalls(f.request)).toEqual([
      [{ operation: "terminal.insertPath.v1", path: "/root/folder" }],
    ]);
    f.finish({ ok: true });
  },
);

it("sends exactly one captured focused path immediately, without Enter or repeats", async () => {
  const f = await setup();
  const first = f.row("name");
  first.focus();
  const event = key(first);
  key(first, { repeat: true });
  f.row("folder").click();
  expect(event.defaultPrevented).toBe(true);
  expect(pathCalls(f.request)).toEqual([
    [
      {
        operation: "terminal.insertPath.v1",
        path: "/root/a 'quote'\nname",
      },
    ],
  ]);
  f.finish({ ok: true });
  await Promise.resolve();
  expect(pathCalls(f.request)).toHaveLength(1);
});

it("leaves editing, composing and other modifiers alone and refuses hidden actions", async () => {
  const f = await setup();
  const row = f.row("folder");
  key(row, { ctrlKey: true });
  key(row, { isComposing: true });
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  key(address);
  f.visibility(false);
  key(row);
  expect(pathCalls(f.request)).toHaveLength(0);
});

it.each([
  ["terminal-busy", "already in progress"],
  ["terminal-unavailable", "unavailable or closed"],
  ["terminal-not-completed", "did not complete"],
  ["invalid-path", "invalid or too long"],
  ["unsafe-path", "paste delimiter"],
  ["other", "outcome is unknown"],
] as const)(
  "explains %s and relabels the retained notice",
  async (reason, text) => {
    const f = await setup();
    key(f.row("folder"));
    f.finish({ ok: false, reason });
    await vi.waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        text,
      ),
    );
    const before = pathCalls(f.request).length;
    f.language("pt-BR");
    expect(pathCalls(f.request)).toHaveLength(before);
    expect(
      document.querySelector('[role="status"]')?.textContent,
    ).not.toContain(text);
  },
);

it("clears the busy notice when the original insertion completes", async () => {
  const f = await setup();
  key(f.row("folder"));
  key(f.row("name"));
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "already in progress",
  );
  f.finish({ ok: true });
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLElement>('[role="status"]')?.hidden).toBe(
      true,
    ),
  );
});

it("reports busy locally and treats a rejected request as outcome unknown without replay", async () => {
  const f = await setup();
  key(f.row("folder"));
  key(f.row("name"));
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "already in progress",
  );
  f.reject(new Error("transport"));
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "outcome is unknown",
    ),
  );
  expect(pathCalls(f.request)).toHaveLength(1);
});
