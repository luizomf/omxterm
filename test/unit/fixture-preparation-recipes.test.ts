import { existsSync, writeFileSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { build, type BuildOptions } from "esbuild";
import { beforeEach, expect, it, vi } from "vitest";
import { buildFixture as initialization } from "../fixtures/initialization-cancellation-build";
import { buildFixture as pending } from "../fixtures/pending-tab-ownership-build";
import { buildFixture as fonts } from "../fixtures/surface-font-ownership-build";
import { buildFixture as titles } from "../fixtures/startup-tab-titles-build";
import { buildFixture as removal } from "../fixtures/tab-removal-build";
import { buildFixture as acknowledgement } from "../fixtures/failure-acknowledgement-build";
import { buildFixture as chrome } from "../fixtures/window-chrome-build";
import { buildFixture as blur } from "../fixtures/macos-window-blur-build";
import { buildFixture as shutdown } from "../fixtures/production-shutdown-build";
import { buildFixture as image } from "../fixtures/local-image-native-build";
import { buildFixture as rendering } from "../fixtures/restty-rendering-build";
import { buildFixture as appearance } from "../fixtures/restty-appearance-rendering-build";
import { buildFixture as ligatures } from "../fixtures/restty-ligatures-rendering-build";
import { buildFixture as scrollback } from "../fixtures/restty-scrollback-rendering-build";
import { buildFixture as background } from "../fixtures/restty-background-rendering-build";
import { buildFixture as cursor } from "../fixtures/restty-cursor-rendering-build";

vi.mock("esbuild", () => ({ build: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    symlink: vi.fn(actual.symlink),
    copyFile: vi.fn(actual.copyFile),
    writeFile: vi.fn(actual.writeFile),
    rm: vi.fn(actual.rm),
  };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  // Native fallback discovery is optional. Exercise its missing-font path
  // without OS font commands, and keep compiler/process work headless.
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: async () => ({ stdout: '{"status":"missing"}' }),
  });
  return {
    ...actual,
    execFile,
    execFileSync: vi.fn((executable: string, args: string[]) => {
      if (executable !== "/usr/bin/xcrun")
        throw new Error("Unexpected native command");
      writeFileSync(args[args.indexOf("-o") + 1]!, "external compiler output");
      return Buffer.alloc(0);
    }),
    spawn: () => {
      throw new Error("Native launch is forbidden in preparation regressions");
    },
    fork: () => {
      throw new Error("Native launch is forbidden in preparation regressions");
    },
  };
});

