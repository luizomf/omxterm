import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareResttyRuntime } from "../../scripts/prepare-restty-runtime.mjs";
import history from "../fixtures/restty-runtime-history.json";

const dist = path.dirname(createRequire(import.meta.url).resolve("restty"));
const correctedDigest =
  "7cbe4d0fe281a9c221ee88342e7f76fd35f1f285fe5b7eace402c059772a44e7";

// Prepare only task-owned copies, including core and types: other fixtures may
// still be exercising the installed prior runtime during a correction review.
async function copyInputs(root: string) {
  const options = {
    runtimePath: path.join(root, "runtime.js"),
    corePath: path.join(root, "core.js"),
    eventTypesPath: path.join(root, "events.d.ts"),
    declarationRoot: path.join(root, "declarations"),
  };
  await Promise.all([
    cp(path.join(dist, "input"), path.join(options.declarationRoot, "input"), {
      recursive: true,
    }),
    cp(path.join(dist, "wasm"), path.join(options.declarationRoot, "wasm"), {
      recursive: true,
    }),
    copyFile(path.join(dist, "chunk-c0rcpsc5.js"), options.runtimePath),
    copyFile(path.join(dist, "chunk-6dxqza9q.js"), options.corePath),
    copyFile(
      path.join(dist, "runtime/core/runtime-events.d.ts"),
      options.eventTypesPath,
    ),
  ]);
  return options;
}

const seedRoot = await mkdtemp(path.join(tmpdir(), "omxterm-restty-seed-"));
let corrected: string;
try {
  const options = await copyInputs(seedRoot);
  await prepareResttyRuntime(options);
  corrected = readFileSync(options.runtimePath, "utf8");
} finally {
  await rm(seedRoot, { recursive: true, force: true });
}
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
      try {
        const options = await copyInputs(root);
        const { runtimePath } = options;
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
