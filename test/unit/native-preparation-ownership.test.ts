import * as filesystem from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";
import { buildFixture as cursor } from "../fixtures/restty-cursor-rendering-build";
import { buildFixture as chrome } from "../fixtures/window-chrome-build";
import { buildFixture as scrollback } from "../fixtures/restty-scrollback-rendering-build";
import { buildFixture as acknowledgement } from "../fixtures/failure-acknowledgement-build";
import { buildFixture as initialization } from "../fixtures/initialization-cancellation-build";
import { buildFixture as pending } from "../fixtures/pending-tab-ownership-build";
import { buildFixture as shutdown } from "../fixtures/production-shutdown-build";
import { buildFixture as background } from "../fixtures/restty-background-rendering-build";
import { buildFixture as titles } from "../fixtures/startup-tab-titles-build";
import { buildFixture as fonts } from "../fixtures/surface-font-ownership-build";
import { buildFixture as removal } from "../fixtures/tab-removal-build";
import { buildFixture as blur } from "../fixtures/macos-window-blur-build";
import { observeNativeWindow } from "../fixtures/native-window-observation";
import { FIXTURE_PROCESS_DIRECTORY } from "../fixtures/native-fixture-ownership";
import { runNativeFixture } from "../fixtures/run-native-fixture";

vi.mock("esbuild", () => ({ build: vi.fn() }));
vi.mock("node:fs/promises", { spy: true });
vi.mock("node:child_process", () => ({
  fork: () => {
    throw new Error("Native launch is forbidden");
  },
  spawn: () => {
    throw new Error("Native launch is forbidden");
  },
  execFileSync: (executable: string, args: string[]) => {
    // Model only the external blur compiler, as in preparation-recipe tests.
    if (executable !== "/usr/bin/xcrun")
      throw new Error("Native commands are forbidden");
    writeFileSync(args[args.indexOf("-o") + 1]!, "external compiler output");
    return Buffer.alloc(0);
  },
}));
const actual = await vi.importActual<typeof filesystem>("node:fs/promises");
const recipes = [
  {
    name: "cursor",
    writers: 3,
    prepare: (root: string) => cursor(root, "runner"),
  },
  {
    name: "chrome",
    writers: 4,
    prepare: (root: string) => chrome(root, "runner"),
  },
  {
    name: "scrollback",
    writers: 0,
    prepare: (root: string) => scrollback(root, "scrollback", false, "runner"),
  },
  { name: "discovery", writers: 2, prepare: undefined },
  ...[
    { name: "acknowledgement", writers: 3, build: acknowledgement },
    { name: "initialization", writers: 3, build: initialization },
    { name: "pending", writers: 3, build: pending },
    { name: "shutdown", writers: 4, build: shutdown },
    { name: "background", writers: 2, build: background },
    { name: "titles", writers: 3, build: titles },
    { name: "fonts", writers: 3, build: fonts },
    { name: "removal", writers: 3, build: removal },
    { name: "blur", writers: 2, build: blur },
  ].map(({ name, writers, build: prepare }) => ({
    name,
    writers,
    prepare: (root: string) => prepare(root, "runner"),
  })),
];
function phaseGate() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

