import { afterEach, expect, it, vi } from "vitest";
import { tabRemovalScene } from "../fixtures/tab-removal-headless";
import { observeHostTabCommands } from "../fixtures/host-tab-command-readiness";
import {
  TAB_REMOVAL_CONTROL_PREFIX as prefix,
  TAB_REMOVAL_STEP_TIMEOUT,
  TAB_REMOVAL_PHASE_PREFIX,
} from "../fixtures/tab-removal-readiness";

vi.mock("esbuild", async (importOriginal) => {
  const actual = await importOriginal<typeof import("esbuild")>();
  return {
    ...actual,
    async build(options: import("esbuild").BuildOptions) {
      const { headlessSurface } =
        await import("../fixtures/tab-removal-headless");
      return actual.build(headlessSurface(options));
    },
  };
});
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.useRealTimers();
});

it("does not cross the actual first-command gate on a valid selection before Surface adoption", async () => {
  const f = await tabRemovalScene("held-surface");
  cleanups.push(f.dispose);
  await vi.waitFor(() => expect(f.state().heldSurface).toBe(true));
  expect(f.selected).toBe("s1");
  expect(f.starts).toBe(1);
  expect(f.adoptions).toBe(0);
  expect(f.state().hostReady).toBe(false);
  expect(f.listeners).toBe(1); // Arrival observer, not the real host callback.
  expect(f.snapshots).toEqual([
    { sessionId: null, tabSessionIds: [] },
    { sessionId: "s1", tabSessionIds: ["s1"] },
  ]);
  expect(f.selection.hasBusySelectedSession()).toBe(true);
  const outcomes: unknown[] = [];
  const initial = f.initial().then(
    () => {
      outcomes.push("ready");
    },
    (error: unknown) => {
      outcomes.push(error);
    },
  );
  await vi.waitFor(() =>
    expect(
      outcomes.length > 0 ||
        f.markers.some((line) => line.endsWith("readiness-pending")),
    ).toBe(true),
  );
  expect(outcomes).toEqual([]);
  await vi.waitFor(() => expect(f.boundaryCalls).toBe(1));
  await Promise.resolve();
  expect(f.boundarySettled).toBe(false);
  expect(f.adoptions).toBe(0);
  f.release();
  await initial;
  expect(outcomes).toEqual(["ready"]);
  expect(f.adoptions).toBe(1);
  expect(f.state().hostReady).toBe(true);
  expect(f.listeners).toBe(2);
  expect(f.markers).toEqual(
    ["actual-surface-held", "readiness-pending", "surface-released"].map(
      (name) => prefix + name,
    ),
  );
  expect(f.starts).toBe(1);
  f.send({ action: "new" });
  await vi.waitFor(() => expect(f.starts).toBe(2));
}, 30_000);

it("gates the ordinary entry on the host subscription without an arrival observer", async () => {
  const f = await tabRemovalScene("ordinary");
  cleanups.push(f.dispose);
  await f.initial();
  expect(f.state().hostReady).toBe(true);
  expect(f.listeners).toBe(1);
  expect(f.adoptions).toBe(1);
  expect(f.markers).toEqual([]);
  f.send({ action: "new" });
  await vi.waitFor(() => expect(f.starts).toBe(2));
  f.pagehide();
  expect(f.listeners).toBe(0);
  expect(f.state().hostReady).toBe(false);
}, 30_000);

it("keeps the faithful early-command negative at second-program without replay, then consumes a fresh command", async () => {
  const f = await tabRemovalScene("early-command");
  cleanups.push(f.dispose);
  await vi.waitFor(() => expect(f.state().heldSurface).toBe(true));
  vi.useFakeTimers();
  const initial = f.initial();
  await vi.waitFor(() => expect(f.state().newCommands).toBe(1));
  expect(f.state().hostReady).toBe(false);
  expect(f.listeners).toBe(1);
  expect(f.selected).toBe("s1");
  expect(f.starts).toBe(1);
  expect(f.adoptions).toBe(0);
  f.release();
  await initial;
  await vi.waitFor(() => expect(f.state().hostReady).toBe(true));
  expect(f.starts).toBe(1); // Arrival before registration was not replayed.
  const failed = expect(
    f.readiness.waitFor("second-program", () => f.starts === 2),
  ).rejects.toThrow("operation-timeout at second-program");
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  await failed;
  expect(f.markers).toEqual(
    ["actual-surface-held", "early-command-observed", "surface-released"].map(
      (name) => prefix + name,
    ),
  );
  const phases = f.phases.map(
    (line) =>
      JSON.parse(line.slice(TAB_REMOVAL_PHASE_PREFIX.length)) as {
        status: string;
        phase: string;
      },
  );
  expect(phases.filter((p) => p.status === "failure")).toEqual([
    expect.objectContaining({ phase: "second-program" }),
  ]);
  f.send({ action: "new" });
  await vi.waitFor(() => expect(f.starts).toBe(2));
}, 30_000);

