import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { beforeAll, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
let program: string;
beforeAll(async () => {
  const compiled = await build({
    entryPoints: ["test/integration/files-production.test.ts"],
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  program = compiled.outputFiles[0]!.text;
});
const natural = {
  exitCode: 0,
  signal: null,
  reason: "exit",
  cleanupErrors: [],
  cleanupAssistance: "none",
  stderr: "",
  stdout:
    "__FILES_PRODUCTION__" +
    JSON.stringify({
      failed: false,
      approved: 1,
      quit: "joined",
      checks: [
        "Settings-captured-trust-dormant-no-backend",
        "selected-visible-toggle-header-close-destroy-empty-reveal-noop-fresh-view-same-backend-PTY",
        "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
        "menu-palette-hidden-reveal-settings-retain-same-terminal",
        "real-create-folder-no-clobber-move-trash-confirmed-delete",
        "backend-loss-retires-companion-core-survives",
        "explicit-reopen-fresh-view-and-backend",
        "disable-uninstall-real-settlement-retained-draft-same-PTY",
      ],
    }),
};

// Execute the actual integration consumer with an inert runner. Even the
// executable lookup and preparation I/O are modeled; Electron cannot launch.
async function consume(result: object) {
  let scenario: (context: object) => Promise<void> = async () => {
    throw Error("not registered");
  };
  const native = vi.fn(async () => result);
  const forbidden = vi.fn(() => {
    throw Error("native execution forbidden");
  });
  runInNewContext(program, {
    module: { exports: {} },
    process: {
      platform: "linux",
      arch: "arm64",
      env: { OMXTERM_FILES_PRODUCTION_SOURCE: "/synthetic/source" },
    },
    require: (name: string) => {
      if (name === "vitest")
        return {
          expect,
          it: {
            skipIf:
              () =>
              (_title: string, _options: object, run: typeof scenario) => {
                scenario = run;
              },
          },
        };
      if (name === "node:child_process") return { execFileSync: forbidden };
      if (name === "node:module")
        return { createRequire: () => () => "not-an-executable" };
      if (name === "node:fs/promises")
        return {
          mkdtemp: async () => "/synthetic/profile",
          cp: forbidden,
          mkdir: forbidden,
          readFile: forbidden,
          writeFile: forbidden,
        };
      if (name.endsWith("/run-native-fixture"))
        return { runNativeFixture: native };
      if (name.endsWith("/supported-fixture-chromium-arguments"))
        return { productionFixtureArguments: () => [] };
      return require(name) as unknown;
    },
  });
  try {
    await scenario({});
  } finally {
    expect(native).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ root: "/synthetic/profile" }),
    );
    expect(forbidden).not.toHaveBeenCalled();
  }
}

it("accepts natural settlement with the original joined-Quit scenario", async () => {
  await consume(natural);
});
it.each(["attempted", "unknown", "historical"])(
  "rejects %s settlement despite exit0 and joined-Quit output",
  async (classification) => {
    const { cleanupAssistance: _classification, ...historical } = natural;
    await expect(
      consume(
        classification === "historical"
          ? historical
          : { ...natural, cleanupAssistance: classification },
      ),
    ).rejects.toThrow();
  },
);
