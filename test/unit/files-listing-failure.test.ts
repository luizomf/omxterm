import { readFile } from "node:fs/promises";
import path from "node:path";
import { transformSync } from "esbuild";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => {
    window: { document: Document; close(): void };
  };
};
const dom = new JSDOM("<!doctype html><html><body></body></html>");
const document = dom.window.document;
afterAll(() => dom.window.close());

type View = {
  isDestroyed(): boolean;
  getURL(): string;
  executeJavaScript(script: string): Promise<unknown>;
};
async function observer(views: View[], paths: typeof path = path.posix) {
  const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
  const start = source.indexOf("async function diagnoseListing(");
  const end = source.indexOf("function assertNormalBackendRetirement(", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const create = new Function(
    "webContents",
    "path",
    `${source.slice(start, end)}; return diagnoseListing;`,
  ) as (
    contents: { getAllWebContents(): View[] },
    paths: typeof path,
  ) => (root: string) => Promise<{ hostedCount: number; views: unknown[] }>;
  return create({ getAllWebContents: () => views }, paths);
}
const evaluate = async (script: string): Promise<unknown> => {
  const run = new Function("document", `return (${script});`) as (
    document: Document,
  ) => unknown;
  return run(document);
};
const view: View = {
  isDestroyed: () => false,
  getURL: () => "omx-extension://fixture/index.html",
  executeJavaScript: evaluate,
};
afterEach(() => document.body.replaceChildren());

const pathCases = [
  {
    platform: "POSIX",
    paths: path.posix,
    root: "/fixture",
    home: "/fixture/home",
    ownedFiles: "/fixture/owned-files",
    outside: "/private/not-owned",
    evidence: "/evidence",
    receipt: "/evidence/listing-failure.json",
  },
  {
    platform: "Windows",
    paths: path.win32,
    root: "C:\\fixture",
    home: "C:\\fixture\\home",
    ownedFiles: "C:\\fixture\\owned-files",
    outside: "C:\\private\\not-owned",
    evidence: "C:\\evidence",
    receipt: "C:\\evidence\\listing-failure.json",
  },
] as const;

it.each(pathCases)(
  "$platform listing snapshot identifies owned directories without returning paths",
  async ({ paths, root, home, ownedFiles, outside }) => {
    document.body.innerHTML =
      '<form class="location"><input></form><div class="entries" role="tree" aria-busy="false"><div class="file-row"></div></div><p class="summary">1 visible entry</p>';
    document.querySelector("input")!.value = home;
    const diagnose = await observer(
      [
        view,
        { ...view, isDestroyed: () => true },
        { ...view, getURL: () => "file:///private/host/path" },
      ],
      paths,
    );
    const snapshot = await diagnose(root);
    expect(snapshot).toEqual({
      hostedCount: 1,
      views: [
        {
          locationPresent: true,
          role: "tree",
          busy: "false",
          summary: "1 visible entry",
          rowCount: 1,
          ownedDirectory: true,
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain(
      JSON.stringify(root).slice(1, -1),
    );
    for (const owned of [root, ownedFiles]) {
      document.querySelector("input")!.value = owned;
      expect((await diagnose(root)).views).toEqual([
        expect.objectContaining({ ownedDirectory: true }),
      ]);
    }
    document.querySelector("input")!.value = outside;
    document.querySelector(".summary")!.textContent =
      `Directory unavailable: ${outside}`;
    const redacted = await diagnose(root);
    expect(redacted.views).toEqual([
      expect.objectContaining({ ownedDirectory: false, summary: "[redacted]" }),
    ]);
    expect(JSON.stringify(redacted)).not.toContain(
      JSON.stringify(outside).slice(1, -1),
    );
  },
);

it("bounds view count/text and records destroyed-during-observation failure without native errors", async () => {
  document.body.innerHTML = '<p class="summary"></p>';
  document.querySelector(".summary")!.textContent = "x".repeat(1000);
  const unavailable = {
    ...view,
    executeJavaScript: async () => {
      throw Error("private /path");
    },
  };
  const diagnose = await observer([unavailable, ...Array<View>(9).fill(view)]);
  const result = await diagnose("/fixture");
  expect(result.hostedCount).toBe(10);
  expect(result.views).toHaveLength(8);
  expect(result.views[0]).toEqual({ snapshotError: "view-unavailable" });
  expect(result.views[1]).toMatchObject({
    summary: "x".repeat(256),
    rowCount: 0,
    ownedDirectory: false,
  });
  expect(JSON.stringify(result)).not.toContain("private");
});

type Client = {
  evaluate(expression: string, timeout: number): Promise<unknown>;
};
async function capture(
  write: (file: string, contents: string) => Promise<void>,
  paths: typeof path,
) {
  const source = await readFile(
    "test/integration/files-packaged.test.ts",
    "utf8",
  );
  const start = source.indexOf("async function captureListingFailure(");
  const end = source.indexOf("async function closeObserver(", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const code = transformSync(source.slice(start, end), { loader: "ts" }).code;
  const create = new Function(
    "writeFile",
    "path",
    `${code}; return captureListingFailure;`,
  ) as (
    writeFile: typeof write,
    paths: typeof path,
  ) => (
    client: Client | undefined,
    observer: string | undefined,
    root: string,
    evidence: string,
  ) => Promise<void>;
  return create(write, paths);
}

describe.each(pathCases)(
  "$platform failure capture",
  ({ paths, root, evidence, receipt }) => {
    it.each(["success", "inspector-failure", "write-failure"])(
      "preserves the primary outcome on %s",
      async (mode) => {
        const write = vi.fn(async () => {
          if (mode === "write-failure") throw Error("private /write/path");
        });
        const collect = await capture(write, paths);
        const client = {
          evaluate: vi.fn(async () => {
            if (mode === "inspector-failure")
              throw Error("private /inspector/path");
            return { hostedCount: 0, views: [] };
          }),
        };
        await expect(
          collect(client, "observer", root, evidence),
        ).resolves.toBeUndefined();
        expect(client.evaluate).toHaveBeenCalledWith(
          `observer.diagnoseListing(${JSON.stringify(root)})`,
          3000,
        );
        expect(write).toHaveBeenCalledWith(
          receipt,
          JSON.stringify(
            mode === "inspector-failure"
              ? { snapshotError: "observer-unavailable" }
              : { hostedCount: 0, views: [] },
            null,
            2,
          ),
        );
        client.evaluate.mockClear();
        await collect(undefined, "observer", root, evidence);
        await collect(client, undefined, root, evidence);
        expect(client.evaluate).not.toHaveBeenCalled();
      },
    );
  },
);
