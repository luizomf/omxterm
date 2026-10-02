import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";
import { buildFixture } from "../fixtures/pending-tab-ownership-build";
import { buildFixture as buildBackgroundFixture } from "../fixtures/restty-background-rendering-build";
import { buildFixture as buildWindowFixture } from "../fixtures/window-chrome-build";

vi.mock("esbuild", () => ({ build: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, symlink: vi.fn(actual.symlink) };
});

it("joins late pending-tab writers before the original prerequisite failure allows caller cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-preparation-test-"));
  const release = deferred();
  const failed = deferred();
  const cleaned = deferred();
  const writers: Promise<unknown>[] = [];
  let originalFailure: unknown;
  let cleanupStarted = false;
  let preparation: Promise<unknown> | undefined;
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  try {
    await mkdir(path.join(root, "node_modules"));
    vi.mocked(symlink).mockImplementationOnce(async (...args) => {
      try {
        await actual.symlink(...args);
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
        await writeFile(outfile, "late real build output\n");
        if (path.basename(outfile) === "index.js")
          throw new Error("Later renderer failure");
        return {} as Awaited<ReturnType<typeof build>>;
      })();
      writers.push(writer);
      return writer;
    });
    preparation = (async () => {
      try {
        await buildFixture(root);
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
    const earlyCleanup = cleanupStarted;
    if (earlyCleanup) await cleaned.promise;
    expect(writers).toHaveLength(3);
    release.resolve();
    await Promise.allSettled(writers);
    expect(await preparation).toBe(originalFailure);
    expect(originalFailure).toMatchObject({ code: "EEXIST" });
    expect(existsSync(root), "late writers recreated the removed profile").toBe(
      false,
    );
    expect(earlyCleanup).toBe(false);
  } finally {
    release.resolve();
    await Promise.allSettled(writers);
    await preparation;
    await rm(root, { recursive: true, force: true });
    vi.mocked(build).mockReset();
    vi.mocked(symlink).mockReset();
  }
});

it("removes a background root when preparation fails before supervisor ownership", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-preparation-gap-"));
  const originalFailure = new Error("Main build failed before launch");
  const writers: Promise<unknown>[] = [];
  vi.mocked(build).mockImplementation((options) => {
    const writer = (async () => {
      if (path.basename(options.outfile!) === "main.cjs") throw originalFailure;
      await writeFile(options.outfile!, "real renderer output\n");
      return {} as Awaited<ReturnType<typeof build>>;
    })();
    writers.push(writer);
    return writer;
  });
  try {
    await expect(buildBackgroundFixture(root)).rejects.toBe(originalFailure);
    await Promise.allSettled(writers);
    expect(
      existsSync(root),
      "failed preparation retained its unlaunched profile",
    ).toBe(false);
  } finally {
    await Promise.allSettled(writers);
    await rm(root, { recursive: true, force: true });
    vi.mocked(build).mockReset();
  }
});

it.each(["recipe", "runner"] as const)(
  "joins a started window writer when sibling setup throws with %s cleanup ownership",
  async (cleanupOwner) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-preparation-sync-"),
    );
    const release = deferred();
    const failed = deferred();
    const cleaned = deferred();
    const originalFailure = new Error("Synchronous preload setup failure");
    const writers: Promise<unknown>[] = [];
    let earlyCleanup = false;
    let preparation: Promise<unknown> | undefined;
    const actual =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(symlink).mockImplementation(actual.symlink);
    vi.mocked(build).mockImplementation((options) => {
      if (path.basename(options.outfile!) === "preload.cjs") {
        failed.resolve();
        throw originalFailure;
      }
      const writer = (async () => {
        await release.promise;
        await mkdir(path.dirname(options.outfile!), { recursive: true });
        await writeFile(options.outfile!, "late real output\n");
        return {} as Awaited<ReturnType<typeof build>>;
      })();
      writers.push(writer);
      return writer;
    });
    try {
      preparation = (async () => {
        try {
          await buildWindowFixture(root, cleanupOwner);
        } catch (error) {
          return error;
        } finally {
          earlyCleanup = true;
          await rm(root, { recursive: true, force: true });
          cleaned.resolve();
        }
      })();
      await failed.promise;
      await setImmediate();
      const removedEarly = earlyCleanup;
      if (removedEarly) await cleaned.promise;
      release.resolve();
      await Promise.allSettled(writers);
      expect(await preparation).toBe(originalFailure);
      expect(
        existsSync(root),
        "synchronous setup failure allowed late root recreation",
      ).toBe(false);
      expect(removedEarly).toBe(false);
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
