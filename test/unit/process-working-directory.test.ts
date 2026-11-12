import { expect, it, vi } from "vitest";
import { createProcessDirectoryReader } from "../../src/main/process-working-directory";
import { createWorkingDirectoryTracker } from "../../src/main/terminal-working-directories";

it("reads each shell's cwd from /proc on Linux", async () => {
  const readLink = vi.fn(async (path: string) => {
    if (path === "/proc/11/cwd") return "/home/me/project";
    if (path === "/proc/12/cwd") return "relative";
    throw new Error("gone");
  });
  const read = createProcessDirectoryReader({ platform: "linux", readLink });
  expect(await read([11, 12, 13, 0, 11])).toEqual(
    new Map([[11, "/home/me/project"]]),
  );
  expect(readLink).toHaveBeenCalledTimes(3);
});

it("asks lsof once for every macOS shell requested in the same turn", async () => {
  const run = vi.fn(async (_file: string, _args: string[]) =>
    Buffer.from(
      "p21\nfcwd\nn/Users/me/a\np22\nfcwd\nn/Users/me/b c\np99\nn/elsewhere\n",
    ),
  );
  const read = createProcessDirectoryReader({ platform: "darwin", run });
  const [first, second] = await Promise.all([read([21, 22]), read([23])]);
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0]![0]).toBe("/usr/sbin/lsof");
  expect(run.mock.calls[0]![1].at(-1)).toBe("21,22,23");
  expect(first).toEqual(
    new Map([
      [21, "/Users/me/a"],
      [22, "/Users/me/b c"],
    ]),
  );
  expect(second).toBe(first);
  await read([21]);
  expect(run).toHaveBeenCalledTimes(2);
});

it("decodes lsof's escapes and drops names it can't decode exactly", async () => {
  // lsof prints printable UTF-8 as raw bytes (the 🚀) and escapes the rest.
  const run = vi.fn(async () =>
    Buffer.from(
      [
        "p1",
        "n/Users/me/\\xc3\\x81rea de Trabalho",
        "p2",
        "n/Users/me/a\\\\b",
        "p3",
        "n/Users/me/odd\\q",
        "p4",
        "n/Users/me/\\xff",
        "p5",
        "n/Users/me/🚀proj",
        "",
      ].join("\n"),
    ),
  );
  const read = createProcessDirectoryReader({ platform: "darwin", run });
  expect(await read([1, 2, 3, 4, 5])).toEqual(
    new Map([
      [1, "/Users/me/Área de Trabalho"],
      [2, "/Users/me/a\\b"],
      [5, "/Users/me/🚀proj"],
    ]),
  );
});

it("keeps the folders it had when lsof fails", async () => {
  let fail = false;
  const read = createProcessDirectoryReader({
    platform: "darwin",
    run: async () => {
      if (fail) throw new Error("timed out");
      return Buffer.from("p7\nn/work/repo\n");
    },
  });
  const tracker = createWorkingDirectoryTracker({
    platform: "darwin",
    hostName: () => "local",
    processDirectories: read,
  });
  tracker.launched("s1", "/Users/me", { processId: 7 });
  await tracker.refresh();
  fail = true;
  await tracker.refresh();
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/work/repo",
  });
});

it("never looks up Windows shells", () => {
  const tracker = createWorkingDirectoryTracker({
    platform: "win32",
    hostName: () => "local",
  });
  tracker.launched("s1", "C:\\Users\\me", { processId: 7 });
  expect(tracker.readsProcess("s1")).toBe(false);
});

it("reads nothing on Windows", async () => {
  const run = vi.fn();
  const read = createProcessDirectoryReader({ platform: "win32", run });
  expect(await read([1])).toEqual(new Map());
  expect(run).not.toHaveBeenCalled();
});

it("uses the shell's cwd when the pane has no usable OSC 7 report, and the report when it has one", async () => {
  const processDirectories = vi.fn(async () => new Map([[7, "/work/repo"]]));
  const tracker = createWorkingDirectoryTracker({
    platform: "linux",
    hostName: () => "local",
    isDirectory: () => true,
    processDirectories,
  });
  tracker.launched("s1", "/home/me", { processId: 7 });
  tracker.launched("s2", "/home/me");
  expect(tracker.readsProcess("s1")).toBe(true);
  expect(tracker.readsProcess("s2")).toBe(false);
  await tracker.refresh();
  expect(processDirectories).toHaveBeenCalledWith([7]);
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/work/repo",
  });
  expect(tracker.inherited("s1")).toBe("/work/repo");
  expect(tracker.provenance("s2")).toEqual({
    kind: "launch-local",
    path: "/home/me",
  });

  tracker.observe("s1", "\u001b]7;file://localhost/reported\u0007");
  expect(tracker.readsProcess("s1")).toBe(false);
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/reported",
  });
  tracker.forget("s1");
  expect(tracker.provenance("s1")).toEqual({ kind: "home" });
});

it("keeps a reopened pane's missing folder while its shell stays where it started", async () => {
  let cwd = "/home/me";
  const tracker = createWorkingDirectoryTracker({
    platform: "linux",
    hostName: () => "local",
    processDirectories: async () => new Map([[7, cwd]]),
  });
  tracker.launched("s1", "/home/me", {
    remembered: "/mnt/projects/app",
    processId: 7,
  });
  await tracker.refresh();
  expect(tracker.provenance("s1")).toEqual({
    kind: "launch-local",
    path: "/mnt/projects/app",
  });
  cwd = "/tmp";
  await tracker.refresh();
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/tmp",
  });
});
