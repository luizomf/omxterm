// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { FilesTreeEntry } from "../../extensions/files/tree";
import type { SupportedLanguage } from "../../src/shared/i18n";
type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
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
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup(initialLanguage: SupportedLanguage = "en-US") {
  const listings: Record<string, FilesTreeEntry[]> = {
    "/root": [folder("folder"), file("alpha"), file("beta")],
    "/root/folder": [file("child")],
    "/other": [file("elsewhere")],
  };
  let handler:
    ((value: Record<string, string>) => Promise<Reply> | undefined) | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const request = value as Record<string, string>;
    const custom = handler?.(request);
    if (custom) return custom;
    if (request.operation === "home") return { ok: true, directory: "/root" };
    if (request.operation === "list")
      return {
        ok: true,
        directory: request.path!,
        rows: listings[request.path!] ?? [],
        total: listings[request.path!]?.length ?? 0,
      };
    if (request.operation === "prepare-delete")
      return { ok: true, path: request.path!, token: "captured" };
    return { ok: true };
  });
  let visibility!: (visible: boolean) => void;
  let language!: (language: SupportedLanguage) => void;
  const unsubscribeLanguage = vi.fn();
  const page = mountFilesPage(document, {
    request,
    onLanguage(listener) {
      language = listener;
      listener(initialLanguage);
      return unsubscribeLanguage;
    },
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  return {
    request,
    listings,
    visibility,
    language,
    unsubscribeLanguage,
    handle(value: typeof handler) {
      handler = value;
    },
  };
}
function button(label: string, scope: ParentNode = document) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === label && !node.closest("[hidden]"),
  );
  expect(result, label).toBeTruthy();
  return result!;
}
const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>(".file-row")].find(
    (node) => node.dataset.path === path,
  )!;
const menu = () => document.querySelector<HTMLElement>(".file-menu")!;
function context(path?: string) {
  (path ? row(path) : document.querySelector(".entries")!).dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 30,
    }),
  );
}
function key(node: HTMLElement, value: string, shiftKey = false) {
  node.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: value,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function apply(value: string) {
  const form = document.querySelector<HTMLFormElement>(".operation-editor")!;
  form.querySelector("input")!.value = value;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
function navigate(path: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Directory"]',
  )!;
  input.value = path;
  input.form!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}
async function settled() {
  await vi.waitFor(() => {
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false");
    expect(
      document.querySelector<HTMLElement>(".operation-editor")!.inert,
    ).not.toBe(true);
  });
}

it.each(["file", "directory"])(
  "reconciles selected kind after refresh to %s without retargeting an open editor",
  async (kind) => {
    const { listings, request } = await setup();
    const target = kind === "file" ? "/root/folder" : "/root/alpha";
    context(target);
    button("Rename / move", menu()).click();
    listings["/root"] = [{ name: target.split("/").at(-1)!, kind, size: 0 }];
    button("Refresh").click();
    await settled();
    expect(row(target).getAttribute("aria-label")).toContain(kind);
    button("Actions…").click();
    expect(menu().textContent?.includes("Open directory")).toBe(
      kind === "directory",
    );
    key(document.activeElement as HTMLElement, "Tab");
    apply("/root/destination");
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        operation: "move",
        path: target,
        destination: "/root/destination",
      }),
    );
    await settled();
    button("Actions…").click();
    button("New file", menu()).click();
    expect(document.querySelector(".operation-editor label")?.textContent).toBe(
      `Create file in ${kind === "directory" ? target : "/root"}`,
    );
  },
);
it("closes transient menus on host hiding while retaining operation drafts", async () => {
  const { visibility } = await setup();
  context("/root/alpha");
  expect(menu().hidden).toBe(false);
  visibility(false);
  expect(menu().hidden).toBe(true);
  visibility(true);
  context("/root/alpha");
  button("Rename / move", menu()).click();
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  input.value = "/root/draft";
  visibility(false);
  visibility(true);
  expect(input.value).toBe("/root/draft");
  expect(document.querySelector<HTMLElement>(".operation-editor")!.hidden).toBe(
    false,
  );
  button("Cancel").click();
  expect(document.querySelector<HTMLElement>(".operation-editor")!.hidden).toBe(
    true,
  );
});

