// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";

type ArchiveFixture = {
  archive?: string;
  consumer070?: boolean;
  https?: boolean;
};
const readArchiveFile = (file: string, encoding?: "utf8") =>
  encoding ? readFile(file, encoding) : readFile(file);
type FixtureHash = (algorithm: string) => {
  update(data: Buffer): { digest(encoding: "hex"): string };
};
async function archiveResolver(hash: FixtureHash = createHash) {
  const entry = await readFile("test/fixtures/files-production.mjs", "utf8");
  const start = entry.indexOf("const manifest = JSON.parse(");
  const end = entry.indexOf("const require =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const consent = entry.slice(
    entry.indexOf("dialog.showMessageBox ="),
    entry.indexOf("const ready ="),
  );
  const resolveArchive = new Function(
    "context",
    `const {readFile, path, source, fixture, assert, createHash, prompt} = context;
     return (async () => {
       ${entry.slice(start, end)}
       if (prompt) { const dialog = {}; let approved = 0; ${consent}
         await dialog.showMessageBox({}, prompt); assert.equal(approved, 1); }
       return archivePath;
     })();`,
  ) as (context: unknown) => Promise<string>;
  return (
    fixture: ArchiveFixture = {},
    read = readArchiveFile,
    prompt?: { title: string; detail: string },
  ) =>
    resolveArchive({
      readFile: read,
      path,
      source: process.cwd(),
      fixture,
      assert,
      createHash: hash,
      prompt,
    });
}

it("selects the current source archive for both production installation paths", async () => {
  const resolveArchive = await archiveResolver();
  const entry = await readFile("test/fixtures/files-production.mjs", "utf8");
  const manifest = JSON.parse(
    await readFile("extensions/files/extension.json", "utf8"),
  ) as { version: string };
  await expect(resolveArchive()).resolves.toBe(
    path.join(
      process.cwd(),
      `dist/extensions/files-${manifest.version}.omxext`,
    ),
  );
  expect(entry).toContain("const archive = await readFile(archivePath)");
  expect(entry).toContain("filePaths: [archivePath]");
});

it.each([
  { consumer070: true, https: false },
  { consumer070: true, https: false, archive: "relative.omxext" },
  { consumer070: true, https: true, archive: "/prepared.omxext" },
])(
  "rejects invalid prepared archive options before reading bytes: %j",
  async (fixture) => {
    const resolveArchive = await archiveResolver();
    const read = vi.fn(readArchiveFile);
    await expect(resolveArchive(fixture, read)).rejects.toThrow();
    // Only the source manifest was read, never a bad archive selection.
    expect(read).toHaveBeenCalledTimes(1);
  },
);

it.each([1, 23256, 23285])(
  "rejects wrong prepared archive bytes (%s bytes)",
  async (size) => {
    const resolveArchive = await archiveResolver();
    const read = vi.fn(readArchiveFile);
    read.mockResolvedValueOnce('{"version":"0.7.0"}');
    read.mockResolvedValueOnce(Buffer.alloc(size));
    await expect(
      resolveArchive(
        { consumer070: true, https: false, archive: "/prepared.omxext" },
        read,
      ),
    ).rejects.toThrow();
    expect(read).toHaveBeenLastCalledWith("/prepared.omxext");
  },
);

it.each([
  [
    23256,
    "63c6567774ba297ef3a0a30f3895d76ca9157e7283551de8bd6c5dbbad8e79ce",
    true,
  ],
  [
    23285,
    "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    true,
  ],
  [
    23255,
    "63c6567774ba297ef3a0a30f3895d76ca9157e7283551de8bd6c5dbbad8e79ce",
    false,
  ],
  [
    23284,
    "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    false,
  ],
  [
    23256,
    "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    false,
  ],
  [
    23285,
    "63c6567774ba297ef3a0a30f3895d76ca9157e7283551de8bd6c5dbbad8e79ce",
    false,
  ],
] as const)(
  "checks exact prepared archive size/hash pair (%s, %s)",
  async (size, digest, accepted) => {
    const bytes = Buffer.alloc(size);
    const hash = vi.fn(() => ({
      update(value: Buffer) {
        expect(value).toBe(bytes);
        return { digest: () => digest };
      },
    }));
    const resolveArchive = await archiveResolver(hash);
    const read = vi.fn(readArchiveFile);
    read.mockResolvedValueOnce('{"version":"0.7.0"}');
    read.mockResolvedValueOnce(bytes);
    const result = resolveArchive(
      { consumer070: true, https: false, archive: "/prepared.omxext" },
      read,
      accepted
        ? {
            title: "Trust extension code?",
            detail: `SHA-256: ${digest}\nnetwork Third-party`,
          }
        : undefined,
    );
    if (accepted) {
      await expect(result).resolves.toBe("/prepared.omxext");
      expect(hash).toHaveBeenCalledWith("sha256");
    } else await expect(result).rejects.toThrow();
  },
);

it("rejects unavailable fixture controls instead of reporting an ignored click as admission", async () => {
  const source = await readFile("test/fixtures/files-production.mjs", "utf8");
  const start = source.indexOf("  function click(contents, label)");
  const end = source.indexOf("  const hosted", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  type Contents = { executeJavaScript(script: string): Promise<unknown> };
  const createClick = new Function(
    `return (${source.slice(start, end)})`,
  ) as () => (contents: Contents, label: string) => Promise<unknown>;
  const click = createClick();
  const contents: Contents = {
    executeJavaScript: async (script) => {
      const evaluate = new Function("document", `return (${script})`) as (
        document: Document,
      ) => unknown;
      return evaluate(document);
    },
  };
  const panel = document.createElement("section");
  const button = document.createElement("button");
  const invoked = vi.fn<() => void>();
  button.textContent = "Disable";
  button.onclick = invoked;
  panel.append(button);
  document.body.append(panel);
  try {
    button.disabled = true;
    await expect(click(contents, "Disable")).rejects.toThrow(
      "button unavailable",
    );
    button.disabled = false;
    panel.setAttribute("inert", "");
    await expect(click(contents, "Disable")).rejects.toThrow(
      "button unavailable",
    );
    expect(invoked).not.toHaveBeenCalled();
    panel.removeAttribute("inert");
    await click(contents, "Disable");
    expect(invoked).toHaveBeenCalledOnce();
  } finally {
    panel.remove();
  }
});

it("releases the actual fixture entry module before Electron can satisfy window readiness", async () => {
  const source = await readFile("test/fixtures/files-production.mjs", "utf8");
  // Exercise the real entry coordination after the finite production import,
  // without importing Electron, starting a window or running the scenario.
  const boundary =
    'await import(pathToFileURL(path.join(source, "dist/main/index.js")).href);';
  const pieces = source.split(boundary);
  expect(pieces).toHaveLength(2);
  const entry = "const ready = new Promise(() => {});\n" + pieces[1]!;
  const url =
    "data:text/javascript;base64," + Buffer.from(entry).toString("base64");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      import(/* @vite-ignore */ url).then(() => "entry-released"),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("blocked-on-readiness"), 500);
      }),
    ]);
    expect(result).toBe("entry-released");
  } finally {
    clearTimeout(timer);
  }
});
