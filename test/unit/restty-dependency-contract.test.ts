import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareResttyRuntime } from "../../scripts/prepare-restty-runtime.mjs";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(path.dirname(require.resolve("restty")));
const packagePath = path.join(packageRoot, "package.json");
const digest = (source: Buffer) =>
  createHash("sha256").update(source).digest("hex");

describe("Restty dependency contract", () => {
  it("pins Restty and its shaping input to the reviewed versions", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../..", "package.json"),
        "utf8",
      ),
    ) as { dependencies: Record<string, string> };
    const restty = JSON.parse(readFileSync(packagePath, "utf8")) as {
      version: string;
      dependencies: Record<string, string>;
    };

    expect(manifest.dependencies.restty).toBe("0.3.0");
    expect(restty.version).toBe("0.3.0");
    expect(restty.dependencies["text-shaper"]).toBe("0.1.28");
  });

  it("keeps the installed runtime at the reviewed corrected digest", async () => {
    await prepareResttyRuntime();
    await prepareResttyRuntime();

    expect(
      digest(readFileSync(path.join(packageRoot, "dist", "chunk-c0rcpsc5.js"))),
    ).toBe("8f9620d4c39b9e88bb149010e8aad24b0c35073373c2d8a66d78466ccbafec2a");
  });
});
