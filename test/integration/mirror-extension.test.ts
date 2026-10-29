import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { productionFixtureArguments } from "../fixtures/supported-fixture-chromium-arguments";
import { prepareMirrorFixture } from "../fixtures/mirror-production-build";
import {
  assertMirrorReceipt,
  MIRROR_RESULT,
} from "../fixtures/mirror-native-contract";

// Explicit opt-in. A partial configuration fails; an unconfigured default skips.
const prefix = "OMXTERM_MIRROR_NATIVE_";
const names = [
  "SOURCE",
  "SOURCE_COMMIT",
  "ARCHIVE",
  "ARCHIVE_SHA256",
  "EVIDENCE",
] as const;
const enabled = names.some((name) => process.env[prefix + name] !== undefined);
it.skipIf(!enabled)(
  "qualifies installed Mirror Typing through production keyboard and real PTY fences",
  { timeout: 210_000 },
  async (testContext) => {
    assert.equal(process.platform, "linux");
    assert.equal(process.arch, "arm64");
    assert.notEqual(process.getuid?.(), 0);
    const values = Object.fromEntries(
      names.map((name) => {
        const value = process.env[prefix + name];
        assert.ok(value, `${prefix}${name} is required`);
        return [name, value];
      }),
    ) as Record<(typeof names)[number], string>;
    for (const name of ["SOURCE", "ARCHIVE", "EVIDENCE"] as const)
      assert.ok(path.isAbsolute(values[name]));
    await mkdir(values.EVIDENCE, { recursive: true });
    const evidence = await mkdtemp(path.join(values.EVIDENCE, "run-"));
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-mirror-production-"),
    );
    const executable = createRequire(path.join(values.SOURCE, "package.json"))(
      "electron",
    ) as string;
    const execution = await runNativeFixture({
      executable,
      args: productionFixtureArguments(root),
      root,
      timeout: 150_000,
      testContext,
      prepare: () =>
        prepareMirrorFixture(root, {
          source: values.SOURCE,
          sourceCommit: values.SOURCE_COMMIT,
          archive: values.ARCHIVE,
          archiveSha256: values.ARCHIVE_SHA256,
          evidence,
        }),
    });
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
    const lines = execution.stdout
      .split("\n")
      .filter((line) => line.startsWith(MIRROR_RESULT));
    expect(lines).toHaveLength(1);
    assertMirrorReceipt(JSON.parse(lines[0]!.slice(MIRROR_RESULT.length)));
  },
);
