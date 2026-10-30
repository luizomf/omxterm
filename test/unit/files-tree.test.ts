import { describe, expect, it, vi } from "vitest";
import {
  createFilesTree,
  type FilesTreeEntry,
  type FilesTreeReply,
  type FilesTreeRequest,
} from "../../extensions/files/tree.js";

const folder = (name: string): FilesTreeEntry => ({
  name,
  kind: "directory",
  size: 0,
});
const file = (name: string): FilesTreeEntry => ({
  name,
  kind: "file",
  size: 42,
});
const page = (
  directory: string,
  rows: FilesTreeEntry[] = [],
  extra: Partial<FilesTreeReply> = {},
): FilesTreeReply => ({ ok: true, directory, rows, cursor: null, ...extra });

function controlled() {
  type Call = { value: FilesTreeRequest; reply(value: FilesTreeReply): void };
  const calls: Call[] = [];
  const readers: ((call: Call) => void)[] = [];
  let active = 0;
  let maximum = 0;
  const request = vi.fn((value: FilesTreeRequest) => {
    active++;
    maximum = Math.max(active, maximum);
    return new Promise<FilesTreeReply>((resolve) => {
      const call = {
        value,
        reply(reply: FilesTreeReply) {
          active--;
          resolve(reply);
        },
      };
      const reader = readers.shift();
      if (reader) reader(call);
      else calls.push(call);
    });
  });
  return {
    request,
    maximum: () => maximum,
    next: () =>
      new Promise<Call>((resolve) => {
        const call = calls.shift();
        if (call) resolve(call);
        else readers.push(resolve);
      }),
  };
}

