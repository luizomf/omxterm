export type FilesTreeRequest =
  | { operation: "list"; path: string }
  | { operation: "list-next" | "list-close"; cursor: string };

export type FilesTreeEntry = { name: string; kind: string; size: number };
export type FilesTreeReply = {
  ok: boolean;
  error?: string;
  directory?: string;
  cursor?: string | null;
  total?: number;
  truncated?: boolean;
  rows?: FilesTreeEntry[];
};

type ListingStatus = {
  loading: boolean;
  error: string | null;
  truncated: boolean;
  total: number | null;
};
export type FilesTreeRow = FilesTreeEntry &
  ListingStatus & { path: string; depth: number; expanded: boolean };
export type FilesTreeSnapshot = ListingStatus & {
  /** Requested path while navigating; canonical backend path after success. */
  root: string | null;
  /** Unlike loading (any visible listing), this describes only the root. */
  rootLoading: boolean;
  rows: FilesTreeRow[];
};
export type FilesTree = {
  navigate(path: string): Promise<void>;
  toggle(path: string): Promise<void>;
  refresh(): Promise<void>;
  snapshot(): FilesTreeSnapshot;
};

type Directory = ListingStatus & {
  path: string;
  children: Node[];
  revision: number;
  pending?: { generation: number; promise: Promise<boolean> } | undefined;
};
type Node = Directory & FilesTreeEntry & { expanded: boolean };
const join = (base: string, name: string) =>
  `${base.replace(/\/$/, "")}/${name}`;
const directory = (path: string): Directory => ({
  path,
  children: [],
  revision: 0,
  loading: false,
  error: null,
  truncated: false,
  total: null,
});

/**
 * Explicit snapshots only: no watchers, polling, retries, DOM or mutations.
 * Calls settle after their own reads/cleanup, even when superseded. Reads and
 * closes share one serial lane, so this tree occupies at most one backend slot.
 * A failed refresh retains previous rows with an explicit error; a failed later
 * page exposes the received prefix with an error. Collapsing drops all hidden
 * descendants, including their expansion state. Notifications are synchronous;
 * callers must not throw from onChange.
 */
export function createFilesTree(
  request: (value: FilesTreeRequest) => Promise<FilesTreeReply>,
  onChange: (snapshot: FilesTreeSnapshot) => void = () => {},
): FilesTree {
  let root: Directory | undefined;
  let generation = 0;
  let lane: Promise<unknown> = Promise.resolve();
  const nodes = new Map<string, Node>();

  function snapshot(): FilesTreeSnapshot {
    const rows: FilesTreeRow[] = [];
    // Iterative traversal also handles deeply expanded trees without recursion.
    const stack = (root?.children ?? [])
      .map((node) => ({ node, depth: 0 }))
      .reverse();
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      rows.push({
        path: node.path,
        name: node.name,
        kind: node.kind,
        size: node.size,
        depth,
        expanded: node.expanded,
        loading: node.loading,
        error: node.error,
        truncated: node.truncated,
        total: node.total,
      });
      if (node.expanded)
        for (let i = node.children.length - 1; i >= 0; i--)
          stack.push({ node: node.children[i]!, depth: depth + 1 });
    }
    return {
      root: root?.path ?? null,
      rootLoading: root?.loading ?? false,
      loading: !!root?.loading || rows.some((row) => row.loading),
      error: root?.error ?? null,
      truncated: root?.truncated ?? false,
      total: root?.total ?? null,
      rows,
    };
  }
  const publish = () => onChange(snapshot());
  async function send(value: FilesTreeRequest): Promise<FilesTreeReply> {
    try {
      return await request(value);
    } catch {
      return { ok: false, error: "outcome-unknown" };
    }
  }
  function discard(children: Node[]) {
    const stack = [...children];
    while (stack.length) {
      const node = stack.pop()!;
      stack.push(...node.children);
      nodes.delete(node.path);
      node.revision++;
      node.children = [];
    }
  }
  function reconcile(parent: Directory, entries: FilesTreeEntry[]) {
    const previous = new Map(parent.children.map((node) => [node.path, node]));
    parent.children = entries.map((entry) => {
      const path = join(parent.path, entry.name);
      let node = previous.get(path);
      previous.delete(path);
      if (node && node.kind !== entry.kind) {
        discard([node]);
        node = undefined;
      }
      node ??= { ...directory(path), ...entry, expanded: false };
      node.size = entry.size;
      nodes.set(path, node);
      return node;
    });
    discard([...previous.values()]);
  }
  function load(target: Directory): Promise<boolean> {
    if (target.pending?.generation === generation)
      return target.pending.promise;
    const current = generation;
    const revision = target.revision;
    const live = () =>
      current === generation &&
      revision === target.revision &&
      (root === target || nodes.get(target.path) === target);
    target.loading = true;
    target.error = null;
    const promise = lane.then(async () => {
      if (!live()) return false;
      const cursors = new Set<string>();
      const entries: FilesTreeEntry[] = [];
      let received = false;
      let complete = false;
      let truncated = false;
      let total: number | null = null;
      let canonical: string | undefined;
      try {
        let reply = await send({ operation: "list", path: target.path });
        while (true) {
          if (reply.cursor) cursors.add(reply.cursor);
          if (!live()) return false;
          if (!reply.ok || !reply.directory) {
            target.error = reply.error ?? "failed";
            break;
          }
          canonical ??= reply.directory;
          received = true;
          entries.push(...(reply.rows ?? []));
          truncated ||= !!reply.truncated;
          total = reply.total ?? total;
          if (!reply.cursor) {
            // The backend consumes its cursor with the final page.
            cursors.clear();
            complete = true;
            break;
          }
          reply = await send({ operation: "list-next", cursor: reply.cursor });
        }
        if (root === target && canonical) target.path = canonical;
        if (received) {
          reconcile(target, entries);
          target.truncated = truncated;
          target.total = total;
        }
        return complete;
      } finally {
        // Includes cursors returned after collapse/navigation and failed pages.
        // Cleanup is best effort, never retried; backend retirement/eviction is
        // the fallback if the transport itself is unavailable.
        for (const cursor of cursors)
          await send({ operation: "list-close", cursor });
        if (live()) {
          target.loading = false;
          target.pending = undefined;
          publish();
        }
      }
    });
    target.pending = { generation: current, promise };
    lane = promise.catch(() => {});
    publish();
    return promise;
  }
  function invalidate() {
    generation++;
    if (root) {
      root.loading = false;
      root.pending = undefined;
    }
    for (const node of nodes.values()) {
      node.loading = false;
      node.pending = undefined;
    }
  }
  return {
    snapshot,
    async navigate(path) {
      invalidate();
      nodes.clear();
      root = directory(path);
      await load(root);
    },
    async toggle(path) {
      const node = nodes.get(path);
      if (!node || node.kind !== "directory") return;
      node.expanded = !node.expanded;
      if (node.expanded) {
        await load(node);
      } else {
        node.revision++;
        node.pending = undefined;
        node.loading = false;
        node.error = null;
        node.truncated = false;
        node.total = null;
        discard(node.children);
        node.children = [];
        publish();
      }
    },
    async refresh() {
      if (!root) return;
      invalidate();
      const current = generation;
      const pending: Directory[] = [root];
      while (pending.length && current === generation) {
        const target = pending.shift()!;
        if (target !== root && nodes.get(target.path) !== target) continue;
        if (target !== root && !(target as Node).expanded) continue;
        if (!(await load(target)) || current !== generation) continue;
        pending.push(...target.children.filter((node) => node.expanded));
      }
    },
  };
}