it("expands folders with keyboard, traverses rows and collapses without treating links as folders", async () => {
  await setup();
  row("/root/folder").focus();
  key(row("/root/folder"), "ArrowRight");
  await vi.waitFor(() => expect(row("/root/folder/child")).toBeTruthy());
  expect(row("/root/folder/child").getAttribute("aria-level")).toBe("2");
  key(row("/root/folder"), "ArrowDown");
  expect(document.activeElement).toBe(row("/root/folder/child"));
  key(row("/root/folder/child"), "ArrowLeft");
  expect(document.activeElement).toBe(row("/root/folder"));
  key(row("/root/folder"), "ArrowLeft");
  expect(row("/root/folder/child")).toBeUndefined();
});
it("offers item and background actions at the point of use, with keyboard dismissal", async () => {
  await setup();
  context("/root/alpha");
  expect(button("Rename / move", menu())).toBeTruthy();
  key(document.activeElement as HTMLElement, "End");
  expect(document.activeElement?.textContent).toBe("Use terminal directory");
  key(document.activeElement as HTMLElement, "Escape");
  expect(menu().hidden).toBe(true);
  expect(document.activeElement).toBe(row("/root/alpha"));
  context();
  expect(menu().textContent).not.toContain("Rename / move");
  expect(button("New file", menu())).toBeTruthy();
  key(document.activeElement as HTMLElement, "Escape");
  key(row("/root/beta"), "F10", true);
  expect(menu().hidden).toBe(false);
});
it("captures rename target across subsequent selection and automatically refreshes", async () => {
  const { request, listings } = await setup();
  context("/root/alpha");
  button("Rename / move", menu()).click();
  row("/root/beta").click();
  listings["/root"] = [file("renamed"), file("beta")];
  apply("/root/renamed");
  await vi.waitFor(() => expect(row("/root/renamed")).toBeTruthy());
  expect(request).toHaveBeenCalledWith({
    operation: "move",
    path: "/root/alpha",
    destination: "/root/renamed",
  });
  expect(row("/root/beta").getAttribute("aria-selected")).toBe("true");
  expect(document.body.textContent).not.toContain("Refresh to see");
});
it("creates in a nested file's parent and retains the expanded folder after success", async () => {
  const { request, listings } = await setup();
  key(row("/root/folder"), "ArrowRight");
  await vi.waitFor(() => expect(row("/root/folder/child")).toBeTruthy());
  context("/root/folder/child");
  button("New file", menu()).click();
  listings["/root/folder"]!.push(file("new"));
  apply("new");
  await vi.waitFor(() => expect(row("/root/folder/new")).toBeTruthy());
  expect(request).toHaveBeenCalledWith({
    operation: "create-file",
    path: "/root/folder/new",
  });
  expect(row("/root/folder").getAttribute("aria-expanded")).toBe("true");
});
it("does not jump back when a mutation finishes after navigation", async () => {
  const { handle, request } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "trash" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Move to Trash", menu()).click();
  navigate("/other");
  await vi.waitFor(() => expect(row("/other/elsewhere")).toBeTruthy());
  pending.resolve({ ok: true });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Operation completed."),
  );
  expect(row("/root/alpha")).toBeUndefined();
  expect(request.mock.calls.at(-1)?.[0]).toEqual({
    operation: "list",
    path: "/other",
  });
});
it.each(["conflict", "outcome-unknown"])(
  "preserves %s without retry or success refresh",
  async (error) => {
    const { handle, request } = await setup();
    handle((value) =>
      value.operation === "move"
        ? Promise.resolve({ ok: false, error })
        : undefined,
    );
    context("/root/alpha");
    button("Rename / move", menu()).click();
    apply("/root/beta");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        error === "conflict" ? "conflict" : "Outcome unknown",
      ),
    );
    expect(
      request.mock.calls.filter(
        ([value]) => (value as { operation: string }).operation === "move",
      ),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(
        ([value]) => (value as { operation: string }).operation === "list",
      ),
    ).toHaveLength(1);
  },
);
it("requires captured permanent-delete confirmation and refreshes deletion", async () => {
  const { request, listings } = await setup();
  context("/root/alpha");
  button("Delete permanently…", menu()).click();
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Permanently delete /root/alpha",
    ),
  );
  row("/root/beta").click();
  listings["/root"] = [file("beta")];
  button("Delete permanently").click();
  await vi.waitFor(() => expect(row("/root/alpha")).toBeUndefined());
  await settled();
  expect(request).toHaveBeenCalledWith({
    operation: "delete",
    token: "captured",
  });
});
it("cancels a late delete token when another editor replaces its request", async () => {
  const { handle, request } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-delete" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Delete permanently…", menu()).click();
  button("New folder").click();
  pending.resolve({ ok: true, path: "/root/alpha", token: "late" });
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "cancel-delete",
      token: "late",
    }),
  );
  expect(document.querySelector(".operation-editor")?.textContent).toContain(
    "Create folder",
  );
});
it.each([
  [0, "0 visible entries", "0 entrada visível"],
  [1, "1 visible entry", "1 entrada visível"],
  [2, "2 visible entries", "2 entradas visíveis"],
] as const)(
  "uses selected-language plural rules for %i entries",
  async (count, english, portuguese) => {
    const { language, listings, request } = await setup();
    listings["/root"] = Array.from({ length: count }, (_, index) =>
      file(`item-${index}`),
    );
    button("Refresh").click();
    await settled();
    expect(document.querySelector(".summary")?.textContent).toBe(english);
    const requests = request.mock.calls.length;
    language("pt-BR");
    expect(document.querySelector(".summary")?.textContent).toBe(portuguese);
    expect(request).toHaveBeenCalledTimes(requests);
  },
);