describe("Files directory tree", () => {
  it("publishes canonical root, sequential pages and detached snapshots", async () => {
    const adapter = controlled();
    const changed = vi.fn();
    const tree = createFilesTree(adapter.request, changed);
    expect(tree.snapshot()).toMatchObject({
      root: null,
      rows: [],
      loading: false,
    });
    const navigation = tree.navigate("/alias");
    expect(tree.snapshot()).toMatchObject({
      root: "/alias",
      rootLoading: true,
    });
    const first = await adapter.next();
    expect(first.value).toEqual({ operation: "list", path: "/alias" });
    first.reply(page("/canonical", [folder("a")], { cursor: "c", total: 2 }));
    const next = await adapter.next();
    expect(next.value).toEqual({ operation: "list-next", cursor: "c" });
    next.reply(page("/canonical", [file("z")], { total: 2 }));
    await navigation;
    expect(tree.snapshot()).toMatchObject({
      root: "/canonical",
      loading: false,
      total: 2,
      rows: [
        { path: "/canonical/a", depth: 0, expanded: false },
        { path: "/canonical/z", depth: 0, size: 42 },
      ],
    });
    const copy = tree.snapshot();
    copy.rows[0]!.name = "changed";
    copy.rows.pop();
    expect(tree.snapshot().rows.map((row) => row.name)).toEqual(["a", "z"]);
    expect(changed).toHaveBeenCalled();
    expect(adapter.maximum()).toBe(1);
    expect(adapter.request).toHaveBeenCalledTimes(2);
  });

  it("expands directories only, drops collapsed subtrees and reads again on reopen", async () => {
    const request = vi.fn(async (value: FilesTreeRequest) => {
      if (value.operation !== "list") throw new Error("unexpected page");
      if (value.path === "/")
        return page("/", [folder("a"), { ...file("link"), kind: "link" }]);
      if (value.path === "/a") return page("/a", [folder("b")]);
      return page("/a/b", [file("leaf")]);
    });
    const tree = createFilesTree(request);
    await tree.navigate("/");
    await tree.toggle("/link");
    await tree.toggle("/missing");
    expect(request).toHaveBeenCalledTimes(1);
    await tree.toggle("/a");
    await tree.toggle("/a/b");
    expect(
      tree.snapshot().rows.map(({ path, depth }) => [path, depth]),
    ).toEqual([
      ["/a", 0],
      ["/a/b", 1],
      ["/a/b/leaf", 2],
      ["/link", 0],
    ]);
    await tree.toggle("/a");
    await tree.toggle("/a/b");
    expect(request).toHaveBeenCalledTimes(3);
    await tree.toggle("/a");
    expect(
      tree.snapshot().rows.map(({ path, expanded }) => [path, expanded]),
    ).toEqual([
      ["/a", true],
      ["/a/b", false],
      ["/link", false],
    ]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("fences superseded navigation, closes late cursors and skips obsolete queued roots", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const old = tree.navigate("/old");
    const first = await adapter.next();
    const skipped = tree.navigate("/skip");
    const latest = tree.navigate("/new");
    first.reply(page("/old", [file("stale")], { cursor: "late" }));
    const close = await adapter.next();
    expect(close.value).toEqual({ operation: "list-close", cursor: "late" });
    expect(tree.snapshot()).toMatchObject({ root: "/new", rows: [] });
    close.reply({ ok: true });
    const current = await adapter.next();
    expect(current.value).toEqual({ operation: "list", path: "/new" });
    current.reply(page("/new", [file("fresh")]));
    await Promise.all([old, skipped, latest]);
    expect(tree.snapshot().rows.map((row) => row.path)).toEqual(["/new/fresh"]);
    expect(adapter.maximum()).toBe(1);
  });

  it("fences collapse/reopen during a page and closes both known and late cursor tokens", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(page("/root", [folder("a")]));
    await navigation;
    const expansion = tree.toggle("/root/a");
    (await adapter.next()).reply(
      page("/root/a", [file("old")], { cursor: "c1" }),
    );
    const next = await adapter.next();
    await tree.toggle("/root/a");
    const reopened = tree.toggle("/root/a");
    next.reply(page("/root/a", [file("late")], { cursor: "c2" }));
    for (const cursor of ["c1", "c2"]) {
      const close = await adapter.next();
      expect(close.value).toEqual({ operation: "list-close", cursor });
      close.reply({ ok: true });
    }
    const fresh = await adapter.next();
    expect(fresh.value).toEqual({ operation: "list", path: "/root/a" });
    fresh.reply(page("/root/a", [file("fresh")]));
    await Promise.all([expansion, reopened]);
    expect(tree.snapshot().rows.map((row) => row.path)).toEqual([
      "/root/a",
      "/root/a/fresh",
    ]);
  });

  it("refreshes only visible expanded directories and removes vanished descendants", async () => {
    let refreshed = false;
    const request = vi.fn(async (value: FilesTreeRequest) => {
      if (value.operation !== "list") throw new Error("unexpected page");
      switch (value.path) {
        case "/root":
          return page("/root", [
            folder("a"),
            folder("closed"),
            file("selected"),
          ]);
        case "/root/a":
          return page("/root/a", refreshed ? [file("new")] : [folder("b")]);
        default:
          return page(value.path, [file("leaf")]);
      }
    });
    const tree = createFilesTree(request);
    await tree.navigate("/root");
    await tree.toggle("/root/a");
    await tree.toggle("/root/a/b");
    refreshed = true;
    request.mockClear();
    await tree.refresh();
    expect(request.mock.calls.map(([value]) => value)).toEqual([
      { operation: "list", path: "/root" },
      { operation: "list", path: "/root/a" },
    ]);
    expect(
      tree.snapshot().rows.map(({ path, expanded }) => [path, expanded]),
    ).toEqual([
      ["/root/a", true],
      ["/root/a/new", false],
      ["/root/closed", false],
      ["/root/selected", false],
    ]);
    await tree.toggle("/root/a/b");
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("Files tree refresh and failure handling", () => {
  it("preserves nested expansions across refresh and drops descendants when a folder becomes a link", async () => {
    let linked = false;
    const request = vi.fn(async (value: FilesTreeRequest) => {
      if (value.operation !== "list") throw new Error("unexpected page");
      if (value.path === "/root") return page("/root", [folder("a")]);
      if (value.path === "/root/a")
        return page("/root/a", [
          linked ? { ...file("b"), kind: "link" } : folder("b"),
        ]);
      return page("/root/a/b", [file("leaf")]);
    });
    const tree = createFilesTree(request);
    await tree.navigate("/root");
    await tree.toggle("/root/a");
    await tree.toggle("/root/a/b");
    request.mockClear();
    await tree.refresh();
    expect(request).toHaveBeenCalledTimes(3);
    expect(tree.snapshot().rows).toMatchObject([
      { path: "/root/a", expanded: true },
      { path: "/root/a/b", expanded: true },
      { path: "/root/a/b/leaf", depth: 2 },
    ]);
    linked = true;
    request.mockClear();
    await tree.refresh();
    expect(request).toHaveBeenCalledTimes(2);
    expect(tree.snapshot().rows).toMatchObject([
      { path: "/root/a", expanded: true },
      { path: "/root/a/b", expanded: false, kind: "link" },
    ]);
    await tree.toggle("/root/a/b");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("a newer refresh fences pending expansion and rereads the current tree", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(page("/root", [folder("a")]));
    await navigation;
    const expansion = tree.toggle("/root/a");
    const old = await adapter.next();
    const refresh = tree.refresh();
    old.reply(page("/root/a", [file("stale")], { cursor: "stale" }));
    const close = await adapter.next();
    expect(close.value).toEqual({ operation: "list-close", cursor: "stale" });
    close.reply({ ok: true });
    (await adapter.next()).reply(page("/root", [folder("a")]));
    const fresh = await adapter.next();
    expect(fresh.value).toEqual({ operation: "list", path: "/root/a" });
    fresh.reply(page("/root/a", [file("fresh")]));
    await Promise.all([expansion, refresh]);
    expect(tree.snapshot().rows).toMatchObject([
      { name: "a", expanded: true },
      { name: "fresh", depth: 1 },
    ]);
  });

  it("does not resurrect a collapsed folder while refresh is awaiting the root", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(page("/root", [folder("a")]));
    await navigation;
    const expansion = tree.toggle("/root/a");
    (await adapter.next()).reply(page("/root/a", [file("old")]));
    await expansion;
    const refresh = tree.refresh();
    const rootPage = await adapter.next();
    await tree.toggle("/root/a");
    rootPage.reply(page("/root", [folder("a")]));
    await refresh;
    expect(tree.snapshot().rows).toMatchObject([
      { path: "/root/a", expanded: false },
    ]);
    expect(adapter.request).toHaveBeenCalledTimes(3);
  });

  it("refresh cannot navigate back after newer navigation", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(page("/root", [folder("a")]));
    await navigation;
    const refresh = tree.refresh();
    const old = await adapter.next();
    const current = tree.navigate("/new");
    old.reply(page("/old-canonical", [folder("stale")], { cursor: "old" }));
    const close = await adapter.next();
    expect(close.value).toEqual({ operation: "list-close", cursor: "old" });
    close.reply({ ok: true });
    (await adapter.next()).reply(page("/new", [file("current")]));
    await Promise.all([refresh, current]);
    expect(tree.snapshot()).toMatchObject({
      root: "/new",
      rows: [{ name: "current" }],
    });
  });

  it("exposes root and directory errors without retries, retaining stale rows on failed refresh", async () => {
    let failure = false;
    const request = vi.fn(
      async (value: FilesTreeRequest): Promise<FilesTreeReply> => {
        if (failure) return { ok: false, error: "permission" };
        if (value.operation === "list" && value.path === "/root")
          return page("/root", [folder("a")]);
        throw new Error("private native detail");
      },
    );
    const tree = createFilesTree(request);
    await tree.navigate("/root");
    await tree.toggle("/root/a");
    expect(tree.snapshot().rows[0]).toMatchObject({
      expanded: true,
      error: "outcome-unknown",
      loading: false,
    });
    failure = true;
    await tree.refresh();
    expect(tree.snapshot()).toMatchObject({
      error: "permission",
      loading: false,
      rows: [{ name: "a", error: "outcome-unknown" }],
    });
    expect(request).toHaveBeenCalledTimes(3);
    await tree.navigate("/missing");
    expect(tree.snapshot()).toMatchObject({
      root: "/missing",
      rows: [],
      error: "permission",
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("shows truncation and partial-page errors and closes failed cursors", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(
      page("/root", [folder("a")], { truncated: true, total: 5000 }),
    );
    await navigation;
    expect(tree.snapshot()).toMatchObject({ truncated: true, total: 5000 });
    const expansion = tree.toggle("/root/a");
    (await adapter.next()).reply(
      page("/root/a", [file("prefix")], { cursor: "c", truncated: true }),
    );
    (await adapter.next()).reply({ ok: false, error: "expired-listing" });
    const close = await adapter.next();
    expect(close.value).toEqual({ operation: "list-close", cursor: "c" });
    close.reply({ ok: false, error: "unavailable" });
    await expansion;
    expect(tree.snapshot().rows).toMatchObject([
      {
        name: "a",
        expanded: true,
        truncated: true,
        error: "expired-listing",
        loading: false,
      },
      { name: "prefix", depth: 1 },
    ]);
    expect(adapter.request).toHaveBeenCalledTimes(4);
  });

  it("bounds simultaneous expansions to one invocation and abandons queued collapsed work", async () => {
    const adapter = controlled();
    const tree = createFilesTree(adapter.request);
    const navigation = tree.navigate("/root");
    (await adapter.next()).reply(
      page(
        "/root",
        Array.from({ length: 12 }, (_, i) => folder(`${i}`)),
      ),
    );
    await navigation;
    const expansions = Array.from({ length: 12 }, (_, i) =>
      tree.toggle(`/root/${i}`),
    );
    const first = await adapter.next();
    await tree.toggle("/root/11");
    first.reply(page("/root/0"));
    for (let i = 1; i < 11; i++) {
      const call = await adapter.next();
      expect(call.value).toEqual({ operation: "list", path: `/root/${i}` });
      call.reply(page(`/root/${i}`));
    }
    await Promise.all(expansions);
    expect(adapter.maximum()).toBe(1);
    expect(adapter.request).toHaveBeenCalledTimes(12);
    expect(tree.snapshot().loading).toBe(false);
  });
});
