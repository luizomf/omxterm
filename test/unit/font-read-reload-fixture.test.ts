import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createElectronTerminalAdapter } from "../fixtures/font-read-reload-adapter";
import { readReloadEvidence } from "../fixtures/font-read-reload-evidence";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { buildFixture } from "../fixtures/font-read-reload-build";
import {
  assertFontReadResults,
  createFontReadFailureHandler,
  assertOldPostReadRejection,
  fontReadFailure,
  fontReadRendererReady,
  runFontReadScenario,
  type FontReadResults,
} from "../fixtures/font-read-reload-checks";
import {
  open,
  holdFontRead,
  fontReadHandles,
  releaseFontReads,
} from "../fixtures/font-read-reload-io";

it("fails immediately on observed failed or cancelled mounts instead of waiting for mounted forever", () => {
  expect(
    fontReadRendererReady({
      ready: false,
      mounts: [{ status: "pending", cancelled: false }],
    }),
  ).toBe(false);
  for (const mount of [
    { status: "failed", cancelled: false },
    { status: "pending", cancelled: true },
  ] as const)
    expect(() =>
      fontReadRendererReady({ ready: false, mounts: [mount] }),
    ).toThrow(/Font read\/reload Surface/u);
  expect(
    fontReadRendererReady({
      ready: true,
      mounts: [{ status: "mounted", cancelled: false }],
    }),
  ).toBe(true);
});

