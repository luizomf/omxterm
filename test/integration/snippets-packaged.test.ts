import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { build } from "esbuild";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const prefix = "OMXTERM_SNIPPETS_PACKAGED_";
const names = ["ENTRY", "ARCHIVE", "ARCHIVE_SHA256"] as const;
const enabled =
  names.some((name) => process.env[prefix + name] !== undefined) ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL !== undefined ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC !== undefined ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC !== undefined ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE !== undefined ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT !== undefined;
const require = createRequire(import.meta.url);
const executable = require("electron") as string;
const { sourceLaunch, childInputCapture } =
  require("../fixtures/snippets-source-launch.cjs") as {
    childInputCapture(input: {
      value: string | undefined;
      platform: string;
      evidence: string | undefined;
    }): boolean;
    sourceLaunch(input: {
      platform: string;
      arch: string;
      root: string;
      node: string;
      electron: string;
    }): { executable: string; args: string[] };
  };

// Opt-in on an assigned Linux ARM64/x64 or macOS/Windows ARM64 guest. ENTRY uses unchanged
// production composition in an isolated output with normal shutdown. This is
// installed-package evidence, not publication or physical-keyboard qualification.
it.skipIf(!enabled)(
  process.env.OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT !== undefined
    ? "diagnoses first Insert with delayed memory evidence, not qualification"
    : "qualifies an ordinarily installed Snippets archive with a live Surface and PTY",
  { timeout: 150_000 },
  async (testContext) => {
    assert.ok(
      (process.platform === "linux" &&
        ["arm64", "x64"].includes(process.arch)) ||
        (["darwin", "win32"].includes(process.platform) &&
          process.arch === "arm64"),
    );
    assert.equal(process.env.OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE, undefined);
    assert.ok(
      !Object.keys(process.env).some(
        (key) =>
          key.startsWith("OMXTERM_SNIPPETS_WINDOWS_") &&
          process.env[key] !== undefined,
      ),
      "Choose one Snippets adapter",
    );
    const values = Object.fromEntries(
      names.map((name) => {
        const value = process.env[prefix + name];
        assert.ok(value, `${prefix}${name} is required`);
        return [name, value];
      }),
    ) as Record<(typeof names)[number], string>;
    assert.ok(path.isAbsolute(values.ENTRY));
    assert.ok(path.isAbsolute(values.ARCHIVE));
    assert.match(values.ARCHIVE_SHA256, /^[a-f0-9]{64}$/);
    const digest = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest(await readFile(values.ARCHIVE)), values.ARCHIVE_SHA256);
    const entrySha256 = digest(await readFile(values.ENTRY));
    const { version } = JSON.parse(await readFile("package.json", "utf8")) as {
      version: string;
    };
    assert.equal(typeof version, "string");
    assert.ok(version.length > 0);
    const quartzTool = process.env.OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL;
    if (process.platform === "darwin") {
      const { verifyQuartzTool } = createRequire(import.meta.url)(
        "../fixtures/snippets-quartz.cjs",
      ) as { verifyQuartzTool(manifest: string | undefined): unknown };
      verifyQuartzTool(quartzTool);
    }
    const evidence = process.env.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
    const { memoryInput: validateMemoryInput } =
      require("../fixtures/snippets-memory-input.cjs") as typeof import("../fixtures/snippets-memory-input.cjs");
    const memoryInput = validateMemoryInput({
      value: process.env.OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT,
      platform: process.platform,
      evidence,
      captures: [
        process.env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE,
        process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC,
        process.env.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC,
      ],
    }) as string | undefined;
    const captureChildInput = childInputCapture({
      value: process.env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE,
      platform: process.platform,
      evidence,
    });
    const insertDiagnostic =
      process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC;
    const readinessDiagnostic =
      process.env.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC;
    if (readinessDiagnostic !== undefined) {
      assert.equal(readinessDiagnostic, "1");
      assert.equal(process.platform, "win32");
      assert.ok(evidence, "diagnostic evidence directory required");
      assert.equal(insertDiagnostic, undefined, "diagnostics cannot be mixed");
    }
    if (insertDiagnostic !== undefined) {
      assert.equal(insertDiagnostic, "1");
      assert.equal(process.platform, "win32");
      assert.ok(evidence, "diagnostic evidence directory required");
    }
    if (evidence) {
      assert.ok(path.isAbsolute(evidence));
      await mkdir(evidence, { recursive: true });
    }
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-snippets-packaged-"),
    );
    const windows = process.platform === "win32";
    const inputMarker = path.join(
      evidence ?? path.resolve(".scratch/native-fixtures"),
      `windows-snippets-input-${randomUUID()}.json`,
    );
    const launch = sourceLaunch({
      platform: process.platform,
      arch: process.arch,
      root,
      node: process.execPath,
      electron: executable,
    });
    let preparationOwned = false;
    const result = await runNativeFixture({
      ...launch,
      root,
      timeout: 120_000,
      testContext,
      prepare: async () => {
        preparationOwned = true;
        await cp(
          "test/fixtures/snippets-packaged.mjs",
          path.join(root, "main.mjs"),
        );
        for (const name of [
          "snippets-scenario.cjs",
          "snippets-observer.cjs",
          "snippets-insert-diagnostic.cjs",
          "snippets-catalog.json",
          "snippets-windows-catalog.json",
          "snippets-windows-probe.cjs",
          "snippets-windows-cpr.cjs",
          "snippets-child-input-diagnostic.cjs",
          "snippets-memory-input.cjs",
          "snippets-windows-readiness.cjs",
          "snippets-windows-input.cjs",
          "snippets-windows-input.ps1",
          "extension-composition-launch.cjs",
          "snippets-quartz.cjs",
          "snippets-quartz.swift",
        ])
          await cp(path.join("test/fixtures", name), path.join(root, name));
        if (windows) {
          await mkdir(path.dirname(inputMarker), { recursive: true });
          await build({
            entryPoints: ["test/fixtures/native-fixture-processes.ts"],
            outfile: path.join(root, "fixture-processes.cjs"),
            bundle: true,
            platform: "node",
            format: "cjs",
            logLevel: "silent",
          });
        }
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({ type: "module", main: "main.mjs", version }),
        );
        await writeFile(
          path.join(root, "fixture.json"),
          JSON.stringify({
            source: process.cwd(),
            hostVersion: version,
            entry: values.ENTRY,
            archive: values.ARCHIVE,
            quartzTool,
            evidence,
            ...(insertDiagnostic === "1" ? { insertDiagnostic: true } : {}),
            ...(captureChildInput ? { childInputCapture: true } : {}),
            ...(memoryInput ? { memoryInput } : {}),
            ...(readinessDiagnostic === "1"
              ? { readinessDiagnostic: true }
              : {}),
            ...(windows ? { inputMarker } : {}),
          }),
        );
      },
    }).catch(async (error: unknown) => {
      // Runner owns cleanup/retention only after preparation actually begins.
      if (!preparationOwned) await rm(root, { recursive: true, force: true });
      throw error;
    });
    if (evidence)
      await writeFile(
        path.join(evidence, "supervisor.json"),
        JSON.stringify(result, null, 2),
      );
    expect(
      result,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
      cleanupAssistance: "none",
    });
    if (windows) {
      const launches = result.stdout
        .split("\n")
        .filter((line) => line.startsWith("COMPOSITION_LAUNCH_RESULT:"));
      expect(launches).toHaveLength(1);
      expect(
        JSON.parse(launches[0]!.slice("COMPOSITION_LAUNCH_RESULT:".length)),
      ).toEqual({
        exitCode: 0,
        signal: null,
        exited: true,
        closed: true,
        stdoutEnded: true,
        stderrEnded: true,
        truncated: false,
      });
    }
    expect(result.stdout.split("\n")).toContain(
      "SNIPPETS_SOURCE_HOST:" + JSON.stringify({ version }),
    );
    if (memoryInput) {
      const diagnostic = JSON.parse(
        await readFile(path.join(evidence!, "memory-result.json"), "utf8"),
      ) as import("../fixtures/snippets-memory-input.cjs").MemoryResult;
      const lifecycle = JSON.parse(
        await readFile(path.join(evidence!, "memory-lifecycle.json"), "utf8"),
      ) as { errors: string[] };
      expect(diagnostic.collection.complete).toBe(true);
      expect(["receipt", "timeout"]).toContain(diagnostic.initial.kind);
      expect(lifecycle.errors).toEqual([]);
      expect(
        result.stdout
          .split("\n")
          .filter((line) => line.startsWith("SNIPPETS_PACKAGED_RESULT:")),
      ).toEqual([]);
      assert.equal(digest(await readFile(values.ENTRY)), entrySha256);
      assert.equal(
        digest(await readFile(values.ARCHIVE)),
        values.ARCHIVE_SHA256,
      );
      return; // Diagnostic completion is never full source qualification.
    }
    const receipts = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("SNIPPETS_PACKAGED_RESULT:"));
    expect(
      receipts,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toHaveLength(1);
    expect(
      JSON.parse(receipts[0]!.slice("SNIPPETS_PACKAGED_RESULT:".length)),
    ).toEqual({
      checks: [
        "absent-package-management-no-activation",
        "selected-visible-toggle-and-header-close-destroy-fresh-view-same-backend-catalog-PTY",
        "ordinary-archive-trust-enabled-activation",
        "explicit-hide-independent-panel-toggle-retains-exact-view-query",
        "exact-insert-run-native-enter-repeat-release",
        "preview-overrides-both-intents-cancel-restores-focus",
        "retained-search-hide-reactivate",
        "live-en-US-pt-BR-retained-query",
        "disabled-package-management-no-enable",
        "disable-uninstall-unchanged-catalog-live-surface-pty",
      ],
      archiveSha256: values.ARCHIVE_SHA256,
      approvals: 1,
      input:
        process.platform === "darwin"
          ? "synthetic Quartz session input; tagged OS release and held-state observation; controlled native consent; production macOS ARM64 composition"
          : windows
            ? "synthetic Windows SendInput; independently observed held/released state; controlled native consent and ConPTY probe; production Windows ARM64 composition"
            : `synthetic Chromium/X11; controlled native consent; production Linux ${process.arch === "arm64" ? "ARM64" : "x64"} composition`,
    });
    assert.equal(
      digest(await readFile(values.ENTRY)),
      entrySha256,
      "qualification entry unchanged",
    );
    assert.equal(
      digest(await readFile(values.ARCHIVE)),
      values.ARCHIVE_SHA256,
      "archive unchanged",
    );
  },
);
