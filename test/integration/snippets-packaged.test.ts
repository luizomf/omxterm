import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const prefix = "OMXTERM_SNIPPETS_PACKAGED_";
const names = ["ENTRY", "ARCHIVE", "ARCHIVE_SHA256"] as const;
const enabled =
  names.some((name) => process.env[prefix + name] !== undefined) ||
  process.env.OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL !== undefined;
const executable = createRequire(import.meta.url)("electron") as string;

// Opt-in on an assigned disposable Linux or macOS ARM64 desktop. ENTRY uses unchanged
// production composition in an isolated output with normal shutdown. This is
// installed-package evidence, not publication or physical-keyboard qualification.
it.skipIf(!enabled)(
  "qualifies an ordinarily installed Snippets archive with a live Surface and PTY",
  { timeout: 150_000 },
  async (testContext) => {
    assert.ok(["linux", "darwin"].includes(process.platform));
    assert.equal(process.arch, "arm64");
    assert.equal(process.env.OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE, undefined);
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
    if (evidence) {
      assert.ok(path.isAbsolute(evidence));
      await mkdir(evidence, { recursive: true });
    }
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-snippets-packaged-"),
    );
    let preparationOwned = false;
    const result = await runNativeFixture({
      executable,
      args: [
        ...(process.platform === "linux"
          ? [
              "--no-sandbox",
              "--ozone-platform=x11",
              "--enable-unsafe-swiftshader",
              "--use-gl=angle",
              "--use-angle=swiftshader",
            ]
          : []),
        root,
        "-e",
        "/bin/sh",
        "-i",
      ],
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
          "snippets-catalog.json",
          "snippets-quartz.cjs",
          "snippets-quartz.swift",
        ])
          await cp(path.join("test/fixtures", name), path.join(root, name));
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
    });
    expect(result.stdout.split("\n")).toContain(
      "SNIPPETS_SOURCE_HOST:" + JSON.stringify({ version }),
    );
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
        "ordinary-archive-trust-enabled-activation",
        "compatibility-toggle-single-retained-view",
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
          : "synthetic Chromium/X11; controlled native consent; production Linux ARM64 composition",
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