interface Recipe {
  readonly name: string;
  readonly prepare: (root: string) => Promise<void>;
  readonly metadataName: string;
  readonly builds: readonly string[];
  readonly files: readonly string[];
  readonly failure: "symlink" | "package" | "copy";
  readonly copyTarget?: string;
  readonly lateFile?: string;
  readonly plugins?: readonly string[];
}
const standardBuilds = ["main.cjs", "preload.cjs", "renderer/index.js"];
const standardFiles = [
  ...standardBuilds,
  "renderer/index.html",
  "package.json",
  "node_modules",
];
const plainFiles = [
  "renderer.js",
  "index.html",
  "renderer.css",
  "package.json",
  "main.cjs",
  "home",
];
const recipes: readonly Recipe[] = [
  {
    name: "initialization-cancellation",
    prepare: initialization,
    metadataName: "omxterm-cancellation-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
    plugins: ["hold-second-runtime-readiness"],
  },
  {
    name: "pending-tab-ownership",
    prepare: pending,
    metadataName: "omxterm-pending-tab-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
    plugins: ["hold-second-surface-font-acquisition"],
  },
  {
    name: "surface-font-ownership",
    prepare: fonts,
    metadataName: "omxterm-font-ownership-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
    plugins: ["observe-font-ownership-at-real-runtime-readiness"],
  },
  {
    name: "startup-tab-titles",
    prepare: titles,
    metadataName: "omxterm-startup-tab-titles-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
  },
  {
    name: "tab-removal",
    prepare: removal,
    metadataName: "omxterm-tab-removal-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
    plugins: ["hold-real-initial-surface-return"],
  },
  {
    name: "failure-acknowledgement",
    prepare: acknowledgement,
    metadataName: "omxterm-failure-ack-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
  },
  {
    name: "window-chrome",
    prepare: chrome,
    metadataName: "omxterm-window-chrome-fixture",
    builds: standardBuilds,
    files: standardFiles,
    failure: "symlink",
  },
  {
    name: "macos-window-blur",
    prepare: blur,
    metadataName: "omxterm-macos-blur-fixture",
    builds: ["index.js", "main.js"],
    files: [
      "index.js",
      "main.js",
      "index.html",
      "package.json",
      ...(process.platform === "darwin" ? ["macos-window-blur.node"] : []),
    ],
    failure: "package",
  },
  {
    name: "production-shutdown",
    prepare: shutdown,
    metadataName: "omxterm-production-shutdown-fixture",
    builds: [
      "dist/main/index.js",
      "main.js",
      "dist/preload/index.cjs",
      "dist/renderer/index.js",
    ],
    files: [
      "dist/main/index.js",
      "main.js",
      "dist/preload/index.cjs",
      "dist/renderer/index.js",
      "dist/renderer/index.html",
      "assets/application-icon.png",
      "node_modules",
      "package.json",
    ],
    failure: "symlink",
  },
  {
    name: "local-image-native",
    prepare: image,
    metadataName: "omxterm-local-image-fixture",
    builds: ["main.cjs", "preview.js"],
    files: [
      "main.cjs",
      "preview.js",
      "preview.html",
      "preview.css",
      "package.json",
      "fixture%23#literal.data",
    ],
    failure: "copy",
    copyTarget: "preview.css",
    lateFile: "preview.html",
  },
  {
    name: "restty-rendering",
    prepare: rendering,
    metadataName: "omxterm-restty-fixture",
    builds: ["renderer.js", "text-rendering-evidence.cjs"],
    files: [...plainFiles, "text-rendering-evidence.cjs", "LICENSE"],
    failure: "copy",
    copyTarget: "LICENSE",
    lateFile: "main.cjs",
  },
  {
    name: "restty-appearance-rendering",
    prepare: appearance,
    metadataName: "omxterm-restty-appearance",
    builds: ["renderer.js", "selection.cjs"],
    files: [...plainFiles, "selection.cjs"],
    failure: "copy",
    copyTarget: "renderer.css",
    lateFile: "main.cjs",
    plugins: ["configured-font-reference"],
  },
  {
    name: "restty-ligatures-rendering",
    prepare: ligatures,
    metadataName: "omxterm-restty-ligatures",
    builds: ["renderer.js"],
    files: [...plainFiles, "fallbacks.ts"],
    failure: "copy",
    copyTarget: "renderer.css",
    lateFile: "main.cjs",
  },
  {
    name: "restty-scrollback-rendering",
    prepare: scrollback,
    metadataName: "omxterm-restty-scrollback",
    builds: ["renderer.js", "native-input.cjs"],
    files: [...plainFiles, "native-input.cjs"],
    failure: "copy",
    copyTarget: "renderer.css",
    lateFile: "main.cjs",
    plugins: ["fixture-only-raf-counts"],
  },
  {
    name: "restty-scroll-feedback-ready-before-map",
    prepare: (root) =>
      scrollback(root, "native-scroll-feedback-ready-before-map"),
    metadataName: "omxterm-restty-scrollback",
    builds: ["renderer.js", "native-input.cjs"],
    files: [...plainFiles, "native-input.cjs"],
    failure: "copy",
    copyTarget: "renderer.css",
    lateFile: "main.cjs",
    plugins: ["fixture-only-raf-counts"],
  },
  {
    name: "restty-background-rendering",
    prepare: background,
    metadataName: "omxterm-background-fixture",
    builds: ["main.cjs", "index.js"],
    files: ["main.cjs", "index.js", "index.html", "package.json"],
    failure: "package",
  },
  {
    name: "restty-cursor-rendering",
    prepare: cursor,
    metadataName: "omxterm-cursor-fixture",
    plugins: ["cursor-runtime-probe"],
    builds: ["main.cjs", "index.js"],
    files: [
      "main.cjs",
      "index.js",
      "index.html",
      "preload.cjs",
      "package.json",
    ],
    failure: "package",
  },
];
const actual =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
beforeEach(() => {
  vi.mocked(build).mockReset();
  vi.mocked(copyFile).mockReset().mockImplementation(actual.copyFile);
  vi.mocked(symlink).mockReset().mockImplementation(actual.symlink);
  vi.mocked(writeFile).mockReset().mockImplementation(actual.writeFile);
  vi.mocked(rm).mockReset().mockImplementation(actual.rm);
});

