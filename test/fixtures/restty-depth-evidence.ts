import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect } from "vitest";
import type { depthRenderingFixture } from "./restty-depth-renderer";

export type DepthPhase = Awaited<
  ReturnType<Awaited<ReturnType<typeof depthRenderingFixture>>["phase"]>
>;

// Fixture-only reversal keeps the integrated hidden-rendering behavior identical.
export function depthExperimentSource(source: string): string {
  if (
    createHash("sha256").update(source).digest("hex") !==
    "3b1076d32880f0f28b8cbb465687825c4bb980d34d1af67862e23b5eda2871e3"
  )
    throw new Error("Unreviewed depth experiment runtime");
  const variant = process.env.OMXTERM_DEPTH_VARIANT;
  if (variant && variant !== "original" && variant !== "disabled")
    throw new Error("Unknown depth variant");
  if (variant !== "original") return source;
  const options = "{ antialias: false, alpha: true, depth: false }";
  if (source.split(options).length !== 2)
    throw new Error("Depth experiment seam drifted");
  return source.replace(options, "{ antialias: false, alpha: true }");
}

export async function verifyDepthEvidence(result: { depth: DepthPhase[] }) {
  if (process.env.OMXTERM_DEPTH_EVIDENCE) {
    const files = [
      "package-lock.json",
      "test/integration/restty-scrollback-rendering.test.ts",
      "test/fixtures/restty-depth-evidence.ts",
      "test/fixtures/restty-depth-renderer.ts",
      "test/fixtures/restty-scrollback-renderer.ts",
      "test/fixtures/restty-hidden-renderer.ts",
      "test/fixtures/restty-hidden-presentation.ts",
      "test/fixtures/restty-hidden-images.ts",
      "test/fixtures/restty-hidden-session.ts",
      "node_modules/restty/dist/chunk-c0rcpsc5.js",
    ];
    const hashes: Record<string, string> = {};
    for (const file of files)
      hashes[file] = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
    await writeFile(
      process.env.OMXTERM_DEPTH_EVIDENCE,
      JSON.stringify(
        {
          sourceBase: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          variant: process.env.OMXTERM_DEPTH_VARIANT ?? "production",
          architecture: process.arch,
          node: process.version,
          hashes,
          variantRuntimeSha256: createHash("sha256")
            .update(
              depthExperimentSource(
                await readFile(
                  "node_modules/restty/dist/chunk-c0rcpsc5.js",
                  "utf8",
                ),
              ),
            )
            .digest("hex"),
          result,
        },
        null,
        2,
      ) + "\n",
    );
  }
  expect(result.depth.map((phase) => phase.count)).toEqual([1, 3, 1]);
  expect(result.depth[2]!.closed).toEqual([false, true, true]);
  for (const phase of result.depth)
    for (const surface of phase.surfaces) {
      expect.soft(surface.foregroundPixels).toBeGreaterThan(0);
      expect.soft(surface.calls.drawArraysInstanced).toBeGreaterThan(0);
      expect.soft(surface.calls.bufferSubData).toBeGreaterThan(0);
      expect.soft(surface.calls.texImage2D).toBeGreaterThan(0);
      expect.soft(surface.depthTest).toBe(false);
      expect.soft(surface.framebufferIsDefault).toBe(true);
      expect.soft(surface.renderError).toBe(0);
      expect.soft(surface.glError).toBe(0);
      const hasDepth = process.env.OMXTERM_DEPTH_VARIANT === "original";
      expect.soft(surface.attributes?.depth).toBe(hasDepth);
      if (hasDepth) expect.soft(surface.depthBits).toBeGreaterThan(0);
      else {
        expect.soft(surface.depthBits).toBe(0);
        expect.soft(surface.depthAttachmentType).toBe(0);
        expect.soft(surface.depthAttachmentBits).toBeNull();
      }
    }
}
