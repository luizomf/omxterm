// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;

it("waits for the fresh visible confirmation rather than cancelled editor text", async () => {
  const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
  const start = source.indexOf("function deleteConfirmationReady(document)");
  const end = source.indexOf("\nasync function run(options)", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const createReady = new Function(
    `return (${source.slice(start, end)});`,
  ) as () => (document: Document) => boolean;
  const ready = createReady();
  let prepares = 0;
  let resolve!: (reply: Reply) => void;
  const pending = new Promise<Reply>((done) => {
    resolve = done;
  });
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as { operation: string; path?: string };
    if (input.operation === "home") return { ok: true, directory: "/owned" };
    if (input.operation === "list")
      return {
        ok: true,
        directory: "/owned",
        rows: [{ name: "owned.txt", kind: "file", size: 1 }],
        total: 1,
      };
    if (input.operation === "prepare-delete") {
      prepares++;
      return prepares === 1
        ? { ok: true, path: input.path!, token: "first" }
        : pending;
    }
    return { ok: true };
  });
  const page = mountFilesPage(document, { request });
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) =>
        node.textContent === label && !node.closest("[hidden], [inert]"),
    )!;
  const prepare = () => {
    document
      .querySelector(".file-row")!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    button("Delete permanently…").click();
  };
  try {
    await page.ready;
    prepare();
    await vi.waitFor(() => expect(ready(document)).toBe(true));
    button("Cancel").click();
    prepare();
    await vi.waitFor(() => expect(prepares).toBe(2));
    expect(document.querySelector(".operation-editor")!.textContent).toContain(
      "cannot be undone",
    );
    expect(ready(document)).toBe(false);
    expect(button("Delete permanently")).toBeUndefined();
    resolve({ ok: true, path: "/owned/owned.txt", token: "second" });
    await vi.waitFor(() => expect(ready(document)).toBe(true));
    const editor = document.querySelector<HTMLElement>(".operation-editor")!;
    editor.setAttribute("inert", "");
    expect(ready(document)).toBe(false);
    editor.removeAttribute("inert");
    const confirm = button("Delete permanently");
    confirm.disabled = true;
    expect(ready(document)).toBe(false);
    confirm.disabled = false;
    confirm.click();
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        operation: "delete",
        token: "second",
      }),
    );
  } finally {
    page.dispose();
    document.body.replaceChildren();
  }
});
