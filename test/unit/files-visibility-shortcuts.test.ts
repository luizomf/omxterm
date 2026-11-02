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
