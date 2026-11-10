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
async function setup(listings: Record<string, FilesTreeEntry[]>) {
  let handler:
    ((value: Record<string, string>) => Promise<Reply> | undefined) | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as Record<string, string>;
    const custom = handler?.(input);
    if (custom) return custom;
    if (input.operation === "home") return { ok: true, directory: "/root" };
    if (input.operation === "list") {
      const rows = listings[input.path!] ?? [];
      return { ok: true, directory: input.path!, rows, total: rows.length };
    }
    return { ok: true };
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
function navigate(path: string) {
  const input = document.querySelector<HTMLInputElement>(".location input")!;
  input.value = path;
  input.form!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;
function toggle() {
  button("Actions…").click();
  const item = menu().querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  expect(item).toBeTruthy();
  item.click();
}
async function idle() {
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
}

it("quietly indicates only entries actually concealed by the dotfile filter", async () => {
  await setup({
    "/root": [file(".private"), file("visible")],
    "/empty": [],
    "/plain": [file("public")],
  });
  const hint = document.querySelector<HTMLElement>(".filter-hint")!;
  expect(hint.hidden).toBe(false);
  expect(hint.textContent).toBe("Dotfiles hidden");
  toggle();
  expect(hint.hidden).toBe(true);
  toggle();
  expect(hint.hidden).toBe(false);
  navigate("/empty");
  await idle();
  expect(hint.hidden).toBe(false);
  expect(hint.textContent).toBe("No visible entries");
  expect(document.querySelector(".summary")?.textContent).toBe(
    "0 visible entries",
  );
  navigate("/plain");
  await idle();
  expect(hint.hidden).toBe(true);
});

it("keeps no-visible and hidden hints accurate across truncation, loading, errors and language", async () => {
  const { request, handle, language } = await setup({
    "/root": [file(".private")],
  });
  const hint = document.querySelector<HTMLElement>(".filter-hint")!;
  expect(hint.textContent).toBe("No visible entries · Dotfiles hidden");
  handle((value) =>
    value.operation === "list"
      ? Promise.resolve({
          ok: true,
          directory: "/root",
          rows: [file(".private")],
          total: 5000,
          truncated: true,
        })
      : undefined,
  );
  button("Refresh").click();
  await idle();
  expect(hint.textContent).toBe("No visible entries · Dotfiles hidden");
  expect(document.querySelector(".summary")?.textContent).toBe(
    "0 visible entries · Truncated at 5,000 per folder",
  );
  const calls = request.mock.calls.length;
  language("pt-BR");
  expect(hint.textContent).toBe(
    "Nenhuma entrada visível · Itens iniciados por ponto ocultos",
  );
  expect(request).toHaveBeenCalledTimes(calls);
  language("en-US");
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) => (value.operation === "list" ? pending : undefined));
  button("Refresh").click();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "Reading directory…",
  );
  expect(hint.textContent).toBe("Dotfiles hidden");
  resolve({ ok: false, error: "permission" });
  await idle();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "Directory unavailable: permission",
  );
  expect(hint.textContent).toBe("Dotfiles hidden");
});

it("explains a folder with only filtered entries without calling it empty", async () => {
  await setup({
    "/root": [folder("projects")],
    "/root/projects": [file(".private")],
  });
  key(row("/root/projects")!, "ArrowRight");
  await idle();
  expect(row("/root/projects/.private")).toBeUndefined();
  expect(document.querySelector(".tree-hint")?.textContent).toBe(
    "No visible entries",
  );
  expect(document.querySelector(".summary")?.textContent).toBe(
    "1 visible entry",
  );
});

