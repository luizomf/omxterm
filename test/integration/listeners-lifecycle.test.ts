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
const enabled = names.some((name) => process.env[prefix + name] !== undefined);
const executable = createRequire(import.meta.url)("electron") as string;

// Temporary #742 lifecycle-only probe. Reuses the explicit Snippets composition,
// ordinary management and joined supervisor, not the full Snippets input matrix.
it.skipIf(!enabled)(
  "observes listeners across three ordinary installation and retirement epochs",
  { timeout: 150_000 },
  async (testContext) => {
    assert.equal(process.platform, "linux");
    assert.equal(process.arch, "arm64");
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
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-listeners-lifecycle-"),
    );
    const evidence = process.env.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
    if (evidence) {
      assert.ok(path.isAbsolute(evidence));
      assert.ok(!evidence.startsWith(root + path.sep));
      await mkdir(evidence, { recursive: true });
    }
    let supervised = false;
    try {
      supervised = true;
      const result = await runNativeFixture({
        executable,
        args: [
          "--no-sandbox",
          "--ozone-platform=x11",
          "--enable-unsafe-swiftshader",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          root,
          "-e",
          "/bin/sh",
          "-i",
        ],
        root,
        timeout: 120_000,
        testContext,
        prepare: async () => {
          await cp(
            "test/fixtures/listeners-lifecycle.mjs",
            path.join(root, "main.mjs"),
          );
          await writeFile(
            path.join(root, "package.json"),
            JSON.stringify({ type: "module", main: "main.mjs" }),
          );
          await writeFile(
            path.join(root, "fixture.json"),
            JSON.stringify({
              source: process.cwd(),
              entry: values.ENTRY,
              archive: values.ARCHIVE,
              evidence,
            }),
          );
        },
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
      const receipts = result.stdout
        .split("\n")
        .filter((line) => line.startsWith("LISTENERS_LIFECYCLE_RESULT:"));
      expect(
        receipts,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toHaveLength(1);
      expect(
        JSON.parse(receipts[0]!.slice("LISTENERS_LIFECYCLE_RESULT:".length)),
      ).toEqual({
        checks: [
          "epoch-1-install-activate-disable-uninstall",
          "epoch-2-install-activate-disable-uninstall",
          "epoch-3-install-activate-disable-uninstall",
        ],
        archiveSha256: values.ARCHIVE_SHA256,
        approvals: 3,
        scope:
          "lifecycle-only; controlled consent; explicit qualification composition",
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
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
);
