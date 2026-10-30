// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { FilesTreeEntry } from "../../extensions/files/tree";
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
async function setup() {
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
  const page = mountFilesPage(document, { request });
  dispose = page.dispose;
  await page.ready;
  return {
    request,
    listings,
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
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
}

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
