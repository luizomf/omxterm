// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { FilesTreeEntry } from "../../extensions/files/tree";
import type { SupportedLanguage } from "../../src/shared/i18n";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
const file = (name: string): FilesTreeEntry => ({
  name,
  kind: "file",
  size: 1,
});
const folder = (name: string): FilesTreeEntry => ({
  name,
  kind: "directory",
  size: 0,
});
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function setup() {
  const listings: Record<string, FilesTreeEntry[]> = {
    "/root": [
      folder("projects"),
      file("alpha.txt"),
      file("beta.txt"),
      file(".secret"),
    ],
    "/root/projects": [file("nested.txt"), file("other")],
    "/empty": [],
  };
  let handler:
    | ((value: {
        operation: string;
        path?: string;
      }) => Promise<Reply> | undefined)
    | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as { operation: string; path?: string };
    const result = handler?.(input);
    if (result) return result;
    if (input.operation === "home") return { ok: true, directory: "/root" };
    if (input.operation === "list") {
      const rows = listings[input.path!] ?? [];
      return { ok: true, directory: input.path!, rows, total: rows.length };
    }
    return { ok: true };
  });
  let visibility!: (visible: boolean) => void;
  let intent!: (intent: "search" | "restore") => void;
  let language!: (language: SupportedLanguage) => void;
  const unsubscribeFocus = vi.fn();
  const page = mountFilesPage(document, {
    request,
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
    onFocusIntent(listener) {
      intent = listener;
      return unsubscribeFocus;
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
    intent,
    language,
    unsubscribeFocus,
    handle: (value: typeof handler) => {
      handler = value;
    },
  };
}
const filter = () => document.querySelector<HTMLInputElement>(".entry-filter")!;
const tree = () => document.querySelector<HTMLElement>('[role="tree"]')!;
const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
    (item) => item.dataset.path === path,
  );
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;
function button(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) =>
      !node.closest("[hidden]") &&
      (node.getAttribute("aria-label") === label || node.textContent === label),
  )!;
}
function key(node: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  node.dispatchEvent(event);
  return event;
}
function query(value: string) {
  filter().value = value;
  filter().dispatchEvent(new Event("input", { bubbles: true }));
}
async function idle() {
  await vi.waitFor(() =>
    expect(tree().getAttribute("aria-busy")).toBe("false"),
  );
}

it("focuses the filter on explicit intent, preserves editing and restores retained controls", async () => {
  const { intent, visibility, unsubscribeFocus } = await setup();
  intent("search");
  expect(document.activeElement).toBe(filter());
  query("alpha");
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.focus();
  address.value = "/unsubmitted";
  address.setSelectionRange(2, 5);
  visibility(false);
  visibility(true);
  intent("restore");
  expect(document.activeElement).toBe(address);
  expect(address.value).toBe("/unsubmitted");
  expect([address.selectionStart, address.selectionEnd]).toEqual([2, 5]);
  expect(filter().value).toBe("alpha");
  dispose?.();
  intent("search");
  expect(unsubscribeFocus).toHaveBeenCalledOnce();
});

it("filters only loaded rows and retains ancestors without requests or implicit operation targets", async () => {
  const { request, language } = await setup();
  const projects = row("/root/projects")!;
  projects.focus();
  key(projects, "ArrowRight");
  await idle();
  row("/root/beta.txt")!.focus();
  const calls = request.mock.calls.length;
  filter().focus();
  query("nested");
  expect(row("/root/projects")).toBeTruthy();
  expect(row("/root/projects/nested.txt")).toBeTruthy();
  expect(row("/root/projects/other")).toBeUndefined();
  expect(row("/root/beta.txt")).toBeUndefined();
  expect(document.querySelector('[aria-selected="true"]')).toBeNull();
  expect(request).toHaveBeenCalledTimes(calls);
  expect(document.activeElement).toBe(filter());
  query("no match");
  expect(tree().tabIndex).toBe(0);
  expect(document.body.textContent).toContain(
    "No matching visible loaded entries · Dotfiles hidden",
  );
  language("pt-BR");
  expect(document.body.textContent).toContain(
    "Nenhuma entrada visível carregada corresponde · Itens iniciados por ponto ocultos",
  );
  query("");
  expect(row("/root/projects/nested.txt")).toBeTruthy();
  expect(row("/root/.secret")).toBeUndefined();
});

