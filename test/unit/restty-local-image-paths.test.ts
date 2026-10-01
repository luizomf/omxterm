import path from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { localImageFixturePaths } from "../fixtures/restty-local-image-paths";

it("builds genuinely wrapped image references with filesystem-safe components on a wide grid", () => {
  const paths = localImageFixturePaths(
    "/tmp/omxterm-restty-host-7R1VNd",
    430,
    32,
    path.posix,
  );
  for (const value of Object.values(paths)) {
    for (const component of value.split("/"))
      expect(Buffer.byteLength(component)).toBeLessThanOrEqual(255);
  }
  expect(paths.longPath.length).toBeGreaterThan(430);
  expect(paths.boundaryPath.length).toBeGreaterThan(430);
  expect(paths.boundaryPath.indexOf(" ") % 430).toBe(429);
});

for (const [paths, root, rootColumns] of [
  [path.posix, "/tmp/漢e\u0301", 9],
  [path.posix, "/", 1],
  [path.win32, "C:\\tmp\\漢e\u0301", 11],
  [path.win32, "C:/tmp/漢e\u0301/", 11],
  [path.win32, "C:\\", 3],
] as const) {
  it(`keeps the real space boundary and complete reference for ${root}`, () => {
    for (const cols of [20, 40, 80, 132, 256, 430, 512]) {
      const result = localImageFixturePaths(root, cols, rootColumns, paths);
      const cells = (text: string) =>
        [...text].reduce(
          (count, char) =>
            count + (char === "漢" ? 2 : char === "\u0301" ? 0 : 1),
          0,
        );
      expect(cells(result.longPath)).toBeGreaterThan(cols);
      expect(cells(result.boundaryPath)).toBeGreaterThan(cols);
      expect(
        cells(
          result.boundaryPath.slice(0, result.boundaryPath.lastIndexOf(" ")),
        ) % cols,
      ).toBe(cols - 1);
      expect(paths.basename(result.longPath)).toBe("a photo.png");
      expect(result.boundaryPath.endsWith(" photo.png")).toBe(true);
      for (const value of Object.values(result)) {
        expect(paths.isAbsolute(value)).toBe(true);
        expect(paths.normalize(value)).toBe(value);
        for (const part of value
          .slice(paths.parse(value).root.length)
          .split(paths.sep))
          expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(255);
      }
    }
  });
}

it("rejects a root component that exceeds the byte limit even when its code-unit length fits", () => {
  expect(() =>
    localImageFixturePaths(`/tmp/${"漢".repeat(100)}`, 430, 206, path.posix),
  ).toThrow("fixture root component exceeds NAME_MAX");
});

it("materializes and reads the complete wide-grid destination without filesystem truncation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-image-path-"));
  try {
    const result = localImageFixturePaths(root, 430, root.length + 1);
    for (const value of Object.values(result)) {
      await mkdir(path.dirname(value), { recursive: true });
      await writeFile(value, "fixture image bytes");
      expect(await readFile(value, "utf8")).toBe("fixture image bytes");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
