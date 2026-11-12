// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import {
  inside,
  isRoot,
  join,
  parent,
  validName,
} from "../../extensions/files/paths";

// The Windows backend reports native drive paths; the view must browse them
// like POSIX paths, without assuming "/" separators or a "/" root.
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it.each([
  ["/", "a", "/a"],
  ["/home/me", "a", "/home/me/a"],
  ["C:\\", "a", "C:\\a"],
  ["C:\\Users\\me", "a", "C:\\Users\\me\\a"],
  ["\\\\server\\share\\", "a", "\\\\server\\share\\a"],
  ["\\\\server\\share", "a", "\\\\server\\share\\a"],
  ["\\\\server\\share\\docs", "a", "\\\\server\\share\\docs\\a"],
])("joins %j and %j", (base, name, expected) => {
  expect(join(base, name)).toBe(expected);
});

it.each([
  ["/home/me", "/home"],
  ["/home", "/"],
  ["/", "/"],
  ["/name\\with\\backslashes", "/"],
  ["C:\\Users\\me", "C:\\Users"],
  ["C:\\Users", "C:\\"],
  ["C:/Users", "C:/"],
  ["C:\\", "C:\\"],
  ["\\\\server\\share\\docs", "\\\\server\\share\\"],
  ["\\\\server\\share\\", "\\\\server\\share\\"],
])("finds the parent of %j", (path, expected) => {
  expect(parent(path)).toBe(expected);
});

it("tells roots, descendants and valid names apart per path style", () => {
  expect(isRoot("/")).toBe(true);
  expect(isRoot("D:\\")).toBe(true);
  expect(isRoot("D:\\x")).toBe(false);
  expect(inside("C:\\a\\b\\c", "C:\\a")).toBe(true);
  expect(inside("C:\\ab", "C:\\a")).toBe(false);
  expect(inside("C:\\a", "C:\\a")).toBe(false);
  expect(inside("/a/b", "/")).toBe(true);
  expect(validName("a\\b", "/home")).toBe(true);
  expect(validName("a\\b", "C:\\Users")).toBe(false);
  expect(validName("a/b", "C:\\Users")).toBe(false);
  expect(validName("..", "C:\\Users")).toBe(false);
  expect(isRoot("\\\\server\\share\\")).toBe(true);
  expect(isRoot("\\\\server\\share")).toBe(true);
  for (const name of [
    "a:stream",
    "a?",
    "a*",
    'a"',
    "a<",
    "a>",
    "a|",
    "a.",
    "a ",
    "CON",
    "nul.txt",
    "Com1",
    "lpt9.log",
    "aux .txt",
  ])
    expect(validName(name, "C:\\Users"), name).toBe(false);
  for (const name of ["console.txt", "com10", "nullable", "CON"])
    expect(validName(name, name === "CON" ? "/home" : "C:\\Users"), name).toBe(
      true,
    );
  expect(validName("a:b.", "/home")).toBe(true);
  expect(validName("a:b", "\\\\server\\share\\")).toBe(false);
  expect(validName("report.v2.txt", "C:\\Users")).toBe(true);
});

it("browses Windows drive paths up to the drive root", async () => {
  const listings: Record<string, string[]> = {
    "C:\\Users\\me": ["notes.txt"],
    "C:\\Users": ["me"],
    "C:\\": ["Users"],
  };
  const request = vi.fn(async (value: unknown) => {
    const request = value as Record<string, string>;
    if (request.operation === "home")
      return { ok: true, directory: "C:\\Users\\me" };
    if (request.operation === "list")
      return {
        ok: true,
        directory: request.path!,
        rows: (listings[request.path!] ?? []).map((name) => ({
          name,
          kind: name.includes(".") ? "file" : "directory",
          size: 0,
        })),
        total: listings[request.path!]?.length ?? 0,
      };
    return { ok: true };
  });
  const page = mountFilesPage(document, {
    request,
    onLanguage(listener) {
      listener("en-US");
      return () => {};
    },
    onVisibility(listener) {
      listener(true);
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  const rows = () =>
    [...document.querySelectorAll<HTMLElement>(".file-row")].map(
      (row) => row.dataset.path,
    );
  const up = [...document.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Up",
  )!;
  await vi.waitFor(() => expect(rows()).toEqual(["C:\\Users\\me\\notes.txt"]));
  up.click();
  await vi.waitFor(() => expect(rows()).toEqual(["C:\\Users\\me"]));
  up.click();
  await vi.waitFor(() => expect(rows()).toEqual(["C:\\Users"]));
  expect(up.getAttribute("aria-disabled")).toBe("true");
  up.click();
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "list",
    ),
  ).toHaveLength(3);
});
