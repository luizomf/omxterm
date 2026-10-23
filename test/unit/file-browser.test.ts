import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileBrowser } from "../../src/main/file-browser";
import {
  changeDirectoryCommand,
  isFileName,
  isFilePath,
  quotePathForShell,
} from "../../src/shared/file-browser";
import { createDirectoryTracker } from "../../src/renderer/files/directory-tracker";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-files-"));
  roots.push(root);
  const trash = vi.fn(async (target: string) => {
    await rm(target, { recursive: true });
  });
  const browser = createFileBrowser({
    platform: process.platform,
    hostname: "workstation",
    trash,
  });
  return { root, browser, trash };
}

describe.skipIf(process.platform === "win32")("local file browser", () => {
  it("lists entries with kinds, sizes and modes", async () => {
    const { root, browser } = await setup();
    await mkdir(path.join(root, "folder"));
    await writeFile(path.join(root, "file.txt"), "12345");
    await symlink(path.join(root, "folder"), path.join(root, "link"));
    await symlink(path.join(root, "gone"), path.join(root, "broken"));
    const listing = await browser.list(root);
    expect(listing.path).toBe(root);
    expect(listing.parent).toBe(path.dirname(root));
    const byName = Object.fromEntries(
      listing.entries.map((entry) => [entry.name, entry]),
    );
    expect(byName.folder).toMatchObject({ kind: "directory" });
    expect(byName["file.txt"]).toMatchObject({ kind: "file", size: 5 });
    expect(byName["file.txt"]!.mode).toMatch(/^[r-][w-][x-]{1}/u);
    expect(byName.link).toMatchObject({
      kind: "symlink",
      targetKind: "directory",
    });
    expect(byName.broken).toMatchObject({ targetKind: "missing" });
    expect((await browser.list("/")).parent).toBeUndefined();
    await expect(browser.list("relative/path")).rejects.toThrow(TypeError);
  });

  it("resolves only local OSC 7 directories", async () => {
    const { root, browser } = await setup();
    await mkdir(path.join(root, "with space"));
    const uri = pathToFileURL(path.join(root, "with space")).href;
    expect(await browser.resolve(uri)).toBe(path.join(root, "with space"));
    const hosted = uri.replace("file://", "file://Workstation");
    expect(await browser.resolve(hosted)).toBe(path.join(root, "with space"));
    expect(
      await browser.resolve(uri.replace("file://", "file://server")),
    ).toBeUndefined();
    expect(await browser.resolve("https://example.com/")).toBeUndefined();
    expect(await browser.resolve(pathToFileURL(root).href + "/missing")).toBe(
      undefined,
    );
  });

  it("creates, renames, copies and moves without replacing anything", async () => {
    const { root, browser } = await setup();
    expect(await browser.createFolder(root, "a")).toEqual({
      ok: true,
      path: path.join(root, "a"),
    });
    expect(await browser.createFolder(root, "a")).toEqual({
      ok: false,
      error: "An item with that name already exists.",
    });
    await browser.createFile(root, "note.txt");
    expect((await browser.createFile(root, "note.txt")).ok).toBe(false);
    await writeFile(path.join(root, "note.txt"), "keep");
    await browser.createFile(root, "other.txt");
    expect(
      (await browser.rename(path.join(root, "other.txt"), "note.txt")).ok,
    ).toBe(false);
    expect(await readFile(path.join(root, "note.txt"), "utf8")).toBe("keep");
    expect(
      await browser.rename(path.join(root, "other.txt"), "renamed.txt"),
    ).toEqual({ ok: true, path: path.join(root, "renamed.txt") });

    await browser.transfer(
      "copy",
      [path.join(root, "note.txt")],
      path.join(root, "a"),
    );
    expect(await readFile(path.join(root, "a", "note.txt"), "utf8")).toBe(
      "keep",
    );
    expect(
      (
        await browser.transfer(
          "copy",
          [path.join(root, "note.txt")],
          path.join(root, "a"),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await browser.transfer(
          "move",
          [path.join(root, "note.txt")],
          path.join(root, "a"),
        )
      ).ok,
    ).toBe(false);
    await browser.transfer(
      "move",
      [path.join(root, "renamed.txt")],
      path.join(root, "a"),
    );
    expect(
      (await browser.list(path.join(root, "a"))).entries
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(["note.txt", "renamed.txt"]);
  });

  it("moves items to the trash instead of deleting them", async () => {
    const { root, browser, trash } = await setup();
    await writeFile(path.join(root, "x"), "");
    expect(await browser.trash([path.join(root, "x")])).toEqual({ ok: true });
    expect(trash).toHaveBeenCalledWith(path.join(root, "x"));
    expect((await browser.trash([path.join(root, "x")])).ok).toBe(false);
  });
});

describe("file names and shell quoting", () => {
  it("accepts single path components only", () => {
    for (const name of ["notes.txt", "Área de trabalho", ".config", "a b"])
      expect(isFileName(name), name).toBe(true);
    for (const name of [
      "",
      ".",
      "..",
      "a/b",
      "a\\b",
      "con:",
      "a\nb",
      " leading",
      "x".repeat(256),
    ])
      expect(isFileName(name), JSON.stringify(name)).toBe(false);
    expect(isFilePath("/tmp/a\0b")).toBe(false);
  });

  it("types paths as single literal arguments", () => {
    expect(quotePathForShell("/tmp/it's here", "linux")).toBe(
      `'/tmp/it'\\''s here'`,
    );
    expect(changeDirectoryCommand("/tmp/$(rm -rf ~)", "darwin")).toBe(
      "cd -- '/tmp/$(rm -rf ~)'",
    );
    expect(changeDirectoryCommand("C:\\Users\\O'Brien", "win32")).toBe(
      "Set-Location -LiteralPath 'C:\\Users\\O''Brien'",
    );
  });
});

describe("directory tracker", () => {
  it("follows the focused pane's reported directory", () => {
    let focused: string | undefined;
    const tracker = createDirectoryTracker(() => focused);
    const listener = vi.fn();
    tracker.subscribe(listener);
    tracker.report("s1", "file:///a");
    expect(listener).not.toHaveBeenCalled();
    focused = "s1";
    expect(tracker.current()).toBe("file:///a");
    tracker.report("s1", "file:///b");
    expect(listener).toHaveBeenLastCalledWith("file:///b");
    tracker.report("s2", "file:///c");
    expect(listener).toHaveBeenCalledTimes(1);
    focused = undefined;
    tracker.focus("s2");
    expect(listener).toHaveBeenLastCalledWith("file:///c");
  });
});