it("retains the exact held-renderer boundary and deadline even after actual host registration", async () => {
  const f = await tabRemovalScene("held-renderer");
  cleanups.push(f.dispose);
  await vi.waitFor(() => expect(f.state().hostReady).toBe(true));
  vi.useFakeTimers();
  const failed = expect(f.initial()).rejects.toThrow(
    "operation-timeout at initial-renderer-boundary",
  );
  await vi.waitFor(() =>
    expect(f.markers).toContain(prefix + "held-renderer-boundary"),
  );
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  await failed;
  expect(f.markers).toEqual([prefix + "held-renderer-boundary"]);
  expect(f.starts).toBe(1);
}, 30_000);

it("does not publish readiness for a disposed pending host or retain its tab listeners", async () => {
  const f = await tabRemovalScene("held-surface");
  cleanups.push(f.dispose);
  await vi.waitFor(() => expect(f.state().heldSurface).toBe(true));
  const failed = expect(
    f.renderer.executeJavaScript(
      "globalThis.__omxtermTabRemovalControl.waitForHost()",
    ),
  ).rejects.toThrow("unavailable");
  f.pagehide();
  await failed;
  await vi.waitFor(() => expect(f.state().heldSurface).toBe(false));
  expect(f.state().hostReady).toBe(false);
  expect(f.listeners).toBe(0);
  expect(f.adoptions).toBe(0);
  expect(f.starts).toBe(1);
}, 30_000);

it("uses the same actual subscription producer in the startup-title sibling entry", async () => {
  const f = await tabRemovalScene("ordinary", "startup-titles");
  cleanups.push(f.dispose);
  await vi.waitFor(() => expect(f.selected).toBe("s1"));
  expect(f.adoptions).toBe(0);
  expect(f.titlesReady()).toBe(false);
  const ready = f.titlesWait();
  f.releaseUnderlying();
  await ready;
  expect(f.adoptions).toBe(1);
  expect(f.titlesReady()).toBe(true);
  f.send({ action: "new" });
  await vi.waitFor(() => expect(f.starts).toBe(2));
  f.pagehide();
  expect(f.listeners).toBe(0);
  expect(f.titlesReady()).toBe(false);
  await expect(f.titlesWait()).rejects.toThrow("unavailable");
}, 30_000);

it("invalidates a successfully registered owner on its actual unsubscribe", async () => {
  const remove = vi.fn();
  const host = observeHostTabCommands(() => remove);
  const unsubscribe = host.subscribe(() => {});
  await host.wait();
  expect(host.ready).toBe(true);
  unsubscribe();
  unsubscribe();
  expect(host.ready).toBe(false);
  expect(remove).toHaveBeenCalledOnce();
  await expect(host.wait()).rejects.toThrow("unavailable");
});

it("never resolves readiness for a failed registration or disposal during registration", async () => {
  const original = new Error("registration failed");
  const host = observeHostTabCommands(() => {
    throw original;
  });
  const failed = expect(host.wait()).rejects.toBe(original);
  expect(() => host.subscribe(() => {})).toThrow(original);
  await failed;
  expect(host.ready).toBe(false);
  const remove = vi.fn();
  const retiring: ReturnType<typeof observeHostTabCommands> =
    observeHostTabCommands(() => {
      retiring.dispose();
      return remove;
    });
  const retired = expect(retiring.wait()).rejects.toThrow("unavailable");
  expect(() => retiring.subscribe(() => {})).toThrow("unavailable");
  await retired;
  expect(remove).toHaveBeenCalledOnce();
  expect(retiring.ready).toBe(false);
});
