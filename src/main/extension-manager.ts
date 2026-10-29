import {
  PackageError,
  type InstalledPackages,
  type OpenVersion,
  type VersionSelection,
} from "../installed-packages/installed-packages.js";
import type {
  Backend,
  ExtensionRuntime,
} from "../extension-runtime/runtime.js";
import type { Value } from "../extension-runtime/protocol.js";
import { createExtensionPackageTrust } from "./extension-package-trust.js";

type LocalState =
  "dormant" | "starting" | "active" | "stopping" | "failed" | "unknown";
export type ExtensionTarget = {
  owner: object;
  signal: AbortSignal;
  terminalDirectory: string | null;
};
export type ManagedViews = {
  open(): Promise<void>;
  retire(): Promise<{ status: "settled" | "failed" }>;
};
type Group = {
  id: string;
  target: ExtensionTarget;
  views: ManagedViews;
  abort: AbortController;
};
type Options = {
  packages: InstalledPackages;
  runtime: Pick<ExtensionRuntime, "activate" | "retire" | "dispose">;
  trust: ReturnType<typeof createExtensionPackageTrust>;
  // Synchronous transfer of the complete pin. Adapter must retain it until
  // native views AND resource reads settle, including failed opens.
  createViews(input: {
    pin: OpenVersion;
    target: ExtensionTarget;
    signal: AbortSignal;
    call(value: Value, signal: AbortSignal): Promise<Value>;
    admit(signal: AbortSignal, commit: () => void): Promise<void>;
    retired(): void;
  }): ManagedViews;
};
function viewRequests(
  pin: OpenVersion,
  backend: Backend,
  epoch: AbortSignal,
  alive: () => boolean,
) {
  const live = () => !epoch.aborted && alive();
  return {
    admit: coreAdmission(pin, () => live() && backend.state() === "active"),
    call: async (value: Value, signal: AbortSignal) => {
      if (!live()) throw new PackageError("unavailable");
      return backend.call(value, AbortSignal.any([signal, epoch]));
    },
  };
}

function coreAdmission(pin: OpenVersion, live: () => boolean) {
  return async (signal: AbortSignal, commit: () => void) => {
    if (signal.aborted || !live() || !(await pin.revalidate()))
      throw new PackageError("unavailable");
    // Store admission is point-in-time across instances. Local revocation
    // still wins until this synchronous core transfer.
    if (signal.aborted || !live()) throw new PackageError("unavailable");
    commit();
  };
}

function boundedSettlement(work: Promise<unknown>[]): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15_000);
    void Promise.allSettled(work).then((results) => {
      clearTimeout(timer);
      resolve(results.every((result) => result.status === "fulfilled"));
    });
  });
}