it.each([
  ...recipes.flatMap((recipe) =>
    ["replacement", "ownership marker"].map((mode) => ({
      recipe,
      mode,
      holdIcon: false,
      phase: "all writers settled",
    })),
  ),
  {
    recipe: recipes.find((recipe) => recipe.name === "chrome")!,
    mode: "replacement",
    holdIcon: true,
    phase: "while the icon writer is pending",
  },
])(
  "$recipe.name delegates failure cleanup without deleting $mode — $phase",
  async ({ recipe, mode, holdIcon }) => {
    const parent = await actual.mkdtemp(
      path.join(tmpdir(), "omxterm-preparation-owner-"),
    );
    let root = path.join(parent, "profile");
    let original = root + "-original";
    await actual.mkdir(root);
    let complete!: () => void;
    const writers = new Promise<void>((resolve) => {
      complete = resolve;
    });
    if (!recipe.writers) complete();
    const iconHeld = phaseGate(),
      releaseIcon = phaseGate(),
      otherWriters = phaseGate();
    let failureInjectionStarted = false;
    let invoked = 0;
    let finished = 0;
    const track = async (operation: Promise<unknown>) => {
      invoked += 1;
      await operation;
      finished += 1;
      if (finished === recipe.writers) complete();
      // Chrome has three other writers; the configured barrier must also wait
      // for the held icon. Resolve after complete() to observe its continuation.
      if (holdIcon && finished === 3) otherWriters.release();
    };
    vi.mocked(filesystem.writeFile).mockImplementation((...args) =>
      track(actual.writeFile(...args)),
    );
    vi.mocked(filesystem.cp).mockImplementation((...args) =>
      track(
        (async () => {
          await actual.cp(...args);
          if (
            holdIcon &&
            args[1] === path.join(root, "renderer/application-icon.png")
          ) {
            iconHeld.release();
            await releaseIcon.ready;
          }
        })(),
      ),
    );
    vi.mocked(filesystem.symlink).mockImplementation((...args) =>
      track(actual.symlink(...args)),
    );
    vi.mocked(filesystem.mkdtemp).mockImplementation(async (...args) => {
      const profile = await actual.mkdtemp(...args);
      root = profile;
      original = root + "-original";
      return profile;
    });
    const failure = new Error("Settled actual recipe build failure");
    let fault: Promise<never> | undefined;
    vi.mocked(build).mockImplementation(() => {
      fault ??= (async () => {
        await writers;
        failureInjectionStarted = true;
        if (mode === "replacement") {
          await actual.rename(root, original);
          await actual.mkdir(root);
        } else await actual.mkdir(path.join(root, FIXTURE_PROCESS_DIRECTORY));
        await actual.writeFile(path.join(root, "foreign-owned"), "preserve");
        throw failure;
      })();
      return fault;
    });
    const remove = vi.spyOn(filesystem, "rm");
    remove.mockClear();
    const operation = recipe.prepare
      ? runNativeFixture({
          executable: process.execPath,
          args: [],
          root,
          evidencePath: path.join(parent, "outcome.json"),
          timeout: 1000,
          prepare: () => recipe.prepare!(root),
        })
      : observeNativeWindow("cursor");
    // Always settle the real writers before restoring spies or deleting our
    // temporary directory, including when the held-writer assertion fails.
    const settled = operation.then(
      () => {},
      () => {},
    );
    try {
      if (holdIcon) {
        await Promise.all([iconHeld.ready, otherWriters.ready]);
        expect(invoked).toBe(4);
        expect(finished).toBe(3);
        expect(failureInjectionStarted).toBe(false);
        expect(existsSync(original)).toBe(false);
        releaseIcon.release();
      }
      await expect(operation).rejects.toMatchObject({
        cause: failure,
        errors: [failure, expect.any(Error)],
      });
      expect(invoked).toBe(recipe.writers);
      expect(finished).toBe(recipe.writers);
      expect(
        await actual.readFile(path.join(root, "foreign-owned"), "utf8"),
      ).toBe("preserve");
      expect(remove).not.toHaveBeenCalled();
      if (mode === "replacement") expect(existsSync(original)).toBe(true);
      else
        expect(existsSync(path.join(root, FIXTURE_PROCESS_DIRECTORY))).toBe(
          true,
        );
    } finally {
      releaseIcon.release();
      await settled;
      vi.restoreAllMocks();
      await actual.rm(parent, { recursive: true, force: true });
      if (recipe.name === "discovery") {
        await actual.rm(root, { recursive: true, force: true });
        await actual.rm(original, { recursive: true, force: true });
      }
    }
  },
);
