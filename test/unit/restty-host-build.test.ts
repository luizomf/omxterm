import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";
import { buildHostFixture } from "../fixtures/restty-host-build";

vi.mock("esbuild", () => ({ build: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, symlink: vi.fn(actual.symlink) };
});

it.each([
  { scenario: "broad host", options: {} },
  { scenario: "focused cancellation", options: { focusedCancellation: true } },
  {
    scenario: "pointercancel mutant",
    options: {
      focusedCancellation: true,
      cancellation: "pointercancel" as const,
    },
  },
  {
    scenario: "blur mutant",
    options: { focusedCancellation: true, cancellation: "blur" as const },
  },
])(
  "settles late $scenario builders before failed preparation allows profile cleanup",
  async ({ options }) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-host-build-"));
    const release = deferred();
    const failed = deferred();
    const cleaned = deferred();
    const writers: Promise<unknown>[] = [];
    let originalFailure: unknown;
    let cleanupStarted = false;
    let preparation: Promise<unknown> | undefined;
    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    try {
      // A real filesystem failure at the same symlink prerequisite as Windows,
      // without requiring a platform permission change.
      await mkdir(path.join(root, "node_modules"));
      vi.mocked(symlink).mockImplementationOnce(async (...args) => {
        try {
          await actualFs.symlink(...args);
        } catch (error) {
          originalFailure = error;
          failed.resolve();
          throw error;
        }
      });
      vi.mocked(build).mockImplementation((options) => {
        const outfile = options.outfile!;
        const writer = (async () => {
          await release.promise;
          await mkdir(path.dirname(outfile), { recursive: true });
          await writeFile(outfile, "late build output\n");
          // A later failure must not replace the original symlink diagnostic.
          if (path.basename(outfile) === "index.js")
            throw new Error("Late renderer build failure");
          return {} as Awaited<ReturnType<typeof build>>;
        })();
        writers.push(writer);
        return writer;
      });
      preparation = (async () => {
        try {
          await buildHostFixture(root, options);
        } catch (error) {
          return error;
        } finally {
          cleanupStarted = true;
          await rm(root, { recursive: true, force: true });
          cleaned.resolve();
        }
      })();
      await failed.promise;
      // Flush the rejection continuation, not a wall-clock build delay.
      await setImmediate();
      const cleanedBeforeBuildersSettled = cleanupStarted;
      if (cleanupStarted) await cleaned.promise;
      expect(writers).toHaveLength(3);
      release.resolve();
      const settled = await Promise.allSettled(writers);
      expect(settled.map(({ status }) => status)).toEqual([
        "fulfilled",
        "fulfilled",
        "rejected",
      ]);
      const failure = await preparation;

      expect(failure).toBe(originalFailure);
      expect(failure).toMatchObject({ code: "EEXIST" });
      expect(
        existsSync(root),
        "late builders recreated the removed profile",
      ).toBe(false);
      expect(cleanedBeforeBuildersSettled).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled(writers);
      await preparation;
      await rm(root, { recursive: true, force: true });
      vi.mocked(build).mockReset();
      vi.mocked(symlink).mockReset();
    }
  },
);

it("settles started host builders when a sibling throws during preparation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-host-build-"));
  const release = deferred();
  const failed = deferred();
  const cleaned = deferred();
  const originalFailure = new Error("Synchronous preload build failure");
  const writers: Promise<unknown>[] = [];
  let cleanupStarted = false;
  let preparation: Promise<unknown> | undefined;
  const actualFs =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  vi.mocked(symlink).mockImplementation(actualFs.symlink);
  vi.mocked(build).mockImplementation((options) => {
    const outfile = options.outfile!;
    if (path.basename(outfile) === "preload.cjs") {
      failed.resolve();
      throw originalFailure;
    }
    const writer = (async () => {
      await release.promise;
      await mkdir(path.dirname(outfile), { recursive: true });
      await writeFile(outfile, "late build output\n");
      return {} as Awaited<ReturnType<typeof build>>;
    })();
    writers.push(writer);
    return writer;
  });
  try {
    preparation = (async () => {
      try {
        await buildHostFixture(root, { focusedCancellation: true });
      } catch (error) {
        return error;
      } finally {
        cleanupStarted = true;
        await rm(root, { recursive: true, force: true });
        cleaned.resolve();
      }
    })();
    await failed.promise;
    await setImmediate();
    const cleanedBeforeBuildersSettled = cleanupStarted;
    if (cleanupStarted) await cleaned.promise;
    release.resolve();
    await Promise.all(writers);
    expect(await preparation).toBe(originalFailure);
    expect(
      existsSync(root),
      "late builders recreated the removed profile",
    ).toBe(false);
    expect(cleanedBeforeBuildersSettled).toBe(false);
  } finally {
    release.resolve();
    await Promise.allSettled(writers);
    await preparation;
    await rm(root, { recursive: true, force: true });
    vi.mocked(build).mockReset();
    vi.mocked(symlink).mockReset();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
