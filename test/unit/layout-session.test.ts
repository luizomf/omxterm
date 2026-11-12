import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createLayoutSession } from "../../src/main/layout-session";
import type { SavedLayout } from "../../src/shared/terminal-layout";
import { savedLayout } from "../fixtures/restoration-layout";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

// One exclusive lease per path, like the native adapter across processes.
function leases() {
  const held = new Set<string>();
  return {
    async tryAcquire(file: string) {
      if (held.has(file)) return null;
      held.add(file);
      return { release: async () => void held.delete(file) };
    },
  };
}
// `id` only tells windows apart.
const layout = (id: number): SavedLayout => ({ ...savedLayout(), omitted: id });

async function setup(shared = leases(), existing?: string) {
  const directory =
    existing ?? (await mkdtemp(path.join(os.tmpdir(), "omxterm-session-")));
  if (!existing) roots.push(directory);
  const state = {
    enabled: true,
    quitting: false,
    windows: [] as SavedLayout[],
    failing: false,
  };
  const session = createLayoutSession<SavedLayout>({
    directory,
    platform: "linux",
    leases: shared,
    enabled: () => state.enabled,
    windows: () => [...state.windows],
    capture: async (window) => {
      if (state.failing) throw new Error("unavailable");
      return window;
    },
    quitting: () => state.quitting,
    interval: 60_000,
  });
  const saved = async () =>
    JSON.parse(await readFile(path.join(directory, "last.json"), "utf8")) as {
      windows: SavedLayout[];
    };
  return { directory, state, session, saved, leases: shared };
}

it("remembers every window and reopens them on the next start", async () => {
  const first = await setup();
  expect(await first.session.start(true)).toEqual([]);
  await first.session.reopened();
  first.state.windows = [layout(1), layout(2)];
  await first.session.flush();
  expect((await first.saved()).windows).toEqual([layout(1), layout(2)]);
  first.session.dispose();

  const next = await setup(leases(), first.directory);
  expect(await next.session.start(true)).toEqual([layout(1), layout(2)]);
  await next.session.reopened();
  next.session.dispose();
});

it("keeps the last arrangement while quitting, when no window is left, or when a capture fails", async () => {
  const test = await setup();
  await test.session.start(true);
  test.state.windows = [layout(1), layout(2)];
  await test.session.flush();
  test.state.windows = [layout(1)];
  test.state.quitting = true;
  await test.session.flush();
  test.state.quitting = false;
  test.state.windows = [];
  await test.session.flush();
  test.state.windows = [layout(3)];
  test.state.failing = true;
  await test.session.flush();
  expect((await test.saved()).windows).toEqual([layout(1), layout(2)]);
  test.state.failing = false;
  await test.session.flush();
  expect((await test.saved()).windows).toEqual([layout(3)]);
  expect(
    (await readdir(test.directory)).filter((name) => name.endsWith(".tmp")),
  ).toEqual([]);
  test.session.dispose();
});

it("lets only the first process on a profile reopen and remember", async () => {
  const shared = leases();
  const first = await setup(shared);
  await first.session.start(true);
  first.state.windows = [layout(1)];
  await first.session.flush();
  const second = await setup(shared, first.directory);
  expect(await second.session.start(true)).toEqual([]);
  second.state.windows = [layout(9)];
  await second.session.flush();
  expect((await first.saved()).windows).toEqual([layout(1)]);
  first.session.dispose();
  second.session.dispose();
});

it("drops the windows after a reopening that never finished", async () => {
  const first = await setup();
  await first.session.start(true);
  first.state.windows = [layout(1)];
  await first.session.flush();
  first.session.dispose();

  const crashed = await setup(leases(), first.directory);
  expect(await crashed.session.start(true)).toHaveLength(1);
  crashed.session.dispose(); // no reopened(): OMXTerm died while reopening
  const next = await setup(leases(), first.directory);
  expect(await next.session.start(true)).toEqual([]);
  next.session.dispose();
  const after = await setup(leases(), first.directory);
  expect(await after.session.start(true)).toEqual([]);
  after.session.dispose();
});

it("leaves the windows alone for an explicit command", async () => {
  const test = await setup();
  await test.session.start(true);
  test.state.windows = [layout(1)];
  await test.session.flush();
  test.session.dispose();

  const command = await setup(leases(), test.directory);
  expect(await command.session.start(false)).toEqual([]);
  await command.session.reopened();
  command.state.windows = [layout(9)];
  await command.session.flush();
  expect((await command.saved()).windows).toEqual([layout(1)]);
  command.session.dispose();

  const next = await setup(leases(), test.directory);
  expect(await next.session.start(true)).toEqual([layout(1)]);
  next.session.dispose();
});

it("forgets the windows only when reopening is turned off", async () => {
  const test = await setup();
  await test.session.start(true);
  test.state.windows = [layout(1)];
  await test.session.flush();
  test.session.dispose();

  // The extension runtime didn't load: nothing reopens, nothing is deleted.
  const unloaded = await setup(leases(), test.directory);
  unloaded.state.enabled = false;
  expect(await unloaded.session.start(true)).toEqual([]);
  await unloaded.session.reopened();
  expect((await unloaded.saved()).windows).toEqual([layout(1)]);
  unloaded.session.dispose();

  const off = await setup(leases(), test.directory);
  expect(await off.session.start(true)).toEqual([layout(1)]);
  await off.session.reopened();
  off.state.enabled = false;
  off.session.refresh();
  await expect
    .poll(() =>
      off.saved().then(
        () => "kept",
        () => "deleted",
      ),
    )
    .toBe("deleted");
  off.session.dispose();
});

it("ignores an unreadable file or one saved on another platform", async () => {
  const test = await setup();
  await writeFile(path.join(test.directory, "last.json"), "{not json");
  expect(await test.session.start(true)).toEqual([]);
  test.session.dispose();
  await writeFile(
    path.join(test.directory, "last.json"),
    JSON.stringify({
      version: 1,
      windows: [
        {
          ...layout(1),
          platform: "win32",
          tabs: layout(1).tabs.map((tab) => ({
            ...tab,
            panes: tab.panes.map(() => ({ kind: "home" })),
          })),
        },
      ],
    }),
  );
  const other = await setup(leases(), test.directory);
  expect(await other.session.start(true)).toEqual([]);
  other.session.dispose();
});