it("selects the focused row for keyboard actions and leaves modified/composing gestures untouched", async () => {
  const { request } = await setup();
  row("/root/alpha.txt")!.focus();
  expect(row("/root/alpha.txt")!.getAttribute("aria-selected")).toBe("true");
  row("/root/beta.txt")!.focus();
  expect(row("/root/beta.txt")!.getAttribute("aria-selected")).toBe("true");
  const active = row("/root/beta.txt")!;
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
  ]) {
    expect(key(active, "F2", options).defaultPrevented).toBe(false);
  }
  expect(document.querySelector<HTMLElement>(".operation-editor")!.hidden).toBe(
    true,
  );
  for (const options of [
    { isComposing: true },
    { ctrlKey: true },
    { altKey: true },
  ]) {
    expect(
      key(active, "F10", { ...options, shiftKey: true }).defaultPrevented,
    ).toBe(false);
    expect(menu().hidden).toBe(true);
  }
  key(active, "ContextMenu");
  expect(menu().hidden).toBe(false);
  const rename = button("Rename / move", menu());
  expect(rename.getAttribute("aria-keyshortcuts")).toBe("F2");
  expect(
    document.getElementById(rename.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Shortcut: F2");
  rename.click();
  expect(document.querySelector(".operation-editor")?.textContent).toContain(
    "/root/beta.txt",
  );
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  expect(key(input, "a", { metaKey: true }).defaultPrevented).toBe(false);
  expect(
    request.mock.calls.some(
      ([value]) => (value as { operation: string }).operation === "move",
    ),
  ).toBe(false);
});

it.each(["F2", "ContextMenu", "F10"] as const)(
  "makes an unselected fallback row the explicit target before %s",
  async (action) => {
    await setup();
    button("Actions…").click();
    menu()
      .querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
      .click();
    row("/root/.secret")!.focus();
    key(row("/root/.secret")!, "ContextMenu");
    menu()
      .querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
      .click();
    const fallback = document.activeElement as HTMLElement;
    expect(fallback.getAttribute("role")).toBe("treeitem");
    expect(document.querySelector('[aria-selected="true"]')).toBeNull();
    const path = fallback.dataset.path!;
    key(fallback, action, { shiftKey: action === "F10" });
    expect(row(path)?.getAttribute("aria-selected")).toBe("true");
    if (action === "F2")
      expect(
        document.querySelector(".operation-editor")?.textContent,
      ).toContain(path);
    else {
      expect(menu().hidden).toBe(false);
      expect(button("Rename / move", menu())).toBeTruthy();
    }
  },
);

it("returns Cancel to the captured origin rather than a subsequently selected row", async () => {
  const { intent, visibility } = await setup();
  row("/root/alpha.txt")!.focus();
  key(row("/root/alpha.txt")!, "F2");
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  input.value = "/root/draft";
  visibility(false);
  visibility(true);
  intent("search");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("/root/draft");
  row("/root/beta.txt")!.focus();
  button("Cancel").click();
  expect(document.activeElement).toBe(row("/root/alpha.txt"));
});

it("keeps an operation draft and menu when Escape is composing or repeating", async () => {
  await setup();
  row("/root/alpha.txt")!.focus();
  key(row("/root/alpha.txt")!, "F2");
  const editor = document.querySelector<HTMLElement>(".operation-editor")!;
  const input = editor.querySelector("input")!;
  input.value = "/root/draft";
  input.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  expect(key(input, "Escape").defaultPrevented).toBe(false);
  expect(key(input, "Escape", { repeat: true }).defaultPrevented).toBe(false);
  input.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true }),
  );
  expect(key(input, "Escape", { isComposing: true }).defaultPrevented).toBe(
    false,
  );
  expect(key(input, "Escape", { repeat: true }).defaultPrevented).toBe(false);
  expect(input.value).toBe("/root/draft");
  expect(editor.hidden).toBe(false);
  expect(key(input, "Escape").defaultPrevented).toBe(true);
  expect(editor.hidden).toBe(true);

  key(row("/root/alpha.txt")!, "ContextMenu");
  const item = document.activeElement as HTMLElement;
  item.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  expect(key(item, "Escape").defaultPrevented).toBe(false);
  expect(menu().hidden).toBe(false);
  item.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  expect(key(item, "Escape", { isComposing: true }).defaultPrevented).toBe(
    false,
  );
  expect(key(item, "Escape", { repeat: true }).defaultPrevented).toBe(false);
  expect(menu().hidden).toBe(false);
  expect(key(item, "Escape").defaultPrevented).toBe(true);
  expect(menu().hidden).toBe(true);
});