it("bounds a hung awaited operation by one scenario budget, without late continuation or a reset per step", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const hung = new Promise<void>((resolve) => {
    release = resolve;
  });
  const late = vi.fn();
  let failure: unknown;
  let settled = false;
  const result = runFontReadScenario(async (step) => {
    await step(
      () => new Promise<void>((resolve) => setTimeout(resolve, 20_000)),
      "initial read",
    );
    await step(() => hung, "renderer evaluation");
    await step(late, "late command");
  }).then(
    () => {
      settled = true;
    },
    (error) => {
      settled = true;
      failure = error;
    },
  );
  try {
    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(String(failure)).toContain(
      "Font read/reload scenario timed out waiting for renderer evaluation",
    );
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    release();
    await result;
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  }
  expect(late).not.toHaveBeenCalled();
  vi.useFakeTimers();
  try {
    await runFontReadScenario(async (step) => {
      await step(() => Promise.resolve(), "settled");
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("qualifies only the exact held-read A supersession, never unrelated native failures", () => {
  const evidence: FontReadResults = {
    gateEntered: true,
    bQueued: true,
    loads: [undefined, "A", "B"],
    received: [
      { family: undefined, status: "fulfilled" },
      {
        family: "A",
        status: "rejected",
        failure: fontReadFailure(
          new Error("Terminal Font request was superseded"),
        ),
      },
      { family: "B", status: "fulfilled" },
    ],
  };
  function execution(
    observed: FontReadResults,
    additional: readonly unknown[] = [],
  ) {
    let stderr = "";
    const releaseReads = vi.fn();
    let settle!: () => void;
    const drain = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const complete = vi.fn((_code: 1) => drain);
    const fail = createFontReadFailureHandler({
      releaseReads,
      writeError: (text) => {
        stderr += text;
      },
      complete,
    });
    let failures = 0;
    try {
      assertFontReadResults("A", "B", observed);
    } catch (error) {
      failures++;
      fail(error);
    }
    for (const error of additional) {
      failures++;
      fail(error);
    }
    expect(releaseReads).toHaveBeenCalledTimes(failures);
    expect(complete.mock.calls).toEqual(
      Array.from({ length: failures }, () => [1]),
    );
    settle();
    return {
      exitCode: stderr ? 1 : 0,
      signal: null,
      reason: "exit",
      stdout: "",
      stderr,
      cleanupErrors: [],
    } as const;
  }
  const fulfilled: FontReadResults = {
    ...evidence,
    received: evidence.received.map((record) => ({
      family: record.family,
      status: "fulfilled",
    })),
  };
  const intended = execution(evidence);
  expect(() => assertOldPostReadRejection(intended)).not.toThrow();
  expect(() =>
    assertOldPostReadRejection({
      ...intended,
      stderr: `Error occurred in handler for 'fixture-font-data': Error: Terminal Font request was superseded\n${intended.stderr}`,
    }),
  ).not.toThrow();
  const unrelated: FontReadResults[] = [
    {
      ...evidence,
      received: [
        evidence.received[0]!,
        { family: "A", status: "fulfilled" },
        { family: "B", status: "rejected", failure: "read-error" },
      ],
    },
    {
      ...evidence,
      received: [
        evidence.received[0]!,
        {
          family: "A",
          status: "rejected",
          failure: fontReadFailure(new Error("Actual font read failed")),
        },
        evidence.received[2]!,
      ],
    },
    { ...evidence, received: evidence.received.slice(0, 2) },
    { ...evidence, received: [...evidence.received, evidence.received[1]!] },
    { ...evidence, gateEntered: false },
    { ...evidence, bQueued: false },
    { ...evidence, loads: [undefined, "A", "A", "B"] },
  ];
  for (const observed of unrelated)
    expect(
      () => assertOldPostReadRejection(execution(observed)),
      JSON.stringify(observed),
    ).toThrow();
  for (const changed of [
    { stderr: "" },
    { stderr: "Started A must complete; old post-read rejection fails here" },
    { stderr: `${intended.stderr}\n${intended.stderr}` },
    { stderr: `${intended.stderr}\nRestty fixture session close failed` },
    {
      stderr: execution(evidence, [
        new Error("Unrelated asynchronous fixture failure"),
      ]).stderr,
    },
    { stderr: execution(evidence, ["Unrelated rejected value"]).stderr },
    {
      stderr: execution(fulfilled, [
        new Error("__OMXTERM_FONT_READ_RELOAD_A_SUPERSEDED__"),
      ]).stderr,
    },
    { reason: "timeout" },
    { signal: "SIGTERM" as const },
    { cleanupErrors: ["termination failed"] },
    {
      cleanupFailure: {
        callsite: "termination" as const,
        category: "command-failed" as const,
        elapsedMs: 1,
      },
    },
    { stdout: "__OMXTERM_FONT_READ_RELOAD_RESULT__{}" },
  ])
    expect(
      () => assertOldPostReadRejection({ ...intended, ...changed }),
      JSON.stringify(changed),
    ).toThrow();
  expect(() => assertFontReadResults("A", "B", fulfilled)).not.toThrow();
});

it("associates each Surface with its actual bridge start receipt even when startups finish out of order", async () => {
  readReloadEvidence.sessionIds.length = 0;
  const finishes: Array<(id: string) => void> = [];
  const bridge = {
    start: () =>
      new Promise<string>((resolve) => {
        finishes.push(resolve);
      }),
    close() {},
    onOutput: () => () => {},
    onExit: () => () => {},
  } as unknown as TerminalBridge;
  const first = createElectronTerminalAdapter(bridge);
  const second = createElectronTerminalAdapter(bridge);
  const handlers = { onOutput() {}, onExit() {} };
  const a = first.start(handlers);
  const b = second.start(handlers);
  finishes[1]!("s2");
  await b;
  expect(readReloadEvidence.sessionIds).toEqual([undefined, "s2"]);
  finishes[0]!("s1");
  await a;
  expect(readReloadEvidence.sessionIds).toEqual(["s1", "s2"]);
  first.close();
  second.close();
});

it("holds the native fixture's real positional read and closes its actual handle", async () => {
  const filename = path.resolve("assets/fonts/DejaVuSansMono.ttf");
  const before = { ...fontReadHandles };
  const gate = holdFontRead();
  const file = await open(filename, "r");
  const data = Buffer.alloc((await file.stat()).size);
  let completed = false;
  const read = file.read(data, 0, data.length, 0).then(() => {
    completed = true;
  });
  try {
    await gate.entered;
    expect(completed).toBe(false);
    gate.release();
    await read;
    expect(data).toEqual(await readFile(filename));
  } finally {
    releaseFontReads();
    await read;
    await file.close();
  }
  expect(fontReadHandles.opened - before.opened).toBe(1);
  expect(fontReadHandles.closed - before.closed).toBe(1);
});

it.each(["current", "old-post-read"] as const)(
  "builds the supervised native fixture headlessly (%s), without replacing discovery/preload/runtime",
  async (control) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-read-reload-build-"),
    );
    try {
      await buildFixture(root, "recipe", control);
      const main = await readFile(path.join(root, "main.cjs"), "utf8");
      const renderer = await readFile(
        path.join(root, "renderer/index.js"),
        "utf8",
      );
      const preload = await readFile(path.join(root, "preload.cjs"), "utf8");
      expect(main).toContain("fontReadHandles.opened += 1");
      expect(main).toContain("await gate.wait");
      expect(main).toContain("__OMXTERM_FONT_READ_RELOAD_A_SUPERSEDED__");
      expect(renderer).toContain("record.fontName = lease.fonts[0]?.name");
      expect(renderer).toContain('record.status = "mounted"');
      expect(renderer).toContain("sessionIds[index] = adapter.sessionId()");
      expect(main).toContain("nativeSessionIndexes.get");
      expect(main).toContain("Four distinct actual Surface start receipts");
      expect(main).toContain("Font read/reload scenario timed out waiting for");
      expect(main).toContain("mountedSurfaces: 4");
      expect(main).not.toContain("cancelledSibling: true");
      expect(main).not.toContain("surviving-sibling");
      expect(renderer).not.toContain("releaseFontInitialization");
      expect(preload).toContain("exposeInMainWorld");
      const completionCheck =
        /const loaded = await options.load\(family\);\s+if \(([^]*?)\)\s+throw new Error\("Terminal Font request was superseded"\)/u.exec(
          main,
        )?.[1];
      expect(completionCheck).toBeDefined();
      expect(completionCheck?.includes("options.generation()")).toBe(
        control === "old-post-read",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
