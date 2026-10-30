import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";
import { buildExtensionFixturePackages } from "../fixtures/extension-view-package-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";

// Assigned idle POSIX desktop only; no new supervisor or destructive main-death probe.
it.skipIf(!["linux", "darwin"].includes(process.platform))(
  "composes two production hosted tabs with retained Settings and a continuing real Surface/PTY",
  { timeout: 250_000 },
  async (testContext) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-extension-view-"));
    const requestedEvidence = process.env.OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR;
    const evidence = requestedEvidence
      ? path.resolve(requestedEvidence)
      : undefined;
    if (evidence) {
      // The supervised child runs from its disposable profile, not this cwd.
      process.env.OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR = evidence;
      testContext.onTestFinished(() => {
        process.env.OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR = requestedEvidence!;
      });
      const relative = path.relative(root, path.resolve(evidence));
      expect(
        relative !== "" &&
          (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)),
        "evidence must survive cleaned fixture profile",
      ).toBe(true);
      await mkdir(evidence, { recursive: true });
    }
    const execution = await runNativeFixture({
      executable: createRequire(import.meta.url)("electron") as string,
      args: [
        ...supportedFixtureChromiumArguments(),
        root,
        "--fixture-extension-view",
      ],
      root,
      timeout: 130_000,
      testContext,
      prepare: async () => {
        await buildFixture(root, "runner");
        await buildExtensionFixturePackages(root);
      },
    });
    if (evidence)
      await writeFile(
        path.join(evidence, "supervisor.json"),
        JSON.stringify(execution, null, 2),
      );
    expect(
      execution,
      `stdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    ).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
    });
    const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";
    const lines = execution.stdout
      .split("\n")
      .filter((line) => line.startsWith(prefix));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.slice(prefix.length))).toMatchObject({
      extensionViews: "production-composition-verified",
      retirement: { status: "settled" },
      postCrashRecovery: {
        replacementPresented: true,
        overlayHiddenAndRestored: true,
        replacementReleased: 1,
        originalPtyContinued: true,
      },
      resourceReceipts: {
        admitted: true,
        released: 1,
        active: 0,
        postReleaseRead: "rejected",
        replacementDirectoryRetained: true,
        first: { generation: 1 },
        replacement: { generation: 2 },
      },
    });
  },
);
