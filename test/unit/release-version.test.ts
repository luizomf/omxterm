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
    expect(packageMetadata.version).toBe("0.2.0-dev.0");
    expect(lockMetadata.version).toBe(packageMetadata.version);
    expect(lockMetadata.packages[""]?.version).toBe(packageMetadata.version);
  });

  it("derives the exact DMG and checksum names from builder metadata", () => {
    const artifactName = builderValue("artifactName")
      .replace("${productName}", builderValue("productName"))
      .replace("${version}", packageMetadata.version)
      .replace("${arch}", "arm64")
      .replace("${ext}", "dmg");

    expect(packageMetadata.name).toBe("omxterm");
    expect(artifactName).toBe("OMXTerm-0.2.0-dev.0-arm64.dmg");
    expect(`${artifactName}.sha256`).toBe(
      "OMXTerm-0.2.0-dev.0-arm64.dmg.sha256",
    );
  });
});