it("retains errors from loaded expanded folders while filtering", async () => {
  const { handle } = await setup();
  handle((value) =>
    value.operation === "list" && value.path === "/root/projects"
      ? Promise.resolve({ ok: false, error: "permission" })
      : undefined,
  );
  const projects = row("/root/projects")!;
  projects.focus();
  key(projects, "ArrowRight");
  await idle();
  filter().focus();
  query("not present");
  expect(row("/root/projects")).toBeTruthy();
  expect(document.querySelector(".tree-hint")?.textContent).toContain(
    "permission",
  );
});

it.each(["success", "failure", "moved"] as const)(
  "restores mutation focus safely after %s",
  async (outcome) => {
    const { handle } = await setup();
    let resolve!: (reply: Reply) => void;
    const pending = new Promise<Reply>((done) => {
      resolve = done;
    });
    handle((value) => (value.operation === "move" ? pending : undefined));
    row("/root/alpha.txt")!.focus();
    key(row("/root/alpha.txt")!, "F2");
    const editor =
      document.querySelector<HTMLFormElement>(".operation-editor")!;
    const input = editor.querySelector("input")!;
    input.value = "/root/new";
    editor.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(editor.inert).toBe(true);
    if (outcome === "moved") filter().focus();
    resolve(
      outcome === "failure" ? { ok: false, error: "conflict" } : { ok: true },
    );
    await vi.waitFor(() => expect(editor.inert).toBe(false));
    expect(document.activeElement).toBe(
      outcome === "moved"
        ? filter()
        : outcome === "failure"
          ? input
          : row("/root/alpha.txt"),
    );
    expect(editor.hidden).toBe(outcome !== "failure");
  },
);

it("does not steal focus when a delayed deletion confirmation arrives", async () => {
  const { handle } = await setup();
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) =>
    value.operation === "prepare-delete" ? pending : undefined,
  );
  row("/root/alpha.txt")!.focus();
  key(row("/root/alpha.txt")!, "ContextMenu");
  button("Delete permanently…", menu()).click();
  filter().focus();
  resolve({ ok: true, path: "/root/alpha.txt", token: "one-shot" });
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Permanently delete /root/alpha.txt",
    ),
  );
  expect(document.activeElement).toBe(filter());
  expect(document.querySelector(".operation-editor")?.textContent).toContain(
    "cannot be undone",
  );
});

it("keeps an unsubmitted address draft across refresh, filtering and expansion", async () => {
  const { handle } = await setup();
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) =>
    value.operation === "list" && value.path === "/root" ? pending : undefined,
  );
  button("Refresh").click();
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.focus();
  address.value = "/unsubmitted draft";
  address.dispatchEvent(new Event("input", { bubbles: true }));
  address.setSelectionRange(2, 8);
  filter().focus();
  query("projects");
  resolve({
    ok: true,
    directory: "/root",
    rows: [folder("projects"), file("alpha.txt")],
    total: 2,
  });
  await idle();
  expect(address.value).toBe("/unsubmitted draft");
  expect([address.selectionStart, address.selectionEnd]).toEqual([2, 8]);
  handle(undefined);
  row("/root/projects")!.focus();
  key(row("/root/projects")!, "ArrowRight");
  await idle();
  expect(address.value).toBe("/unsubmitted draft");
});

