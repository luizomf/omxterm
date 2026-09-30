import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareResttyRuntime } from "../../scripts/prepare-restty-runtime.mjs";
import history from "../fixtures/restty-runtime-history.json";

const dist = path.dirname(createRequire(import.meta.url).resolve("restty"));
const corrected = readFileSync(path.join(dist, "chunk-c0rcpsc5.js"), "utf8");
const correctedDigest =
  "3fb1a882bc75ee45e1f53370976d215bca7e1f7ba172696ee1985caa5e93d27b";
const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");

// Fixed reverse line deltas captured from the pre-refactor runtime history.
// Every reconstructed input is independently identified by its reviewed hash;
// this does not import correction arrays or derive expected bytes from them.
let lines = corrected.split("\n");
const states = [
  { name: "correctedDigest", sha256: correctedDigest, source: corrected },
];
for (const state of history) {
  for (const edit of state.edits)
    lines.splice(edit.start, edit.deleteCount, ...edit.lines);
  states.push({
    name: state.name,
    sha256: state.sha256,
    source: lines.join("\n"),
  });
}

describe("Restty installation history", () => {
  it.each(states)(
    "prepares $name to identical reviewed bytes, idempotently",
    async ({ sha256, source }) => {
      expect(digest(corrected)).toBe(correctedDigest);
      expect(digest(source)).toBe(sha256);
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-restty-history-"),
      );
      const runtimePath = path.join(root, "runtime.js");
      const options = {
        runtimePath,
        corePath: path.join(dist, "chunk-6dxqza9q.js"),
        eventTypesPath: path.join(dist, "runtime/core/runtime-events.d.ts"),
      };
      try {
        await writeFile(runtimePath, source);
        await prepareResttyRuntime(options);
        expect(await readFile(runtimePath, "utf8")).toBe(corrected);
        await prepareResttyRuntime(options);
        expect(await readFile(runtimePath, "utf8")).toBe(corrected);
        await writeFile(runtimePath, `${source}\n`);
        await expect(prepareResttyRuntime(options)).rejects.toThrow(
          /Unrecognized Restty runtime/u,
        );
        expect(await readFile(runtimePath, "utf8")).toBe(`${source}\n`);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