async function retireGroups(groups: Set<Group>, id?: string): Promise<boolean> {
  const selected = [...groups].filter(
    (group) => id === undefined || group.id === id,
  );
  for (const group of selected) group.abort.abort();
  const results = await Promise.all(
    selected.map(async (group) => {
      try {
        const result = await group.views.retire();
        if (result.status === "settled") groups.delete(group);
        return result.status === "settled";
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

/** One application owner for consent, generation admission, views and backends.
 * Settings/menu/fixture callers use this same interface, never a parallel store. */
export function createExtensionManager(options: Options) {
  const groups = new Set<Group>();
  const approvals = new Map<object, { token: string; id: string }>();
  const revisions = new Map<string, number>();
  const state = new Map<string, LocalState>();
  const backends = new Map<string, Backend>();
  const busy = new Set<string>();
  const opening = new Map<Promise<void>, string>();
  let pendingCleanup: boolean | undefined;
  let disposed = false;
  let disposal: Promise<boolean> | undefined;
  async function collect() {
    try {
      const cleanup = await options.packages.collect();
      pendingCleanup = cleanup.more || cleanup.pending.length > 0;
    } catch (error) {
      pendingCleanup = true;
      throw error;
    }
  }
  const revision = (id: string) => revisions.get(id) ?? 0;
  const alive = (id: string, captured: number, target: ExtensionTarget) =>
    !disposed &&
    !busy.has(id) &&
    revision(id) === captured &&
    !target.signal.aborted;
  async function start(
    id: string,
    target: ExtensionTarget,
    expected?: VersionSelection,
  ): Promise<void> {
    const captured = revision(id);
    if (!alive(id, captured, target)) throw new PackageError("unavailable");
    if (backends.get(id)?.state() !== "active") backends.delete(id);
    if (state.get(id) !== "unknown") state.set(id, "starting");
    let pin: OpenVersion | undefined;
    let backend: Backend;
    try {
      backend = await options.runtime.activate(id, expected);
      backends.set(id, backend);
      if (!alive(id, captured, target)) throw new PackageError("unavailable");
      pin = await options.packages.openVersion(id, backend.selection);
      if (
        !pin.manifest.view ||
        !alive(id, captured, target) ||
        !(await pin.revalidate())
      )
        throw new PackageError("unavailable");
      if (!alive(id, captured, target) || backend.signal.aborted)
        throw new PackageError("unavailable");
      // Each invocation has its own captured context and independent view pin.
      // Sharing the backend must not make a new tab inherit an older pane's cwd.
      {
        const abort = new AbortController();
        const ownerLost = AbortSignal.any([target.signal, backend.signal]);
        let group: Group;
        const lost = () => {
          abort.abort();
          void views.retire().then(
            (outcome) => {
              if (outcome.status === "settled") groups.delete(group);
              else state.set(id, "unknown");
            },
            () => state.set(id, "unknown"),
          );
        };
        const views = options.createViews({
          pin,
          ...viewRequests(
            pin,
            backend,
            AbortSignal.any([abort.signal, ownerLost]),
            () => alive(id, captured, target),
          ),
          target,
          signal: abort.signal,

          retired: () => {
            abort.abort();
            groups.delete(group);
            ownerLost.removeEventListener("abort", lost);
          },
        });
        pin = undefined; // ownership transferred; never released by both owners
        group = { id, target, views, abort };
        groups.add(group);
        ownerLost.addEventListener("abort", lost, { once: true });
        if (ownerLost.aborted || !alive(id, captured, target)) {
          lost();
          throw new PackageError("unavailable");
        }
        await views.open();
      }
      if (!alive(id, captured, target) || backend.signal.aborted)
        throw new PackageError("unavailable");
      if (state.get(id) !== "unknown") state.set(id, "active");
    } catch (error) {
      await pin?.release();
      if (alive(id, captured, target) && state.get(id) !== "unknown")
        state.set(id, "failed");
      throw error;
    }
  }
  async function manage<T>(id: string, publish: () => Promise<T>): Promise<T> {
    if (disposed || busy.has(id)) throw new PackageError("busy");
    busy.add(id);
    revisions.set(id, revision(id) + 1);
    state.set(id, "stopping");
    // Revocation is immediate, but publication remains the store's short
    // transaction. No lock is held over a child or browser retirement.
    for (const group of groups) if (group.id === id) group.abort.abort();
    let published: T;
    try {
      published = await publish();
    } catch (error) {
      state.set(id, "unknown");
      // Still retire invalidated local callbacks even when publication failed.
      try {
        await retireGroups(groups, id);
        await options.runtime.retire(id);
      } finally {
        busy.delete(id);
      }
      throw error;
    }
    try {
      const [views, backend, pending] = await Promise.all([
        retireGroups(groups, id),
        options.runtime.retire(id),
        boundedSettlement(
          [...opening]
            .filter(([, key]) => key === id)
            .map(([work]) => work.catch(() => {})),
        ),
      ]);
      if (!backend || backend.settled) backends.delete(id);
      state.set(
        id,
        views && (!backend || backend.settled) && pending
          ? "dormant"
          : "unknown",
      );
      await collect();
      return published;
    } catch {
      pendingCleanup = true;
      state.set(id, "unknown");
      throw new PackageError("outcome-unknown");
    } finally {
      busy.delete(id);
    }
  }
  function open(
    id: string,
    target: ExtensionTarget,
    expected?: VersionSelection,
  ): Promise<void> {
    if (opening.size + groups.size >= 32)
      return Promise.reject(new PackageError("busy"));
    const work = start(id, { ...target }, expected);
    opening.set(work, id);
    void work.then(
      () => opening.delete(work),
      () => opening.delete(work),
    );
    return work;
  }
  return {
    pendingCleanup: () => pendingCleanup,
    collect,
    async snapshot() {
      const installations = await options.packages.snapshot();
      return installations.map((entry) => ({
        ...entry,
        local: ["unknown", "stopping"].includes(state.get(entry.id) ?? "")
          ? state.get(entry.id)!
          : (backends.get(entry.id)?.state() ??
            state.get(entry.id) ??
            "dormant"),
        otherInstances: "unknown" as const,
      }));
    },
    async prepare(
      owner: object,
      filename: string | Buffer,
      expected?: Parameters<Options["trust"]["prepare"]>[2],
    ) {
      approvals.delete(owner);
      const preview = await options.trust.prepare(owner, filename, expected);
      approvals.set(owner, { token: preview.token, id: preview.manifest.id });
      return preview;
    },
    cancel(owner: object) {
      approvals.delete(owner);
      options.trust.cancel(owner);
    },
    approve(owner: object, token: string) {
      const approval = approvals.get(owner);
      if (!approval || approval.token !== token)
        return Promise.reject(new PackageError("unavailable"));
      approvals.delete(owner);
      return manage(approval.id, () => options.trust.approve(owner, token));
    },
    setEnabled(id: string, generation: number, enabled: boolean) {
      return manage(id, () =>
        options.packages.setEnabled(id, generation, enabled),
      );
    },
    uninstall(id: string, generation: number) {
      return manage(id, () => options.packages.uninstall(id, generation));
    },
    open,
    action(selection: VersionSelection) {
      const expected = { ...selection };
      const issued = revision(expected.id);
      return (target: ExtensionTarget) =>
        issued !== revision(expected.id)
          ? Promise.reject(new PackageError("unavailable"))
          : open(expected.id, target, expected);
    },
    dispose(): Promise<boolean> {
      if (disposal) return disposal;
      disposed = true;
      options.trust.dispose();
      approvals.clear();
      for (const group of groups) group.abort.abort();
      disposal = (async () => {
        const [views, backends, pending] = await Promise.all([
          retireGroups(groups),
          options.runtime.dispose(),
          boundedSettlement(
            [...opening.keys()].map((work) => work.catch(() => {})),
          ),
        ]);
        return views && pending && backends.every((backend) => backend.settled);
      })();
      return disposal;
    },
  };
}
