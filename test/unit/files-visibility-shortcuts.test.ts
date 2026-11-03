/* eslint-disable max-lines -- Keep the shared Files shortcut and menu-geometry fixture together. */
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

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
async function setup(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  let handler:
    ((value: Record<string, string>) => Promise<Reply> | undefined) | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as Record<string, string>;
    const custom = handler?.(input);
    if (custom) return custom;
    if (input.operation === "home") return { ok: true, directory: "/root" };
    if (input.operation === "list")
      return {
        ok: true,
        directory: input.path!,
        rows: [
          { name: ".private", kind: "file", size: 1 },
          { name: "visible", kind: "file", size: 1 },
        ],
      };
    return { ok: true };
  });
  let visibility!: (value: boolean) => void;
  let language!: (value: SupportedLanguage) => void;
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
  return {
    request,
    visibility,
    language,
    handle(next: typeof handler) {
      handler = next;
    },
  };
}
function button(name: string, scope: ParentNode = document) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      !element.closest("[hidden]") &&
      (element.getAttribute("aria-label") === name ||
        element.textContent === name),
  );
  expect(result, name).toBeTruthy();
  return result!;
}
function row(path: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
    (item) => item.dataset.path === path,
  );
}
function key(
  element: HTMLElement,
  value: string,
  options: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
  return event;
}
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;
const linux = { code: "KeyH", ctrlKey: true };

