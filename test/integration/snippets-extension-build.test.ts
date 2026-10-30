import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildExtension } from "../../scripts/build-files-extension.mjs";
import {
  extractPackage,
  checkCompatibility,
} from "../../src/installed-packages/archive";

// Explicit headless maintainer toolchain check, not native qualification.
it.skipIf(process.env.OMXTERM_SNIPPETS_BUILD !== "1")(
  "builds a self-contained Snippets archive and preserves user catalog bytes",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-snippets-artifact-"),
    );
    try {
      const output = path.join(root, "snippets.omxext");
      const receipt = await buildExtension("snippets", output, "a".repeat(40));
      const bytes = await readFile(output);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(receipt.archive.sha256).toBe(digest);
      expect(receipt.qualification.status).toBe("not-run");
      const extracted = path.join(root, "extracted");
      await mkdir(extracted);
      const validated = await extractPackage(bytes, extracted, {
        appVersion: "0.24.0-dev.8",
        apiVersion: "0.1.0",
      });
      expect(validated).toEqual({ digest, manifest: receipt.manifest });
      expect(validated.manifest.capabilities).toEqual([
        "terminal.semanticInput.v1",
      ]);
      expect(() =>
        checkCompatibility(validated.manifest, {
          appVersion: "0.24.0-dev.7",
          apiVersion: "0.1.0",
        }),
      ).toThrow("incompatible");
      expect(
        await readFile(path.join(extracted, "licenses/yaml.txt"), "utf8"),
      ).toContain("Copyright Eemeli Aro");
      expect(
        await readFile(path.join(extracted, "snippets.css"), "utf8"),
      ).toContain(".snippets-view");
      const config = path.join(root, "config/omxterm");
      await mkdir(config, { recursive: true });
      const catalog = await readFile(
        path.join(extracted, "snippets.example.yaml"),
      );
      await writeFile(path.join(config, "snippets.yaml"), catalog);
      // Separate Node process outside the repository: bundled YAML must not rely
      // on ancestor node_modules or Electron, and the source file is read-only.
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
      import { pathToFileURL } from 'node:url';
      import path from 'node:path';
      const { activate } = await import(pathToFileURL(path.join(process.argv[1], 'backend.mjs')));
      const lifetime = new AbortController();
      const backend = activate({signal:lifetime.signal}, {environment:{XDG_CONFIG_HOME:process.argv[2]},homeDirectory:process.argv[3]});
      const reply = await backend.invoke({operation:'open',activation:'archive_test_0001'}, lifetime.signal);
      console.log(JSON.stringify(reply));
      backend.deactivate();
    `,
          extracted,
          path.join(root, "config"),
          root,
        ],
        { cwd: root, timeout: 10_000, env: { PATH: process.env.PATH } },
      );
      expect(JSON.parse(stdout)).toMatchObject({
        ok: true,
        total: 1,
        cursor: null,
        rows: [
          {
            name: "Print a message",
            body: "printf '%s\\n' \"Hello\"",
            execute: false,
          },
        ],
      });
      expect(await readFile(path.join(config, "snippets.yaml"))).toEqual(
        catalog,
      );
      await expect(
        buildExtension("snippets", output, "a".repeat(40)),
      ).rejects.toThrow();
      expect(await readFile(output)).toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