it("starts in Portuguese and relabels retained rows, menus and address drafts without requests", async () => {
  const { language, request } = await setup("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(button("Pasta pessoal")).toBeTruthy();
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-label"),
  ).toBe("Arquivos locais");
  const retainedRow = row("/root/folder");
  expect(retainedRow.getAttribute("aria-label")).toBe("folder, pasta");
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.value = "/unsubmitted/<literal>";
  address.focus();
  address.setSelectionRange(2, 8);
  const count = request.mock.calls.length;
  language("en-US");
  expect(address.value).toBe("/unsubmitted/<literal>");
  expect(address.selectionStart).toBe(2);
  expect(address.selectionEnd).toBe(8);
  expect(document.activeElement).toBe(address);
  expect(row("/root/folder")).toBe(retainedRow);
  expect(retainedRow.getAttribute("aria-label")).toBe("folder, directory");
  context("/root/alpha");
  const retainedAction = button("Rename / move", menu());
  retainedAction.focus();
  language("pt-BR");
  expect(button("Renomear / mover", menu())).toBe(retainedAction);
  expect(document.activeElement).toBe(retainedAction);
  expect(request).toHaveBeenCalledTimes(count);
});

it("preserves editor identity, caret and captured paths through live language changes", async () => {
  const { language, request } = await setup();
  context("/root/alpha");
  button("Rename / move", menu()).click();
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  input.value = "/root/<draft>";
  input.setSelectionRange(3, 7);
  row("/root/beta").click();
  input.focus();
  language("pt-BR");
  expect(document.querySelector(".operation-editor input")).toBe(input);
  expect(input.value).toBe("/root/<draft>");
  expect(input.selectionStart).toBe(3);
  expect(input.selectionEnd).toBe(7);
  expect(document.activeElement).toBe(input);
  expect(
    document.querySelector(".operation-editor label")?.textContent,
  ).toContain("Renomear / mover /root/alpha");
  apply(input.value);
  await settled();
  expect(request).toHaveBeenCalledWith({
    operation: "move",
    path: "/root/alpha",
    destination: "/root/<draft>",
  });
});

it("relabels pending and settled notices without repeating a mutation or refreshing on failure", async () => {
  const { language, handle, request } = await setup();
  const pending = deferred<Reply>();
  handle((value) => (value.operation === "move" ? pending.promise : undefined));
  context("/root/alpha");
  button("Rename / move", menu()).click();
  apply("/root/new");
  language("pt-BR");
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Operação em andamento…",
  );
  expect(document.querySelector<HTMLElement>(".operation-editor")!.inert).toBe(
    true,
  );
  pending.resolve({ ok: false, error: "outcome-unknown" });
  await settled();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "Resultado desconhecido",
  );
  language("en-US");
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "Outcome unknown",
  );
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "move",
    ),
  ).toHaveLength(1);
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "list",
    ),
  ).toHaveLength(1);
});

it("keeps a late and then visible delete confirmation bound to the same token", async () => {
  const { language, handle, request } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-delete" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Delete permanently…", menu()).click();
  language("pt-BR");
  pending.resolve({ ok: true, path: "/root/alpha", token: "original" });
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Excluir /root/alpha permanentemente?",
    ),
  );
  const confirm = button("Excluir permanentemente");
  row("/root/beta").click();
  confirm.focus();
  const count = request.mock.calls.length;
  language("en-US");
  expect(button("Delete permanently")).toBe(confirm);
  expect(document.activeElement).toBe(confirm);
  expect(request).toHaveBeenCalledTimes(count);
  confirm.click();
  await settled();
  expect(request).toHaveBeenCalledWith({
    operation: "delete",
    token: "original",
  });
  expect(
    request.mock.calls.filter(
      ([value]) =>
        (value as { operation: string }).operation === "prepare-delete",
    ),
  ).toHaveLength(1);
});

it("unsubscribes language at disposal and ignores a stale callback", async () => {
  const { language, unsubscribeLanguage } = await setup();
  dispose?.();
  language("pt-BR");
  expect(unsubscribeLanguage).toHaveBeenCalledTimes(1);
  expect(document.documentElement.lang).toBe("en-US");
  expect(button("New folder")).toBeTruthy();
});

it("reports a successful mutation separately from refresh failure", async () => {
  const { handle } = await setup();
  handle((value) =>
    value.operation === "list"
      ? Promise.resolve({ ok: false, error: "permission" })
      : undefined,
  );
  context("/root/alpha");
  button("Move to Trash", menu()).click();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Operation completed, but",
    ),
  );
  expect(document.querySelector(".summary")?.textContent).toContain(
    "permission",
  );
});
