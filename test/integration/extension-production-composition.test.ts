import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { compositionPackage } from "../fixtures/extension-composition-package";

const enabled = process.env.OMXTERM_EXTENSION_COMPOSITION === "1";
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

it.skipIf(!enabled)(
  "qualifies production composition with a real installed package and joined Quit",
  { timeout: 150_000 },
  async (testContext) => {
    assert.ok(
      (process.platform === "darwin" && process.arch === "arm64") ||
        (process.platform === "linux" && process.arch === "x64"),
    );
    const optionalSnippets = process.platform === "darwin";
    const executable = createRequire(import.meta.url)("electron") as string;
    const entry = path.resolve("dist/main/index.js");
    const entrySha256 = digest(await readFile(entry));
    const { version } = JSON.parse(await readFile("package.json", "utf8")) as {
      version: string;
    };
    const bytes = compositionPackage();
    const archiveSha256 = digest(bytes);
    const evidence = process.env.OMXTERM_EXTENSION_COMPOSITION_EVIDENCE;
    if (evidence) {
      assert.ok(path.isAbsolute(evidence));
      await mkdir(evidence, { recursive: true });
      await writeFile(path.join(evidence, "composition.omxext"), bytes);
    }
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-extension-composition-"),
    );
    let preparationOwned = false;
    const result = await runNativeFixture({
      executable,
      args: [
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--ozone-platform=x11"]
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
          "test/fixtures/extension-composition.mjs",
          path.join(root, "main.mjs"),
        );
        for (const name of [
          "extension-composition-scenario.cjs",
          "snippets-observer.cjs",
        ])
          await cp(path.join("test/fixtures", name), path.join(root, name));
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({ type: "module", main: "main.mjs", version }),
        );
        const archive = path.join(root, "composition.omxext");
        await writeFile(archive, bytes);
        await writeFile(
          path.join(root, "fixture.json"),
          JSON.stringify({
            source: process.cwd(),
            entry,
            archive,
            evidence,
            optionalSnippets,
          }),
        );
      },
    }).catch(async (error: unknown) => {
      // Before prepare is called, this fresh directory remains ours. Once
      // preparation starts, only the runner may settle or retain its scope.
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
    const receipts = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("EXTENSION_COMPOSITION_RESULT:"));
    expect(receipts).toHaveLength(1);
    expect(
      JSON.parse(receipts[0]!.slice("EXTENSION_COMPOSITION_RESULT:".length)),
    ).toEqual({
      checks: [
        optionalSnippets
          ? "optional-snippets-management-no-activation"
          : "built-in-snippets-preserved-no-activation",
        "ordinary-install-trust-dormancy",
        "explicit-activation-hosted-backend-and-editing",
        "disable-uninstall-retained-surface-pty",
        "ordinary-quit-joins-active-backend-and-pty",
      ],
      approvals: 2,
      archiveSha256,
    });
    assert.equal(
      digest(await readFile(entry)),
      entrySha256,
      "ordinary build unchanged",
    );
  },
);
