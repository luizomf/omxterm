import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readRepositoryFile = (file: string) =>
  readFileSync(path.join(repositoryRoot, file), "utf8");

const packageMetadata = JSON.parse(readRepositoryFile("package.json")) as {
  name: string;
  version: string;
};
const lockMetadata = JSON.parse(readRepositoryFile("package-lock.json")) as {
  version: string;
  packages: Record<string, { version?: string }>;
};
const builderConfiguration = readRepositoryFile("electron-builder.yml");

function builderValue(name: string): string {
  const match = builderConfiguration.match(new RegExp(`^${name}: (.+)$`, "mu"));
  const value = match?.[1];
  if (!value) throw new Error(`Missing ${name} in electron-builder.yml`);
  return value;
}

describe("release version consistency", () => {
  it("uses the selected version in npm package metadata", () => {
    expect(packageMetadata.version).toMatch(/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/u);
    expect(lockMetadata.version).toBe(packageMetadata.version);
    expect(lockMetadata.packages[""]?.version).toBe(packageMetadata.version);
  });

  it("requires a complete ad-hoc macOS application seal", () => {
    expect(builderConfiguration).toMatch(/^  identity: "-"$/mu);
    expect(builderConfiguration).toMatch(/^  hardenedRuntime: false$/mu);
  });

  // x64 AppImage, DEB and RPM names use distribution architecture names; see
  // linux-package-assets.test.ts for those.
  it.each([
    ["DMG", "dmg", "arm64"],
    ["DMG", "dmg", "x64"],
    ["AppImage", "AppImage", "arm64"],
    ["NSIS", "exe", "arm64"],
    ["NSIS", "exe", "x64"],
  ])(
    "derives the exact %s %s artifact and checksum names for %s from builder metadata",
    (_format, extension, arch) => {
      const expectedArtifactName = `OMXTerm-${packageMetadata.version}-${arch}.${extension}`;
      const artifactName = builderValue("artifactName")
        .replace("${productName}", builderValue("productName"))
        .replace("${version}", packageMetadata.version)
        .replace("${arch}", arch)
        .replace("${ext}", extension);

      expect(packageMetadata.name).toBe("omxterm");
      expect(artifactName).toBe(expectedArtifactName);
      expect(`${artifactName}.sha256`).toBe(`${expectedArtifactName}.sha256`);
    },
  );
});