it.each(recipes)(
  "keeps $name's successful recipe and returns the profile to its launch owner",
  async (recipe) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-preparation-recipe-"),
    );
    const options: BuildOptions[] = [];
    vi.mocked(build).mockImplementation(async (request) => {
      options.push(request);
      await actual.mkdir(path.dirname(request.outfile!), { recursive: true });
      await actual.writeFile(request.outfile!, "external builder output");
      return {} as Awaited<ReturnType<typeof build>>;
    });
    try {
      await recipe.prepare(root);
      expect(existsSync(root)).toBe(true);
      for (const file of recipe.files)
        expect(existsSync(path.join(root, file)), file).toBe(true);
      expect(
        JSON.parse(
          await readFile(path.join(root, "package.json"), "utf8"),
        ) as unknown,
      ).toMatchObject({ name: recipe.metadataName });
      expect(
        options
          .map(({ outfile }) =>
            path.relative(root, outfile!).replaceAll(path.sep, "/"),
          )
          .sort(),
      ).toEqual([...recipe.builds].sort());
      expect(
        options.flatMap(
          ({ plugins }) => plugins?.map(({ name }) => name) ?? [],
        ),
      ).toEqual(recipe.plugins ?? []);
      for (const option of options) {
        expect(option.bundle).toBe(true);
        expect(option.platform).toMatch(/^(node|browser)$/u);
        if (
          option.platform === "browser" &&
          recipe.name !== "local-image-native"
        )
          expect(option.loader).toEqual({ ".ttf": "binary" });
      }
      if (recipe.name === "production-shutdown") {
        expect(options.map(({ format }) => format)).toEqual([
          "esm",
          "esm",
          "cjs",
          "iife",
        ]);
        expect(vi.mocked(symlink).mock.calls[0]?.[2]).toBe("junction");
      } else if (recipe.failure === "symlink")
        expect(vi.mocked(symlink).mock.calls[0]?.[2]).toBe("dir");
      const html = recipe.files.find((file) => file.endsWith(".html"))!;
      expect(await readFile(path.join(root, html), "utf8")).toContain(
        "Content-Security-Policy",
      );
    } finally {
      await actual.rm(root, { recursive: true, force: true });
    }
  },
);

