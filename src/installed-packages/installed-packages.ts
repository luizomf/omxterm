import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";
import {
  checkCompatibility,
  extractPackage,
  isRecord,
  PackageError,
  readBoundedFile,
  PACKAGE_LIMITS,
  syncDirectory,
  validId,
  type PackageManifest,
  type PackageRuntime,
} from "./archive.js";
import type { LeaseAdapter, VersionLease } from "./native-leases.js";
import {
  parseRegistry,
  REGISTRY_BYTES,
  MAX_INSTALLATIONS,
  withCleanup,
  type Publication,
  type Registry,
  type Installation,
} from "./registry.js";
import { collectPackages, type CleanupResult } from "./collection.js";
export type { Installation } from "./registry.js";
export type { CleanupResult } from "./collection.js";
export {
  PackageError,
  type PackageManifest,
  type PackageRuntime,
} from "./archive.js";
export {
  createNativeLeaseAdapter,
  type LeaseAdapter,
  type VersionLease,
} from "./native-leases.js";

export type VersionSelection = {
  id: string;
  generation: number;
  digest: string;
};
export type OpenVersion = VersionSelection & {
  directory: string;
  manifest: PackageManifest;
  revalidate(): Promise<boolean>;
  release(): Promise<void>;
};
const INITIALIZED = "installed-packages-v1\n";
function nextGeneration(entry?: Installation): number {
  const next = (entry?.generation ?? 0) + 1;
  if (!Number.isSafeInteger(next)) throw new PackageError("invalid-store");
  return next;
}
async function directory(file: string): Promise<void> {
  const stat = await lstat(file);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new PackageError("invalid-store");
}
async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}
async function onlyEntries(file: string, allowed: string[]): Promise<boolean> {
  const handle = await opendir(file);
  for await (const entry of handle)
    if (!allowed.includes(entry.name)) return false;
  return true;
}

/** Internal installation foundation. No extension execution or application IPC. */
export class InstalledPackages {
  private active = 0;
  private cleanupOffset = 0;
  private constructor(
    private readonly root: string,
    private readonly runtime: PackageRuntime,
    private readonly leases: LeaseAdapter,
  ) {}

