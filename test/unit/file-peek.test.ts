import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { peekFile, textPreview } from "../../src/main/file-peek";
import { isFilePeek } from "../../src/shared/file-peek";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function folder() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-peek-"));
  roots.push(root);
  return root;
}

const dependencies = (home: string) => ({
  // The real temporary folder: the host's own path rules apply.
  platform: process.platform,
  // No PATH: no pdftoppm or pdfinfo, and an empty thumbnail cache.
  environment: { XDG_CACHE_HOME: path.join(home, "cache") },
  homeDirectory: home,
  decodeImage: vi.fn(() => ({
    width: 640,
    height: 480,
    png: new Uint8Array([137, 80, 78, 71]),
  })),
});

describe("file peek", () => {
  it("shows the first lines of text and nothing for binary data", () => {
    expect(textPreview(new TextEncoder().encode("a\n\tb\nc"), true)).toEqual({
      text: "a\n    b\nc",
      truncated: false,
    });
    expect(textPreview(new Uint8Array([1, 0, 2]), true)).toBeUndefined();
  });

  it("describes text files, images and folders and validates as a peek", async () => {
    const root = await folder();
    await writeFile(path.join(root, "notes.txt"), "hello\nworld\n");
    await writeFile(path.join(root, "photo.png"), new Uint8Array([1, 2, 3]));
    await mkdir(path.join(root, "My Folder"));
    await writeFile(path.join(root, "My Folder", "a.txt"), "");
    const deps = dependencies(root);

    const text = await peekFile(path.join(root, "notes.txt"), deps);
    expect(text).toMatchObject({ name: "notes.txt", kind: "text", size: 12 });
    expect(text?.text).toBe("hello\nworld\n");
    expect(isFilePeek(text)).toBe(true);

    const image = await peekFile(path.join(root, "photo.png"), deps);
    expect(image).toMatchObject({
      kind: "image",
      mime: "image/png",
      width: 640,
      height: 480,
      thumbnail: { mime: "image/png" },
    });
    expect(isFilePeek(image)).toBe(true);

    const directory = await peekFile(path.join(root, "My Folder"), deps);
    expect(directory).toMatchObject({
      kind: "directory",
      entries: ["a.txt"],
      entryCount: 1,
    });
  });

  it("reads nothing for relative or missing paths", async () => {
    const root = await folder();
    const deps = dependencies(root);
    expect(await peekFile("notes.txt", deps)).toBeUndefined();
    expect(
      await peekFile(path.join(root, "missing.pdf"), deps),
    ).toBeUndefined();
  });
});
