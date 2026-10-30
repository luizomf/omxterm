import type { BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";
import { exerciseConcurrentResttyTabs } from "../fixtures/restty-host-concurrent-font";

async function exercise(exits: number[], finishLastExit = false) {
  let starts = 5;
  let closes = 0;
  const exited = new Set([0, 1, 2, 4]);
  const cleanupPredicates: boolean[] = [];
  const release = vi.fn();
  const timeout = new Error(
    "Timed out waiting for concurrent fixture PTY cleanup",
  );
  const window = {
    webContents: {
      send(_channel: string, command: { action: string }) {
        if (command.action === "new") starts += 1;
        else if (++closes === 4) for (const index of exits) exited.add(index);
      },
      async executeJavaScript(script: string) {
        if (script.startsWith("({ hidden:")) return { hidden: true, text: "" };
        return true;
      },
    },
  } as unknown as BrowserWindow;
  const outcome = exerciseConcurrentResttyTabs({
    window,
    beginFontLoad: () => ({
      release,
      physicalLoads: () => 1,
      requests: () => 4,
    }),
    sessionDiagnostics: (indices) => indices.map((index) => ({ index })),
    sessionStarts: () => starts,
    ptyExits: () => exited.size,
    sessionExited: (index: number) => exited.has(index),
    async waitFor(predicate, label) {
      if (label !== "concurrent fixture PTY cleanup") {
        expect(await predicate()).toBe(true);
        return;
      }
      cleanupPredicates.push(await predicate());
      if (finishLastExit) {
        exited.add(5);
        cleanupPredicates.push(await predicate());
      }
      if (!cleanupPredicates.at(-1)) throw timeout;
    },
  });
  return {
    outcome: await outcome.then(
      (value) => value,
      (error: unknown) => error,
    ),
    timeout,
    cleanupPredicates,
    release,
  };
}

it("still waits for actual exit after all four DOM tabs retire", async () => {
  const result = await exercise([6, 7, 8], true);
  expect(result.cleanupPredicates).toEqual([false, true]);
  expect(result.outcome).toMatchObject({ requestedTabs: 4, readyTabs: 4 });
  expect(result.release).toHaveBeenCalledOnce();
});

it("accepts all four target exits with the prior peer retained", async () => {
  const result = await exercise([5, 6, 7, 8]);
  expect(result.cleanupPredicates).toEqual([true]);
  expect(result.outcome).toMatchObject({ requestedTabs: 4, readyTabs: 4 });
});

it("rejects a prior peer exit directly after joining all target exits", async () => {
  const result = await exercise([3, 5, 6, 7, 8]);
  expect(result.cleanupPredicates).toEqual([true]);
  expect(result.outcome).toBeInstanceOf(Error);
  expect((result.outcome as Error).cause).not.toBe(result.timeout);
  expect((result.outcome as Error).message).toContain(
    "Concurrent fixture unexpectedly exited a prior session",
  );
  expect((result.outcome as Error).message).toContain(
    JSON.stringify({
      initialExits: 4,
      expectedExits: 8,
      actualExits: 9,
      pendingSessionIndices: [],
      newlyExitedPriorSessionIndices: [3],
    }),
  );
});

it.each([
  { exits: [6, 7, 8], total: 7, pending: [5], peers: [] },
  { exits: [3, 6, 7, 8], total: 8, pending: [5], peers: [3] },
])(
  "retains failure-time identity evidence for exit total $total",
  async ({ exits, total, pending, peers }) => {
    const result = await exercise(exits);
    expect(result.outcome).toBeInstanceOf(Error);
    expect((result.outcome as Error).cause).toBe(result.timeout);
    expect((result.outcome as Error).message).toContain(result.timeout.message);
    expect((result.outcome as Error).message).toContain(
      JSON.stringify({
        initialExits: 4,
        expectedExits: 8,
        actualExits: total,
        pendingSessionIndices: pending,
        newlyExitedPriorSessionIndices: peers,
      }),
    );
  },
);
