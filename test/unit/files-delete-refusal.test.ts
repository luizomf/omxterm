// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it.each([
  ["changed-entry", "The entry changed. Start the delete again."],
  ["expired-confirmation", "The delete confirmation expired. Start again."],
])("explains a refused permanent delete (%s)", async (error, text) => {
  const page = mountFilesPage(document, {
    request: async (value) => {
      const { operation, path } = value as { operation: string; path: string };
      if (operation === "home") return { ok: true, directory: "/root" };
      if (operation === "prepare-delete")
        return { ok: true, path, token: "captured" };
      if (operation === "delete") return { ok: false, error };
      return {
        ok: true,
        directory: "/root",
        rows: [{ name: "alpha", kind: "file" as const, size: 1 }],
        total: 1,
      };
    },
    onLanguage(listener) {
      listener("en-US");
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  const press = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (node) =>
          (node.getAttribute("aria-label") === label ||
            node.textContent === label) &&
          !node.closest("[hidden]"),
      )!
      .click();
  document
    .querySelector<HTMLElement>('.file-row[data-path="/root/alpha"]')!
    .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  press("Delete permanently…");
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Permanently delete /root/alpha",
    ),
  );
  press("Delete permanently");
  await vi.waitFor(() => expect(document.body.textContent).toContain(text));
  expect(document.body.textContent).not.toContain("Operation not completed");
});
