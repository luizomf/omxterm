import type { PackageManifest } from "../src/installed-packages/archive.js";

export interface FilesBuildReceipt {
  format: 1;
  source: {
    commit: string;
    identity: "supplied-commit" | "clean-git-head";
    lockSha256: string;
  };
  tools: { node: string; esbuild: string; python: string };
  builder: { platform: string; arch: string };
  archive: { name: string; bytes: number; sha256: string };
  manifest: PackageManifest;
  qualification: {
    status: "not-run";
    intendedHost: string;
    target: "linux-arm64";
  };
}

export function buildExtension(
  name: "files" | "ssh" | "restoration" | "mirror-typing",
  output?: string,
  suppliedCommit?: string,
): Promise<FilesBuildReceipt>;

export function buildFilesExtension(
  output?: string,
  suppliedCommit?: string,
): Promise<FilesBuildReceipt>;