it("moves focus to the visible ancestor, clears hidden selection and retains expanded subtrees", async () => {
  const { request } = await setup({
    "/root": [file("first"), folder("projects"), file(".loose")],
    "/root/projects": [folder(".vault"), file("visible")],
    "/root/projects/.vault": [file("child")],
  });
  toggle();
  key(row("/root/projects")!, "ArrowRight");
  await idle();
  key(row("/root/projects/.vault")!, "ArrowRight");
  await idle();
  const child = row("/root/projects/.vault/child")!;
  child.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  expect(child.getAttribute("aria-selected")).toBe("true");
  const calls = request.mock.calls.length;
  menu().querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!.click();
  expect(row("/root/projects/.vault")).toBeUndefined();
  expect(row("/root/projects/.vault/child")).toBeUndefined();
  expect(document.activeElement).toBe(row("/root/projects"));
  expect(document.querySelector('[aria-selected="true"]')).toBeNull();
  button("Actions…").click();
  expect(menu().textContent).not.toContain("Rename / move");
  menu().querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!.click();
  expect(row("/root/projects/.vault")?.getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(row("/root/projects/.vault/child")).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(calls);
});

it("retains a visible selection when dotfile visibility changes", async () => {
  const { request } = await setup({
    "/root": [file(".private"), file("visible")],
  });
  row("/root/visible")!.click();
  const calls = request.mock.calls.length;
  toggle();
  expect(row("/root/visible")?.getAttribute("aria-selected")).toBe("true");
  toggle();
  expect(row("/root/visible")?.getAttribute("aria-selected")).toBe("true");
  button("Actions…").click();
  expect(button("Rename / move", menu())).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(calls);
});

it("returns focus to the tree when filtering removes its last row", async () => {
  await setup({ "/root": [file(".only")] });
  toggle();
  row("/root/.only")!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  menu().querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!.click();
  const tree = document.querySelector<HTMLElement>('[role="tree"]')!;
  expect(tree.querySelector('[role="treeitem"]')).toBeNull();
  expect(tree.tabIndex).toBe(0);
  expect(document.activeElement).toBe(tree);
  expect(document.querySelector('[aria-selected="true"]')).toBeNull();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "0 visible entries",
  );
});

it("keeps a captured editor target when filtering clears the hidden selection", async () => {
  const { request } = await setup({
    "/root": [file(".secret"), file("visible")],
  });
  toggle();
  row("/root/.secret")!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  button("Rename / move", menu()).click();
  const editor = document.querySelector<HTMLFormElement>(".operation-editor")!;
  const input = editor.querySelector("input")!;
  input.value = "/root/renamed";
  const calls = request.mock.calls.length;
  toggle();
  expect(row("/root/.secret")).toBeUndefined();
  expect(editor.hidden).toBe(false);
  expect(editor.querySelector("input")).toBe(input);
  expect(input.value).toBe("/root/renamed");
  expect(request).toHaveBeenCalledTimes(calls);
  editor.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "move",
      path: "/root/.secret",
      destination: "/root/renamed",
    }),
  );
  await idle();
});

it("keeps a pending permanent-delete confirmation tied to its captured hidden target", async () => {
  const { request, handle } = await setup({
    "/root": [file(".secret"), file("visible")],
  });
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) =>
    value.operation === "prepare-delete" ? pending : undefined,
  );
  toggle();
  row("/root/.secret")!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  button("Delete permanently…", menu()).click();
  toggle();
  expect(row("/root/.secret")).toBeUndefined();
  expect(
    request.mock.calls.map(
      ([value]) => (value as { operation: string }).operation,
    ),
  ).not.toContain("delete");
  resolve({ ok: true, path: "/root/.secret", token: "captured" });
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Permanently delete /root/.secret?",
    ),
  );
  button("Delete permanently").click();
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "delete",
      token: "captured",
    }),
  );
  await idle();
});