it("uses Linux Ctrl+H in the active Files tree and describes it in Actions", async () => {
  const { request } = await setup("Linux aarch64");
  const visible = row("/root/visible")!;
  visible.focus();
  const calls = request.mock.calls.length;
  expect(key(visible, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(calls);
  button("Actions…").click();
  const item = menu().querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
  const hint = document.getElementById(item.getAttribute("aria-describedby")!);
  expect(hint?.textContent).toBe("Shortcut: Ctrl+H");
  expect(hint?.closest("[hidden]")).toBeNull();
  expect(item.getAttribute("aria-keyshortcuts")).toBe("Control+H");
});

it.each([
  [
    "en-US",
    "Actions…",
    "Show dotfiles (names starting with .)",
    "Shortcut: Cmd+Shift+.",
  ],
  [
    "pt-BR",
    "Ações…",
    "Mostrar itens iniciados por ponto (.)",
    "Atalho: Cmd+Shift+.",
  ],
] as const)(
  "keeps a focused, accessible checked item in %s",
  async (locale, actionsName, caption, description) => {
    const { language } = await setup("MacIntel");
    language(locale);
    const actions = button(actionsName);
    actions.focus();
    actions.click();
    const item = menu().querySelector<HTMLButtonElement>(
      '[role="menuitemcheckbox"]',
    )!;
    item.focus();
    expect(document.activeElement).toBe(item);
    expect(item.getAttribute("aria-checked")).toBe("false");
    expect(
      document.getElementById(item.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe(caption);
    expect(
      document.getElementById(item.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe(description);
    expect(item.querySelector(".menu-check")?.textContent).toBe("□");
    item.click();
    expect(document.activeElement).toBe(actions);
    actions.click();
    const checked = menu().querySelector<HTMLButtonElement>(
      '[role="menuitemcheckbox"]',
    )!;
    expect(checked.getAttribute("aria-checked")).toBe("true");
    expect(checked.querySelector(".menu-check")?.textContent).toBe("✓");
    checked.focus();
    expect(document.activeElement).toBe(checked);
    expect(
      document.getElementById(checked.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe(caption);
    expect(
      document.getElementById(checked.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe(description);
  },
);

it.each([
  ["en-US", "Actions…", 107.375],
  ["pt-BR", "Ações…", 126.21875],
] as const)(
  "reveals the whole keyboard-focused checkbox in the short %s menu",
  async (locale, actionsName, clippedTop) => {
    const { language, request } = await setup("MacIntel");
    language(locale);
    const actions = button(actionsName);
    const popup = menu();
    // Replay the retained 196x174-DIP child geometry, not a jsdom layout claim.
    vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 8, 181, 166),
    );
    Object.defineProperties(popup, {
      clientTop: { configurable: true, value: 1 },
      clientHeight: { configurable: true, value: 164 },
    });
    const reads = request.mock.calls.length;
    for (const checked of [false, true]) {
      actions.click();
      const item = popup.querySelector<HTMLButtonElement>(
        '[role="menuitemcheckbox"]',
      )!;
      expect(item.getAttribute("aria-checked")).toBe(String(checked));
      const focus = vi.spyOn(item, "focus");
      popup.scrollTop = 21;
      vi.spyOn(item, "getBoundingClientRect").mockImplementation(
        () =>
          new DOMRect(5, clippedTop + 21 - popup.scrollTop, 156, 84.4765625),
      );
      const assertVisible = () => {
        const rect = item.getBoundingClientRect();
        // Include the shared 2-DIP outline plus its 2-DIP offset.
        expect(rect.top - 4).toBeGreaterThanOrEqual(9);
        expect(rect.bottom + 4).toBeLessThanOrEqual(173);
        expect(document.activeElement).toBe(item);
      };
      expect(
        key(document.activeElement as HTMLElement, "End").defaultPrevented,
      ).toBe(true);
      assertVisible();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      // End on an already-focused item must reveal it again, not depend on a
      // new native focus event. Arrow wrap and Home keep their existing order.
      popup.scrollTop = 21;
      key(item, "End");
      assertVisible();
      key(item, "ArrowDown");
      expect(document.activeElement).toBe(
        popup.querySelector("button:not(:disabled)"),
      );
      key(document.activeElement as HTMLElement, "ArrowUp");
      assertVisible();
      key(item, "Home");
      expect(document.activeElement).toBe(
        popup.querySelector("button:not(:disabled)"),
      );
      key(document.activeElement as HTMLElement, "End");
      assertVisible();
      item.click();
      expect(popup.hidden).toBe(true);
      expect(document.activeElement).toBe(actions);
    }
    expect(request).toHaveBeenCalledTimes(reads);
  },
);

it.each([
  ["en-US", "Actions…", 128.375],
  ["pt-BR", "Ações…", 147.21875],
] as const)(
  "reveals the still-focused %s checkbox when the child viewport narrows",
  async (locale, actionsName, narrowTop) => {
    const { language, request } = await setup("MacIntel");
    language(locale);
    const address =
      document.querySelector<HTMLInputElement>(".location input")!;
    address.value = "/synthetic/draft";
    address.setSelectionRange(2, 9, "backward");
    const actions = button(actionsName);
    actions.focus();
    actions.click();
    const popup = menu();
    const item = popup.querySelector<HTMLButtonElement>(
      '[role="menuitemcheckbox"]',
    )!;
    // Model a wide layout followed by the retained narrow geometry. jsdom
    // does not establish Chromium's wrapping or the native End/resize order.
    let width = 256;
    vi.spyOn(popup, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 8, width - 15, 166),
    );
    Object.defineProperties(popup, {
      clientTop: { configurable: true, value: 1 },
      clientHeight: { configurable: true, value: 164 },
    });
    vi.spyOn(item, "getBoundingClientRect").mockImplementation(
      () =>
        new DOMRect(
          5,
          (width === 256 ? 128.375 : narrowTop) - popup.scrollTop,
          width - 40,
          width === 256 ? 65.625 : 84.4765625,
        ),
    );
    popup.scrollTop = 0;
    key(document.activeElement as HTMLElement, "End");
    expect(popup.scrollTop).toBe(25);
    expect(document.activeElement).toBe(item);
    const focus = vi.spyOn(item, "focus");
    const reads = request.mock.calls.length;
    width = 196;
    expect(item.getBoundingClientRect().bottom + 4).toBeGreaterThan(173);
    window.dispatchEvent(new Event("resize"));
    expect(item.getBoundingClientRect().bottom + 4).toBeLessThanOrEqual(173);
    expect(item.getBoundingClientRect().top - 4).toBeGreaterThanOrEqual(9);
    expect(document.activeElement).toBe(item);
    expect(focus).not.toHaveBeenCalled();
    expect(item.getAttribute("aria-checked")).toBe("false");
    for (const value of ["PageDown", "PageUp", "x"])
      expect(key(item, value).defaultPrevented).toBe(false);
    expect(address.value).toBe("/synthetic/draft");
    expect([
      address.selectionStart,
      address.selectionEnd,
      address.selectionDirection,
    ]).toEqual([2, 9, "backward"]);
    expect(request).toHaveBeenCalledTimes(reads);
    item.click();
    expect(popup.hidden).toBe(true);
    expect(document.activeElement).toBe(actions);
  },
);

it("does not reveal or refocus a closed, unfocused or disposed menu on resize", async () => {
  const added = vi.spyOn(window, "addEventListener");
  const removed = vi.spyOn(window, "removeEventListener");
  const { visibility } = await setup("MacIntel");
  const actions = button("Actions…");
  actions.click();
  const popup = menu();
  const item = popup.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  key(document.activeElement as HTMLElement, "End");
  const itemBounds = vi.spyOn(item, "getBoundingClientRect");
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.focus();
  window.dispatchEvent(new Event("resize"));
  expect(popup.hidden).toBe(false);
  expect(document.activeElement).toBe(address);
  expect(itemBounds).not.toHaveBeenCalled();
  item.focus();
  visibility(false);
  expect(popup.hidden).toBe(true);
  window.dispatchEvent(new Event("resize"));
  expect(popup.hidden).toBe(true);
  expect(itemBounds).not.toHaveBeenCalled();
  // Dispose while a fresh menu item is still focused. No retained window
  // listener may reveal it after the owner disposes the view.
  visibility(true);
  actions.click();
  key(document.activeElement as HTMLElement, "End");
  const retained = document.activeElement as HTMLElement;
  const retainedBounds = vi.spyOn(retained, "getBoundingClientRect");
  const scroll = popup.scrollTop;
  dispose!();
  dispose = undefined;
  window.dispatchEvent(new Event("resize"));
  expect(document.activeElement).toBe(retained);
  expect(retainedBounds).not.toHaveBeenCalled();
  expect(popup.scrollTop).toBe(scroll);
  for (const [type, listener] of added.mock.calls)
    if (type === "resize")
      expect(removed).toHaveBeenCalledWith("resize", listener);
});

it("reveals a retained focused menu item after its localized text grows", async () => {
  const { language } = await setup("MacIntel");
  button("Actions…").click();
  const popup = menu();
  const item = popup.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 8, 181, 166),
  );
  Object.defineProperties(popup, {
    clientTop: { configurable: true, value: 1 },
    clientHeight: { configurable: true, value: 164 },
  });
  popup.scrollTop = 0;
  let height = 60;
  vi.spyOn(item, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(5, 100 - popup.scrollTop, 156, height),
  );
  key(document.activeElement as HTMLElement, "End");
  expect(popup.scrollTop).toBe(0);
  height = 90;
  language("pt-BR");
  expect(popup.scrollTop).toBe(21);
  expect(item.getBoundingClientRect().bottom + 4).toBe(173);
  expect(document.activeElement).toBe(item);
  expect(item.querySelector(".menu-caption")?.textContent).toBe(
    "Mostrar itens iniciados por ponto (.)",
  );
  expect(item.querySelector(".menu-shortcut")?.textContent).toBe(
    "Atalho: Cmd+Shift+.",
  );
  // An item taller than the scrollport starts at its check/caption; native
  // PageDown/PageUp remain unclaimed so its remainder can still be scrolled.
  height = 200;
  key(item, "End");
  expect(item.getBoundingClientRect().top - 4).toBe(9);
  expect(key(item, "PageDown").defaultPrevented).toBe(false);
  expect(key(item, "PageUp").defaultPrevented).toBe(false);
});

it("leaves the gesture untouched until a browsing root is available", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux aarch64");
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  const page = mountFilesPage(document, {
    request: async (value) => {
      const input = value as { operation: string };
      return input.operation === "home"
        ? pending
        : {
            ok: true,
            directory: "/root",
            rows: [{ name: ".private", kind: "file", size: 1 }],
          };
    },
  });
  dispose = page.dispose;
  const actions = button("Actions…");
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(false);
  resolve({ ok: true, directory: "/root" });
  await page.ready;
  expect(row("/root/.private")).toBeUndefined();
  expect(key(actions, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
});

it("uses macOS Cmd+Shift+Period only for matching period identities", async () => {
  const { language } = await setup("MacIntel");
  row("/root/visible")!.focus();
  const mac = { code: "Period", metaKey: true, shiftKey: true };
  expect(key(row("/root/visible")!, ".", mac).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
  row("/root/visible")!.focus();
  expect(key(row("/root/visible")!, ">", mac).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeUndefined();
  const target = row("/root/visible")!;
  target.focus();
  for (const [value, modifiers] of [
    [">", { ...mac, code: "Slash" }],
    [":", mac],
    [".", { ...mac, shiftKey: false }],
    [".", { ...mac, ctrlKey: true }],
    [".", { ...mac, altKey: true }],
  ] as const)
    expect(key(target, value, modifiers).defaultPrevented).toBe(false);
  expect(row("/root/.private")).toBeUndefined();
  button("Actions…").click();
  const item = menu().querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
  const hint = document.getElementById(item.getAttribute("aria-describedby")!);
  expect(hint?.textContent).toBe("Shortcut: Cmd+Shift+.");
  expect(item.getAttribute("aria-keyshortcuts")).toBe("Meta+Shift+.");
  language("pt-BR");
  expect(hint?.textContent).toBe("Atalho: Cmd+Shift+.");
});

it("does not claim a shortcut during a composition session, even if a key omits the flag", async () => {
  await setup("Linux aarch64");
  const target = row("/root/visible")!;
  target.focus();
  target.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  expect(key(target, "h", linux).defaultPrevented).toBe(false);
  expect(row("/root/.private")).toBeUndefined();
  target.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true }),
  );
  expect(key(target, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
});

it("does not claim the shortcut while a deletion confirmation is being prepared", async () => {
  const { handle } = await setup("Linux aarch64");
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) =>
    value.operation === "prepare-delete" ? pending : undefined,
  );
  row("/root/visible")!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  button("Delete permanently…", menu()).click();
  const actions = button("Actions…");
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(false);
  expect(row("/root/.private")).toBeUndefined();
  resolve({ ok: true, path: "/root/visible", token: "captured" });
  await vi.waitFor(() => expect(button("Delete permanently")).toBeTruthy());
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(false);
  expect(row("/root/.private")).toBeUndefined();
  button("Cancel").click();
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
});

it("clears a hidden selection and restores focus when a shortcut conceals it", async () => {
  const { request } = await setup("Linux aarch64");
  const visible = row("/root/visible")!;
  visible.focus();
  key(visible, "h", linux);
  const hidden = row("/root/.private")!;
  hidden.click();
  const calls = request.mock.calls.length;
  expect(key(hidden, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeUndefined();
  expect(document.activeElement).toBe(row("/root/visible"));
  expect(document.querySelector('[aria-selected="true"]')).toBeNull();
  button("Actions…").click();
  expect(menu().textContent).not.toContain("Rename / move");
  expect(request).toHaveBeenCalledTimes(calls);
});

it("does not intercept editing controls, contenteditable content, other views, or hidden Files", async () => {
  const { visibility } = await setup("Linux aarch64");
  const content = document.querySelector<HTMLElement>(
    ".application-page-content",
  )!;
  const controls = ["textarea", "select", "div"].map((tag) =>
    document.createElement(tag),
  );
  controls[2]!.setAttribute("contenteditable", "true");
  for (const control of controls) {
    control.tabIndex = 0;
    content.append(control);
  }
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  for (const target of [address, ...controls]) {
    target.focus();
    expect(key(target, "h", linux).defaultPrevented).toBe(false);
    expect(row("/root/.private")).toBeUndefined();
  }
  const other = document.createElement("button");
  document.body.append(other);
  other.focus();
  expect(key(other, "h", linux).defaultPrevented).toBe(false);
  const target = row("/root/visible")!;
  target.focus();
  visibility(false);
  expect(key(target, "h", linux).defaultPrevented).toBe(false);
  visibility(true);
  expect(key(target, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
});

it("ignores modifier mismatches, composition, pre-consumed input and repeated keydowns", async () => {
  await setup("Linux x86_64");
  const target = row("/root/visible")!;
  target.focus();
  for (const extra of [
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
  ]) {
    expect(key(target, "h", { ...linux, ...extra }).defaultPrevented).toBe(
      false,
    );
  }
  target.addEventListener("keydown", (event) => event.preventDefault(), {
    once: true,
  });
  expect(key(target, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeUndefined();
  expect(key(target, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
  const updated = row("/root/visible")!;
  updated.focus();
  expect(key(updated, "h", { ...linux, repeat: true }).defaultPrevented).toBe(
    true,
  );
  expect(row("/root/.private")).toBeTruthy();
});

it("closes the Actions menu and updates its checked state when the shortcut is used there", async () => {
  await setup("Linux aarch64");
  button("Actions…").click();
  const item = menu().querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
  item.focus();
  expect(key(item, "h", linux).defaultPrevented).toBe(true);
  expect(menu().hidden).toBe(true);
  expect(document.activeElement).toBe(button("Actions…"));
  expect(row("/root/.private")).toBeTruthy();
  button("Actions…").click();
  expect(
    menu()
      .querySelector('[role="menuitemcheckbox"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
});

it("does not advertise or handle these shortcuts on an unknown platform", async () => {
  await setup("Win32");
  const target = row("/root/visible")!;
  target.focus();
  expect(key(target, "h", linux).defaultPrevented).toBe(false);
  button("Actions…").click();
  const item = menu().querySelector('[role="menuitemcheckbox"]')!;
  expect(item.hasAttribute("aria-keyshortcuts")).toBe(false);
  expect(item.hasAttribute("aria-describedby")).toBe(false);
});

it("does not claim a visibility shortcut while an operation editor is open", async () => {
  await setup("Linux aarch64");
  button("New folder").click();
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  input.value = "draft";
  expect(key(input, "h", linux).defaultPrevented).toBe(false);
  const actions = button("Actions…");
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(false);
  expect(input.value).toBe("draft");
  expect(row("/root/.private")).toBeUndefined();
});

it("does not claim a shortcut during an accepted file mutation", async () => {
  const { handle } = await setup("Linux aarch64");
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) => (value.operation === "trash" ? pending : undefined));
  row("/root/visible")!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  button("Move to Trash", menu()).click();
  const actions = button("Actions…");
  actions.focus();
  expect(key(actions, "h", linux).defaultPrevented).toBe(false);
  expect(row("/root/.private")).toBeUndefined();
  resolve({ ok: true });
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "Operation completed.",
    ),
  );
  expect(key(actions, "h", linux).defaultPrevented).toBe(true);
  expect(row("/root/.private")).toBeTruthy();
});