  static async open(options: {
    root: string;
    runtime: PackageRuntime;
    leases: LeaseAdapter;
  }): Promise<InstalledPackages> {
    if (
      !path.isAbsolute(options.root) ||
      !valid(options.runtime.appVersion) ||
      !valid(options.runtime.apiVersion)
    )
      throw new PackageError("invalid-store");
    await mkdir(options.root, { recursive: true, mode: 0o700 });
    // Canonical aliases share permanent sidecars. Never replace a live namespace.
    const root = await realpath(options.root);
    await directory(root);
    for (const name of ["locks", "versions", "staging", "garbage"]) {
      const target = path.join(root, name);
      await mkdir(target, { recursive: true, mode: 0o700 });
      await directory(target);
    }
    const store = new InstalledPackages(
      root,
      { ...options.runtime },
      options.leases,
    );
    const publication = { attempted: false };
    await store.writer(() => store.initialize(publication), publication);
    return store;
  }
  private async initialize(publication: Publication): Promise<void> {
    const guard = path.join(this.root, "initialized");
    if (await exists(guard)) {
      if ((await readBoundedFile(guard, 64)).toString("utf8") !== INITIALIZED)
        throw new PackageError("invalid-store");
      await this.readRegistry();
      return;
    }
    if (
      !(await onlyEntries(this.root, [
        "locks",
        "versions",
        "staging",
        "garbage",
      ])) ||
      !(await onlyEntries(path.join(this.root, "locks"), ["writer.lock"]))
    )
      throw new PackageError("invalid-store");
    for (const name of ["versions", "staging", "garbage"])
      if (!(await onlyEntries(path.join(this.root, name), [])))
        throw new PackageError("invalid-store");
    // Permanent initialization witness precedes publication. Missing metadata
    // after this point is a targeted error, never guessed generation reset.
    const marker = await open(guard, "wx", 0o600);
    await withCleanup(async () => {
      await marker.writeFile(INITIALIZED);
      await marker.sync();
    }, [() => marker.close()]);
    await syncDirectory(this.root);
    await this.publish({ format: 1, installations: [] }, publication);
  }
  private get registryPath(): string {
    return path.join(this.root, "registry.json");
  }
  private lock(key: string, exclusive: boolean): Promise<VersionLease | null> {
    return this.leases.tryAcquire(
      path.join(this.root, "locks", `${key}.lock`),
      exclusive,
    );
  }
  private async checkRoot(): Promise<void> {
    for (const name of ["", "locks", "versions", "staging", "garbage"])
      await directory(path.join(this.root, name));
  }
  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 32) {
      console.error("[DEBUG-741-lock] capacity", process.pid);
      throw new PackageError("busy");
    }
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
  private async writer<T>(
    operation: () => Promise<T>,
    publication?: Publication,
    label = "writer",
  ): Promise<T> {
    await this.checkRoot();
    // [DEBUG-741-lock] Temporary metadata-only cross-process contention probe.
    const trace = (phase: string) =>
      console.error(
        "[DEBUG-741-lock]",
        JSON.stringify({ pid: process.pid, label, phase }),
      );
    trace("acquire");
    const lease = await this.lock("writer", true);
    trace(lease ? "acquired" : "busy");
    if (!lease) throw new PackageError("busy");
    return withCleanup(
      operation,
      [
        async () => {
          await lease.release();
          trace("released");
        },
      ],
      publication,
    );
  }
  private async readRegistry(): Promise<Registry> {
    try {
      return parseRegistry(
        JSON.parse(
          (await readBoundedFile(this.registryPath, REGISTRY_BYTES)).toString(
            "utf8",
          ),
        ),
      );
    } catch {
      throw new PackageError("invalid-store");
    }
  }
  private async publish(
    registry: Registry,
    publication: Publication,
  ): Promise<void> {
    const bytes = JSON.stringify(registry);
    if (
      Buffer.byteLength(bytes) > REGISTRY_BYTES ||
      registry.installations.length > MAX_INSTALLATIONS
    )
      throw new PackageError("invalid-store");
    const temporary = path.join(this.root, `registry-${randomUUID()}.tmp`);
    await withCleanup(
      async () => {
        const file = await open(temporary, "wx", 0o600);
        await withCleanup(async () => {
          await file.writeFile(bytes);
          await file.sync();
        }, [() => file.close()]);
        publication.attempted = true;
        try {
          await rename(temporary, this.registryPath);
          // Windows directory durability remains unqualified. POSIX flush failure
          // after replacement is unknown, not permission to replay a mutation.
          await syncDirectory(this.root);
        } catch {
          throw new PackageError("outcome-unknown");
        }
      },
      [() => rm(temporary, { force: true })],
      publication,
    );
  }
  private entry(
    registry: Registry,
    id: string,
    expected: number,
  ): Installation | undefined {
    if (!validId(id) || !Number.isSafeInteger(expected) || expected < 0)
      throw new PackageError("conflict");
    const current = registry.installations.find((entry) => entry.id === id);
    if ((current?.generation ?? 0) !== expected)
      throw new PackageError("conflict");
    return current;
  }

  snapshot(): Promise<Installation[]> {
    return this.bounded(() =>
      this.writer(async () => (await this.readRegistry()).installations),
    );
  }
  install(
    archive: string | Buffer,
    options: { expectedGeneration: number; enabled: boolean },
  ): Promise<Installation> {
    if (
      Buffer.isBuffer(archive) &&
      archive.length > PACKAGE_LIMITS.archiveBytes
    )
      return Promise.reject(new PackageError("invalid-package"));
    const captured = Buffer.isBuffer(archive) ? Buffer.from(archive) : archive;
    const expectedGeneration = options.expectedGeneration;
    const enabled = options.enabled;
    return this.bounded(async () => {
      if (typeof enabled !== "boolean")
        throw new PackageError("invalid-package");
      await this.checkRoot();
      const stageId = randomUUID();
      const stage = path.join(this.root, "staging", stageId);
      const pin = await this.lock(`stage-${stageId}`, false);
      if (!pin) throw new PackageError("busy");
      const publication = { attempted: false };
      let created = false;
      return withCleanup(
        async () => {
          await mkdir(stage, { mode: 0o700 });
          created = true;
          const { manifest, digest } = await extractPackage(
            captured,
            stage,
            this.runtime,
          );
          const marker = JSON.stringify({ digest, manifest });
          const metadata = await open(
            path.join(stage, ".omxterm-install.json"),
            "wx",
            0o600,
          );
          await withCleanup(async () => {
            await metadata.writeFile(marker);
            await metadata.sync();
          }, [() => metadata.close()]);
          await syncDirectory(stage);
          return this.writer(async () => {
            const registry = await this.readRegistry();
            const old = this.entry(registry, manifest.id, expectedGeneration);
            const version = path.join(this.root, "versions", digest);
            if (await exists(version)) {
              await directory(version);
              const existing = await readBoundedFile(
                path.join(version, ".omxterm-install.json"),
                128 * 1024,
              );
              if (existing.toString("utf8") !== marker)
                throw new PackageError("invalid-store");
            } else {
              // All managed publishers/collectors use writer exclusion. This is
              // not a generic no-replace filesystem operation for arbitrary paths.
              await rename(stage, version);
              await syncDirectory(path.join(this.root, "versions"));
              await syncDirectory(path.join(this.root, "staging"));
            }
            const installed: Installation = {
              id: manifest.id,
              generation: nextGeneration(old),
              digest,
              enabled,
              manifest,
            };
            registry.installations = registry.installations.filter(
              (entry) => entry.id !== manifest.id,
            );
            registry.installations.push(installed);
            await this.publish(registry, publication);
            return installed;
          }, publication);
        },
        [
          async () => {
            if (created) await rm(stage, { recursive: true, force: true });
          },
          () => pin.release(),
        ],
        publication,
      );
    });
  }
  setEnabled(
    id: string,
    expectedGeneration: number,
    enabled: boolean,
  ): Promise<Installation> {
    return this.change(id, expectedGeneration, enabled);
  }
  uninstall(id: string, expectedGeneration: number): Promise<Installation> {
    return this.change(id, expectedGeneration, null);
  }
  private change(
    id: string,
    expectedGeneration: number,
    enabled: boolean | null,
  ): Promise<Installation> {
    const publication = { attempted: false };
    return this.bounded(() =>
      this.writer(async () => {
        const registry = await this.readRegistry();
        const old = this.entry(registry, id, expectedGeneration);
        if (!old?.digest || (enabled !== null && typeof enabled !== "boolean"))
          throw new PackageError("unavailable");
        const entry: Installation =
          enabled === null
            ? {
                id,
                generation: nextGeneration(old),
                digest: null,
                enabled: false,
                manifest: null,
              }
            : { ...old, generation: nextGeneration(old), enabled };
        registry.installations = registry.installations.map((current) =>
          current.id === id ? entry : current,
        );
        await this.publish(registry, publication);
        return entry;
      }, publication),
    );
  }

  openVersion(id: string, expected?: VersionSelection): Promise<OpenVersion> {
    return this.bounded(async () => {
      let opened: OpenVersion | undefined;
      try {
        return await this.writer(async () => {
          const entry = (await this.readRegistry()).installations.find(
            (entry) => entry.id === id,
          );
          if (
            !entry?.enabled ||
            !entry.digest ||
            !entry.manifest ||
            (expected &&
              (expected.id !== id ||
                expected.generation !== entry.generation ||
                expected.digest !== entry.digest))
          )
            throw new PackageError("unavailable");
          checkCompatibility(entry.manifest, this.runtime);
          const pin = await this.lock(`version-${entry.digest}`, false);
          if (!pin) throw new PackageError("busy");
          let released = false;
          try {
            const version = path.join(this.root, "versions", entry.digest);
            await directory(version);
            const marker = JSON.parse(
              (
                await readBoundedFile(
                  path.join(version, ".omxterm-install.json"),
                  128 * 1024,
                )
              ).toString("utf8"),
            ) as unknown;
            if (
              !isRecord(marker) ||
              marker.digest !== entry.digest ||
              JSON.stringify(marker.manifest) !== JSON.stringify(entry.manifest)
            )
              throw new PackageError("invalid-store");
            opened = {
              id,
              generation: entry.generation,
              digest: entry.digest,
              directory: version,
              manifest: entry.manifest,
              release: async () => {
                released = true;
                await pin.release();
              },
              revalidate: () =>
                this.bounded(() =>
                  this.writer(
                    async () => {
                      if (released) return false;
                      const current = (
                        await this.readRegistry()
                      ).installations.find((item) => item.id === id);
                      return (
                        current?.enabled === true &&
                        current.generation === entry.generation &&
                        current.digest === entry.digest
                      );
                    },
                    undefined,
                    "revalidate",
                  ),
                ),
            };
            return opened;
          } catch (error) {
            return withCleanup(async () => {
              throw error;
            }, [() => pin.release()]);
          }
        });
      } catch (error) {
        return withCleanup(async () => {
          throw error;
        }, [
          async () => {
            await opened?.release();
          },
        ]);
      }
    });
  }
  collect(): Promise<CleanupResult> {
    return this.bounded(async () => {
      await this.checkRoot();
      const { result, nextOffset } = await collectPackages(
        this.root,
        this.leases,
        (operation) =>
          this.writer(async () =>
            operation(
              new Set(
                (await this.readRegistry()).installations.map(
                  (entry) => entry.digest,
                ),
              ),
            ),
          ),
        this.cleanupOffset,
      );
      this.cleanupOffset = nextOffset;
      return result;
    });
  }
}