it("accepts a typed hidden root and retains preference across navigation and Hide, but not a new view", async () => {
  const listings = {
    "/root": [folder(".config"), file("visible")],
    "/root/.config": [file(".private"), file("prefs")],
  };
  const { visibility } = await setup(listings);
  navigate("/root/.config");
  await idle();
  expect(row("/root/.config/prefs")).toBeTruthy();
  expect(row("/root/.config/.private")).toBeUndefined();
  toggle();
  expect(row("/root/.config/.private")).toBeTruthy();
  visibility(false);
  visibility(true);
  navigate("/root");
  await idle();
  expect(row("/root/.config")).toBeTruthy();
  button("Actions…").click();
  expect(
    menu()
      .querySelector('[role="menuitemcheckbox"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
  dispose?.();
  document.body.replaceChildren();
  await setup(listings);
  expect(row("/root/.config")).toBeUndefined();
  button("Actions…").click();
  expect(
    menu()
      .querySelector('[role="menuitemcheckbox"]')
      ?.getAttribute("aria-checked"),
  ).toBe("false");
});

it("preserves in-flight pagination and errors across filtering a hidden subtree", async () => {
  const { request, handle } = await setup({
    "/root": [folder(".vault"), file("visible")],
  });
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  handle((value) => {
    if (value.operation === "list" && value.path === "/root/.vault")
      return pending;
    if (value.operation === "list-next")
      return Promise.resolve({ ok: false, error: "expired-listing" });
    return undefined;
  });
  toggle();
  key(row("/root/.vault")!, "ArrowRight");
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "list",
      path: "/root/.vault",
    }),
  );
  toggle();
  expect(row("/root/.vault")).toBeUndefined();
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
  ).toBe("true");
  resolve({
    ok: true,
    directory: "/root/.vault",
    rows: [file(".secret"), file("received")],
    cursor: "cursor",
    total: 5000,
    truncated: true,
  });
  await idle();
  expect(request).toHaveBeenCalledWith({
    operation: "list-next",
    cursor: "cursor",
  });
  expect(request).toHaveBeenCalledWith({
    operation: "list-close",
    cursor: "cursor",
  });
  const calls = request.mock.calls.length;
  toggle();
  expect(row("/root/.vault")?.getAttribute("aria-expanded")).toBe("true");
  expect(row("/root/.vault/.secret")).toBeTruthy();
  expect(row("/root/.vault/received")).toBeTruthy();
  expect(document.querySelector(".tree-hint")?.textContent).toBe(
    "Folder unavailable: expired-listing",
  );
  expect(request).toHaveBeenCalledTimes(calls);
});

it("keeps truncation and root refresh errors visible while filtering retained rows", async () => {
  const { request, handle } = await setup({
    "/root": [file(".private"), file("visible")],
  });
  handle((value) =>
    value.operation === "list"
      ? Promise.resolve({
          ok: true,
          directory: "/root",
          rows: [file(".private"), file("visible")],
          total: 5000,
          truncated: true,
        })
      : undefined,
  );
  button("Refresh").click();
  await idle();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "1 visible entry · Truncated at 5,000 per folder",
  );
  const calls = request.mock.calls.length;
  toggle();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "2 visible entries · Truncated at 5,000 per folder",
  );
  expect(request).toHaveBeenCalledTimes(calls);
  handle((value) =>
    value.operation === "list"
      ? Promise.resolve({ ok: false, error: "permission" })
      : undefined,
  );
  button("Refresh").click();
  await idle();
  toggle();
  expect(document.querySelector(".summary")?.textContent).toBe(
    "Directory unavailable: permission",
  );
  expect(row("/root/visible")).toBeTruthy();
  expect(row("/root/.private")).toBeUndefined();
});

it("relabels a focused checked menu item live without requests", async () => {
  const { language, request } = await setup({
    "/root": [file(".private"), file("visible")],
  });
  toggle();
  button("Actions…").click();
  const item = menu().querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"]',
  )!;
  item.focus();
  const calls = request.mock.calls.length;
  language("pt-BR");
  expect(menu().querySelector('[role="menuitemcheckbox"]')).toBe(item);
  expect(item.textContent).toContain("Mostrar itens iniciados por ponto (.)");
  expect(item.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(item);
  expect(request).toHaveBeenCalledTimes(calls);
});