it("focuses and retains a filter query while initial Home is still pending", async () => {
  let resolve!: (reply: Reply) => void;
  let intent!: (intent: "search" | "restore") => void;
  const home = new Promise<Reply>((done) => {
    resolve = done;
  });
  const page = mountFilesPage(document, {
    request: async (value) =>
      (value as { operation: string }).operation === "home"
        ? home
        : {
            ok: true,
            directory: "/root",
            rows: [file("alpha"), file("beta")],
            total: 2,
          },
    onVisibility(listener) {
      listener(true);
      return () => {};
    },
    onFocusIntent(listener) {
      intent = listener;
      return () => {};
    },
  });
  dispose = page.dispose;
  intent("search");
  query("alpha");
  resolve({ ok: true, directory: "/root" });
  await page.ready;
  expect(document.activeElement).toBe(filter());
  expect(filter().value).toBe("alpha");
  expect(row("/root/alpha")).toBeTruthy();
  expect(row("/root/beta")).toBeUndefined();
});

it("preserves an address typed before initial Home resolves", async () => {
  let resolve!: (reply: Reply) => void;
  const home = new Promise<Reply>((done) => {
    resolve = done;
  });
  const page = mountFilesPage(document, {
    request: async (value) =>
      (value as { operation: string }).operation === "home"
        ? home
        : { ok: true, directory: "/root", rows: [], total: 0 },
  });
  dispose = page.dispose;
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.focus();
  address.value = "/draft";
  address.dispatchEvent(new Event("input", { bubbles: true }));
  filter().focus();
  resolve({ ok: true, directory: "/root" });
  await page.ready;
  expect(address.value).toBe("/draft");
  expect(document.activeElement).toBe(filter());
});

it("enters newly loaded rows from a tree focused while empty", async () => {
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  const page = mountFilesPage(document, {
    request: async (value) =>
      (value as { operation: string }).operation === "home"
        ? { ok: true, directory: "/root" }
        : pending,
  });
  dispose = page.dispose;
  tree().focus();
  expect(document.activeElement).toBe(tree());
  resolve({ ok: true, directory: "/root", rows: [file("first")], total: 1 });
  await page.ready;
  expect(document.activeElement).toBe(tree());
  expect(document.querySelector('[aria-selected="true"]')).toBeNull();
  key(tree(), "ArrowDown");
  expect(document.activeElement).toBe(row("/root/first"));
  expect(row("/root/first")?.getAttribute("aria-selected")).toBe("true");
});

it("focuses a pending delete confirmation after internal restoration of the same row", async () => {
  const { handle } = await setup();
  let resolveList!: (reply: Reply) => void;
  let resolveDelete!: (reply: Reply) => void;
  const listing = new Promise<Reply>((done) => {
    resolveList = done;
  });
  const deletion = new Promise<Reply>((done) => {
    resolveDelete = done;
  });
  handle((value) =>
    value.operation === "list"
      ? listing
      : value.operation === "prepare-delete"
        ? deletion
        : undefined,
  );
  row("/root/alpha.txt")!.focus();
  button("Refresh").click();
  key(row("/root/alpha.txt")!, "ContextMenu");
  button("Delete permanently…", menu()).click();
  resolveList({
    ok: true,
    directory: "/root",
    rows: [folder("projects"), file("alpha.txt")],
    total: 2,
  });
  await idle();
  expect(document.activeElement).toBe(row("/root/alpha.txt"));
  resolveDelete({ ok: true, path: "/root/alpha.txt", token: "one-shot" });
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(button("Delete permanently")),
  );
});

it("restores the same focused row without scrolling it into view", async () => {
  await setup();
  row("/root/alpha.txt")!.focus();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  button("Refresh").click();
  await idle();
  expect(
    focus.mock.calls.some(([options]) => options?.preventScroll === true),
  ).toBe(true);
  expect(document.activeElement).toBe(row("/root/alpha.txt"));
});

it("does not steal focus when a pending listing settles and keeps the filter useful after an error", async () => {
  const { intent, handle, request } = await setup();
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) => (value.operation === "list" ? pending : undefined));
  button("Refresh").click();
  intent("search");
  query("alpha");
  expect(document.activeElement).toBe(filter());
  resolve({ ok: false, error: "permission" });
  await idle();
  expect(document.activeElement).toBe(filter());
  expect(document.body.textContent).toContain(
    "Directory unavailable: permission",
  );
  expect(row("/root/alpha.txt")).toBeTruthy();
  expect(row("/root/beta.txt")).toBeUndefined();
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "list",
    ),
  ).toHaveLength(2);
});
