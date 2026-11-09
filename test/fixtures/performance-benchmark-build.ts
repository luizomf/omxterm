import { access, cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, type Plugin } from "esbuild";
import { prepareFixture } from "./prepare-fixture";

// These commands run from the repository root (like the rest of the test
// tooling), so a bundled caller resolves the same project without depending on
// its own module location.
const projectRoot = process.cwd();

// The benchmark measures the built application: production main, preload,
// extension runtime and renderer assets come from `dist`. Only the renderer
// entry and the supervising main are fixture files, exactly like the other
// renderer-entry fixtures in this repository.
export function performanceSettingsDocument(scrollbackLines: number) {
  return {
    version: 1,
    language: "en-US",
    font: { size: 16, lineHeight: 1, ligatures: false },
    scrollback: { lines: scrollbackLines },
    terminal: { contextMenuEnabled: false },
    window: {
      alwaysOnTop: false,
      showTitleBar: true,
      showTabBar: true,
      transparency: 0,
      blur: false,
    },
  };
}

export interface PerformanceProfileOptions {
  readonly scrollbackLines: number;
}

async function copyApplication(
  root: string,
  start: (task: () => Promise<unknown>) => Promise<unknown>,
) {
  const dist = path.join(projectRoot, "dist");
  try {
    await access(path.join(dist, "main", "index.js"));
    await access(path.join(dist, "extension-runtime", "bootstrap.mjs"));
  } catch {
    throw new Error(
      "The performance benchmark measures the built application; run `npm run build` first",
    );
  }
  await start(() => mkdir(path.join(root, "main"), { recursive: true }));
  await start(() =>
    cp(
      path.join(dist, "main", "index.js"),
      path.join(root, "main", "index.mjs"),
    ),
  );
  for (const name of ["preload", "renderer", "extension-runtime"] as const)
    await start(() =>
      cp(path.join(dist, name), path.join(root, name), { recursive: true }),
    );
  await start(() => mkdir(path.join(root, "assets"), { recursive: true }));
  await start(() =>
    cp(
      path.join(projectRoot, "assets", "application-icon.png"),
      path.join(root, "assets", "application-icon.png"),
    ),
  );
}

// Mount substitution is limited to the application's own import, so the fixture
// module keeps delegating to the real production mount.
const observeProductionMount: Plugin = {
  name: "observe-production-mount",
  setup(builder) {
    builder.onResolve(
      { filter: /terminal-surface\/restty-terminal-surface$/ },
      (args) => {
        if (
          args.importer ===
          path.join(projectRoot, "src", "renderer", "start-terminal-window.ts")
        )
          return {
            path: path.join(
              projectRoot,
              "test",
              "fixtures",
              "performance-benchmark-surface.ts",
            ),
          };
        return undefined;
      },
    );
  },
};

async function buildFixtures(
  root: string,
  start: (task: () => Promise<unknown>) => Promise<unknown>,
): Promise<void> {
  await start(() =>
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/performance-benchmark-renderer.ts"],
      format: "iife",
      loader: { ".ttf": "binary" },
      logLevel: "silent",
      outfile: path.join(root, "renderer", "index.js"),
      platform: "browser",
      plugins: [observeProductionMount],
    }),
  );
  await start(() =>
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/performance-benchmark-main.ts"],
      external: ["electron", "node-pty", "yaml", "yauzl", "semver"],
      format: "esm",
      logLevel: "silent",
      outfile: path.join(root, "perf-main.mjs"),
      platform: "node",
    }),
  );
  await start(() =>
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/performance-benchmark-runtime.ts"],
      external: ["electron", "node-pty", "yaml", "yauzl", "semver"],
      format: "esm",
      logLevel: "silent",
      outfile: path.join(root, "perf-runtime.mjs"),
      platform: "node",
    }),
  );
  await start(() =>
    symlink(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    ),
  );
}

async function writeProfileSettings(
  root: string,
  scrollbackLines: number,
  start: (task: () => Promise<unknown>) => Promise<unknown>,
): Promise<void> {
  await start(() =>
    mkdir(path.join(root, "config", "omxterm"), { recursive: true }),
  );
  await start(() => mkdir(path.join(root, "home"), { recursive: true }));
  await start(() => mkdir(path.join(root, "state"), { recursive: true }));
  await start(() =>
    writeFile(
      path.join(root, "config", "omxterm", "config.json"),
      `${JSON.stringify(performanceSettingsDocument(scrollbackLines), null, 2)}\n`,
    ),
  );
}

export function buildPerformanceProfile(
  root: string,
  options: PerformanceProfileOptions,
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await copyApplication(root, start);
      await buildFixtures(root, start);
      await writeProfileSettings(root, options.scrollbackLines, start);
    },
    "runner",
  );
}
