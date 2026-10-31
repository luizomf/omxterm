import { randomUUID } from "node:crypto";
import { valid, validRange, gt } from "semver";
import { packageCompatible } from "../installed-packages/compatibility.js";
import {
  isRecord,
  validId,
  PACKAGE_LIMITS,
  type PackageRuntime,
} from "../installed-packages/archive";
import type { CatalogCard, CatalogSnapshot } from "../shared/extensions";
import { downloadExtension, extensionDownloadUrl } from "./extension-download";

export const OFFICIAL_CATALOG_URL =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
export const MACOS_OFFICIAL_CATALOG_URL =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json";
export const CATALOG_BYTES = 256 * 1024;
export type CatalogRelease = {
  id: string;
  name: string;
  description: string;
  version: string;
  engines: { omxterm: string; api: string };
  targets: string[];
  archive: { url: string; sha256: string; bytes: number };
  sourceCommit: string;
  releaseUrl: string;
};
export class CatalogError extends Error {
  constructor(
    readonly code:
      | "invalid-catalog"
      | "catalog-mismatch"
      | "catalog-selection"
      | "incompatible",
  ) {
    super(code);
  }
}
function exact(
  value: unknown,
  fields: string[],
): value is Record<string, unknown> {
  return (
    isRecord(value) && Object.keys(value).sort().join() === fields.sort().join()
  );
}
function text(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
function projectReleaseUrl(value: unknown, asset: boolean): boolean {
  if (!text(value, 2048)) return false;
  try {
    const url = extensionDownloadUrl(value);
    return (
      url.origin === "https://github.com" &&
      !url.search &&
      (asset
        ? /^\/luizomf\/omxterm\/releases\/download\/ext-[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.omxext$/
        : /^\/luizomf\/omxterm\/releases\/tag\/ext-[A-Za-z0-9._-]+$/
      ).test(url.pathname)
    );
  } catch {
    return false;
  }
}
function validEngines(value: unknown): boolean {
  return (
    exact(value, ["omxterm", "api"]) &&
    text(value.omxterm, 256) &&
    text(value.api, 256) &&
    !!validRange(value.omxterm) &&
    !!validRange(value.api)
  );
}
function validTargets(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 5 &&
    new Set(value).size === value.length &&
    value.every(
      (target: unknown) =>
        typeof target === "string" &&
        [
          "linux-arm64",
          "linux-x64",
          "darwin-arm64",
          "win32-arm64",
          "win32-x64",
        ].includes(target),
    )
  );
}
function validArchive(value: unknown): boolean {
  return (
    exact(value, ["url", "sha256", "bytes"]) &&
    projectReleaseUrl(value.url, true) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    value.bytes <= PACKAGE_LIMITS.archiveBytes
  );
}
export function parseCatalog(bytes: Buffer): CatalogRelease[] {
  try {
    if (!bytes.length || bytes.length > CATALOG_BYTES) throw new Error();
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      !exact(value, ["schemaVersion", "entries"]) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > 100
    )
      throw new Error();
    const ids = new Set<string>();
    for (const entry of value.entries as unknown[]) {
      if (
        !exact(entry, [
          "id",
          "name",
          "description",
          "version",
          "engines",
          "targets",
          "archive",
          "sourceCommit",
          "releaseUrl",
        ]) ||
        !validId(entry.id) ||
        ids.has(entry.id) ||
        !text(entry.name, 128) ||
        !text(entry.description, 1024) ||
        !text(entry.version, 128) ||
        !valid(entry.version) ||
        !validEngines(entry.engines) ||
        !validTargets(entry.targets) ||
        !validArchive(entry.archive) ||
        typeof entry.sourceCommit !== "string" ||
        !/^[a-f0-9]{40}$/.test(entry.sourceCommit) ||
        !projectReleaseUrl(entry.releaseUrl, false)
      )
        throw new Error();
      if (
        new URL(
          (entry.archive as CatalogRelease["archive"]).url,
        ).pathname.split("/")[5] !==
        new URL(entry.releaseUrl as string).pathname.split("/")[5]
      )
        throw new Error();
      ids.add(entry.id);
    }
    return value.entries as CatalogRelease[];
  } catch {
    throw new CatalogError("invalid-catalog");
  }
}
export function catalogCompatible(
  release: CatalogRelease,
  runtime: PackageRuntime,
  target: string,
): boolean {
  return (
    release.targets.includes(target) && packageCompatible(release, runtime)
  );
}
export function catalogAction(
  release: CatalogRelease,
  installed?: { version: string | null; digest: string | null },
): CatalogCard["action"] {
  if (!installed?.digest || !installed.version) return "install";
  if (
    installed.version === release.version &&
    installed.digest === release.archive.sha256
  )
    return "reinstall";
  return gt(release.version, installed.version) ? "update" : "replace";
}

/** Last successful bytes live only in main memory. Loading never mutates a
 * captured selection; a refreshed snapshot invalidates only future selection. */
export function createExtensionCatalog(
  runtime: PackageRuntime,
  target: string,
) {
  const url =
    target === "darwin-arm64"
      ? MACOS_OFFICIAL_CATALOG_URL
      : OFFICIAL_CATALOG_URL;
  let entries: { selection: string; release: CatalogRelease }[] | undefined;
  let stale = false;
  let revision = 0;
  return {
    async refresh(signal: AbortSignal) {
      const current = ++revision;
      try {
        const releases = parseCatalog(
          await downloadExtension(url, signal, CATALOG_BYTES),
        );
        if (signal.aborted || current !== revision)
          throw new CatalogError("catalog-selection");
        entries = releases.map((release) => ({
          selection: randomUUID(),
          release,
        }));
        stale = false;
      } catch (error) {
        if (current === revision) stale = true;
        throw error;
      }
    },
    snapshot(
      installed: {
        id: string;
        manifest?: { version: string } | null | undefined;
        digest: string | null;
      }[],
    ): CatalogSnapshot {
      return {
        loaded: entries !== undefined,
        stale,
        entries: (entries ?? []).map(({ selection, release }) => {
          const existing = installed.find((entry) => entry.id === release.id);
          return {
            selection,
            id: release.id,
            name: release.name,
            description: release.description,
            version: release.version,
            installedVersion: existing?.manifest?.version ?? null,
            compatible: catalogCompatible(release, runtime, target),
            action: catalogAction(
              release,
              existing
                ? {
                    version: existing.manifest?.version ?? null,
                    digest: existing.digest,
                  }
                : undefined,
            ),
          };
        }),
      };
    },
    select(selection: string): CatalogRelease {
      const entry = entries?.find((entry) => entry.selection === selection);
      if (!entry) throw new CatalogError("catalog-selection");
      if (!catalogCompatible(entry.release, runtime, target))
        throw new CatalogError("incompatible");
      return structuredClone(entry.release);
    },
  };
}
