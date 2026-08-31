import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../..");

interface PackageManifest {
  readonly dependencies: Readonly<Record<string, string>>;
}

interface PackageLock {
  readonly packages: Readonly<
    Record<string, { readonly version?: string } | undefined>
  >;
}

describe("xterm dependency contract", () => {
  it("pins the mutually compatible Kitty beta pair in manifest and lockfile", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as PackageManifest;
    const lock = JSON.parse(
      readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"),
    ) as PackageLock;
    const expected = {
      "@xterm/addon-image": "0.10.0-beta.301",
      "@xterm/xterm": "6.1.0-beta.304",
    } as const;

    for (const [dependency, version] of Object.entries(expected)) {
      expect(manifest.dependencies[dependency]).toBe(version);
      expect(lock.packages[`node_modules/${dependency}`]?.version).toBe(
        version,
      );
    }
  });
});
