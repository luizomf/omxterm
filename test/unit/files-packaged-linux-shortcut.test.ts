// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
const require = createRequire(path.resolve("test/fixtures/files-packaged.cjs"));
const observer = {
  exports: {} as {
    dispatchLinuxFilesShortcut: (document: Document, path: string) => boolean;
    focusLinuxFilesRow: (document: Document, path: string) => boolean;
  },
};
runInNewContext(source, {
  module: observer,
  require: (name: string): unknown =>
    name === "electron" ? {} : (require(name) as unknown),
});
const shortcut = observer.exports.dispatchLinuxFilesShortcut;
const focusRow = observer.exports.focusLinuxFilesRow;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function page() {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux aarch64");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const page = mountFilesPage(document, {
    request: async (value) => {
      const operation = (value as { operation: string }).operation;
      if (operation === "home") return { ok: true, directory: "/fixture" };
      if (operation === "list")
        return {
          ok: true,
          directory: "/fixture",
          rows: [
            { name: "source.txt", kind: "file", size: 1 },
            { name: ".release-dotfile", kind: "file", size: 1 },
          ],
        };
      return { ok: true };
    },
  });
  dispose = page.dispose;
  await page.ready;
}

it("toggles the owned dotfile without losing the focused row or address draft", async () => {
  await page();
  const address = document.querySelector<HTMLInputElement>(
    "form.location input",
  )!;
  address.value = "unsubmitted address";
  address.setSelectionRange(2, 8, "backward");
  expect(focusRow(document, "/fixture/source.txt")).toBe(true);
  const hidden = () =>
    document.querySelector('[data-path="/fixture/.release-dotfile"]');
  expect(hidden()).toBeNull();
  expect(shortcut(document, "/fixture/source.txt")).toBe(true);
  expect(hidden()).not.toBeNull();
  expect((document.activeElement as HTMLElement).dataset.path).toBe(
    "/fixture/source.txt",
  );
  expect(shortcut(document, "/fixture/source.txt")).toBe(true);
  expect(hidden()).toBeNull();
  expect((document.activeElement as HTMLElement).dataset.path).toBe(
    "/fixture/source.txt",
  );
  expect([
    address.value,
    address.selectionStart,
    address.selectionEnd,
    address.selectionDirection,
  ]).toEqual(["unsubmitted address", 2, 8, "backward"]);
});

it.each(["no-document-focus", "missing", "duplicate", "hidden"])(
  "refuses to select the Files row when %s",
  async (fault) => {
    await page();
    const row = document.querySelector<HTMLElement>(
      '[data-path="/fixture/source.txt"]',
    )!;
    if (fault === "no-document-focus")
      vi.mocked(document.hasFocus).mockReturnValue(false);
    if (fault === "missing") row.remove();
    if (fault === "duplicate") row.after(row.cloneNode(true));
    if (fault === "hidden") row.hidden = true;
    expect(() => focusRow(document, "/fixture/source.txt")).toThrow(
      "Files tree",
    );
  },
);

it.each(["no-document-focus", "wrong-platform", "editor-open", "wrong-row"])(
  "refuses the synthetic shortcut when %s",
  async (fault) => {
    await page();
    document
      .querySelector<HTMLElement>('[data-path="/fixture/source.txt"]')!
      .focus();
    if (fault === "no-document-focus")
      vi.mocked(document.hasFocus).mockReturnValue(false);
    if (fault === "wrong-platform")
      vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    if (fault === "editor-open")
      document.querySelector<HTMLElement>(".operation-editor")!.hidden = false;
    expect(() =>
      shortcut(
        document,
        fault === "wrong-row" ? "/fixture/other" : "/fixture/source.txt",
      ),
    ).toThrow("Files shortcut");
    expect(
      document.querySelector('[data-path="/fixture/.release-dotfile"]'),
    ).toBeNull();
  },
);

it("refuses a shortcut when focus is in the address field rather than the owned tree row", async () => {
  await page();
  document.querySelector<HTMLInputElement>("form.location input")!.focus();
  expect(() => shortcut(document, "/fixture/source.txt")).toThrow(
    "Files shortcut focus",
  );
});