it.each(
  recipes.flatMap((recipe) => [
    { recipe, mode: "rejection" as const },
    { recipe, mode: "synchronous setup failure" as const },
  ]),
)(
  "settles $recipe.name writers after $mode without replacing the first failure or recreating a profile",
  async ({ recipe, mode }) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-preparation-failure-"),
    );
    const release = deferred();
    const failed = deferred();
    const cleaned = deferred();
    const writers: Promise<unknown>[] = [];
    let originalFailure: unknown;
    let cleanupStarted = false;
    let preparation: Promise<unknown> | undefined;
    const conflict = path.join(
      root,
      recipe.failure === "symlink"
        ? "node_modules"
        : recipe.failure === "package"
          ? "package.json"
          : recipe.copyTarget!,
    );
    await actual.mkdir(conflict);
    const fail = (operation: () => Promise<unknown>) => {
      if (mode === "synchronous setup failure") {
        originalFailure = new Error(
          "Synchronous external preparation setup failure",
        );
        failed.resolve();
        throw originalFailure;
      }
      return operation().catch((error: unknown) => {
        originalFailure = error;
        failed.resolve();
        throw error;
      });
    };
    const late = (
      destination: string,
      data: Parameters<typeof actual.writeFile>[1],
    ) => {
      const writer = (async () => {
        await release.promise;
        await actual.mkdir(path.dirname(destination), { recursive: true });
        await actual.writeFile(destination, data);
        throw new Error("Later writer failure must not replace first failure");
      })();
      writers.push(writer);
      return writer;
    };
    vi.mocked(symlink).mockImplementation((...args) => {
      if (recipe.failure === "symlink")
        return fail(() => actual.symlink(...args)) as Promise<void>;
      return actual.symlink(...args);
    });
    vi.mocked(copyFile).mockImplementation((...args) => {
      if (recipe.failure === "copy")
        return fail(() => actual.copyFile(...args)) as Promise<void>;
      return actual.copyFile(...args);
    });
    vi.mocked(writeFile).mockImplementation((file, data, options) => {
      if (file === conflict && recipe.failure === "package")
        return fail(() =>
          actual.writeFile(file, data, options),
        ) as Promise<void>;
      if (file === path.join(root, recipe.lateFile ?? "__no-file__"))
        return late(String(file), data) as Promise<void>;
      return actual.writeFile(file, data, options);
    });
    vi.mocked(build).mockImplementation(async (options) => {
      const relative = path
        .relative(root, options.outfile!)
        .replaceAll(path.sep, "/");
      if (recipe.failure !== "copy" || relative === "selection.cjs")
        await late(options.outfile!, "late actual builder output");
      else {
        await actual.mkdir(path.dirname(options.outfile!), { recursive: true });
        await actual.writeFile(
          options.outfile!,
          "sequential actual builder output",
        );
      }
      return {} as Awaited<ReturnType<typeof build>>;
    });
    try {
      preparation = (async () => {
        try {
          await recipe.prepare(root);
        } catch (error) {
          return error;
        } finally {
          cleanupStarted = true;
          await actual.rm(root, { recursive: true, force: true });
          cleaned.resolve();
        }
      })();
      await failed.promise;
      await setImmediate();
      const removedEarly = cleanupStarted;
      if (removedEarly) await cleaned.promise;
      expect(writers.length).toBeGreaterThan(0);
      release.resolve();
      await Promise.allSettled(writers);
      expect(await preparation).toBe(originalFailure);
      if (mode === "rejection") expect(originalFailure).toHaveProperty("code");
      expect(
        existsSync(root),
        "late writers recreated the removed profile",
      ).toBe(false);
      expect(removedEarly).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled(writers);
      await preparation;
      await actual.rm(root, { recursive: true, force: true });
    }
  },
);

it("removes an owned profile after a serial setup failure without touching its sibling", async () => {
  const parent = await mkdtemp(
    path.join(tmpdir(), "omxterm-preparation-serial-"),
  );
  const root = path.join(parent, "profile");
  const sibling = path.join(parent, "unrelated-sentinel");
  try {
    await actual.mkdir(path.join(root, "renderer"), { recursive: true });
    await actual.writeFile(sibling, "preserve this owned sentinel");
    await expect(pending(root)).rejects.toMatchObject({ code: "EEXIST" });
    expect(vi.mocked(build)).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
    expect(await actual.readFile(sibling, "utf8")).toBe(
      "preserve this owned sentinel",
    );
  } finally {
    await actual.rm(parent, { recursive: true, force: true });
  }
});

it("reports the original preparation cause and failed cleanup while retaining the owned root", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-preparation-cleanup-"),
  );
  const originalFailure = new Error("External builder setup failure");
  const cleanupFailure = new Error("Controlled owned-root removal failure");
  vi.mocked(build).mockImplementation(() => {
    throw originalFailure;
  });
  vi.mocked(rm).mockImplementation((target, options) => {
    if (target === root) return Promise.reject(cleanupFailure);
    return actual.rm(target, options);
  });
  try {
    const result = await cursor(root).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    expect(result).toMatchObject({
      cause: originalFailure,
      errors: [originalFailure, cleanupFailure],
    });
    expect(existsSync(root)).toBe(true);
  } finally {
    await actual.rm(root, { recursive: true, force: true });
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
