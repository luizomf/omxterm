// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadResttyWasm } from "restty/internal";
import { cancellingPreviewRenderer } from "../fixtures/restty-link-readiness-renderer";
import { exerciseResttyLinks } from "../fixtures/restty-link-gestures";
import { realFrameFixture } from "../fixtures/restty-link-core-probe";
import type { LinkFixtureFrame } from "../fixtures/restty-link-readiness-probe";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("requires an actual alternate no-destination frame and restores the original main destination", async () => {
  const fixture = await realFrameFixture();
  const target = {
    row: 0,
    col: 3,
    firstRow: 0,
    lastRow: 0,
    clippedStart: false,
    clippedEnd: false,
  };
  const main: LinkFixtureFrame = {
    lines: ["https://one.test/a"],
    viewport: { offset: 0, total: 6, alternate: false, mouseActive: false },
    targets: [{ ...target, url: "https://one.test/a" }],
  };
  try {
    fixture.observer.prepareFrame(main);
    fixture.write("\u001b[3J\u001b[2J\u001b[Hhttps://one.test/a");
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.snapshot()?.matches).toBe(true);
    fixture.observer.prepareFrame({
      lines: ["alternate-mouse"],
      viewport: { offset: 0, total: 6, alternate: true, mouseActive: false },
      targets: [{ ...target, url: null }],
    });
    fixture.write("\u001b[?1049h\u001b[2J\u001b[Halternate-mouse");
    expect(fixture.observer.snapshot()).toBeUndefined();
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(3, 0)).toBeNull();
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.snapshot()).toMatchObject({
      matches: true,
      viewport: { alternate: true },
    });
    fixture.observer.prepareFrame(main);
    fixture.write("\u001b[?1049l");
    expect(fixture.observer.snapshot()).toBeUndefined();
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(3, 0)?.url).toBe(
      "https://one.test/a",
    );
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.snapshot()).toMatchObject({
      matches: true,
      viewport: { alternate: false },
    });
  } finally {
    fixture.dispose();
  }
});

it("waits for a delayed hard-break frame on an unchanged Linux grid before two additional gestures", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("process", { ...process, platform: "linux" });
  const fixture = cancellingPreviewRenderer({
    flow: {
      wasm: await loadResttyWasm(),
      delay: 250,
      stopAfterHardBreak: true,
    },
  });
  try {
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toBe(fixture.downstream);
    expect(fixture.options.externalLinks).toEqual([
      `https://example.test/漢${"a".repeat(80)}`,
      `https://example.test/漢${"a".repeat(80)}`,
      "https://one.test/a",
      "https://two.test/b",
    ]);
    expect(fixture.events).toHaveLength(16);
    expect(fixture.events.slice(12)).toEqual([
      {
        type: "mouseDown",
        x: 35,
        y: 10,
        button: "left",
        clickCount: 1,
        modifiers: ["control"],
      },
      {
        type: "mouseUp",
        x: 35,
        y: 10,
        button: "left",
        clickCount: 1,
        modifiers: ["control"],
      },
      {
        type: "mouseDown",
        x: 35,
        y: 30,
        button: "left",
        clickCount: 1,
        modifiers: ["control"],
      },
      {
        type: "mouseUp",
        x: 35,
        y: 30,
        button: "left",
        clickCount: 1,
        modifiers: ["control"],
      },
    ]);
    expect(fixture.options.inputs).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});

it("completes delayed scrollback and purposeful negative transitions without losing ordinary replay", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("process", { ...process, platform: "linux" });
  const fixture = cancellingPreviewRenderer({
    flow: { wasm: await loadResttyWasm(), delay: 250 },
  });
  try {
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    const result = await outcome;
    expect(result).not.toBeInstanceOf(Error);
    expect(fixture.options.externalLinks).toEqual([
      `https://example.test/漢${"a".repeat(80)}`,
      `https://example.test/漢${"a".repeat(80)}`,
      "https://one.test/a",
      "https://two.test/b",
      "https://scroll.test/complete",
    ]);
    expect(fixture.events).toHaveLength(35);
    expect(fixture.wheelCount()).toBe(4);
    expect(fixture.consumedOriginalBeforeReplacement()).toBe(true);
    expect(result).toMatchObject({
      ordinaryGestures: {
        modifiedDrag: {
          mouseReports: "\u001b[<16;4;1M\u001b[<16;4;2m",
          activationsBefore: 8,
          activationsAfter: 8,
        },
        plainPrimary: {
          mouseReports: "\u001b[<0;4;1M\u001b[<0;4;1m",
          activationsBefore: 8,
          activationsAfter: 8,
        },
        modifiedMiddle: {
          mouseReports: "\u001b[<17;4;1M\u001b[<17;4;1m",
          activationsBefore: 8,
          activationsAfter: 8,
        },
        changedUrl: {
          mouseReports: "\u001b[<16;4;1M\u001b[<16;4;1m",
          activationsBefore: 8,
          activationsAfter: 8,
        },
        releasedModifier: {
          mouseReports: "\u001b[<16;4;1M\u001b[<0;4;1m",
          activationsBefore: 8,
          activationsAfter: 8,
        },
      },
    });
  } finally {
    await fixture.dispose();
  }
});

it.each([
  ["hard-break-missing", "readiness exhausted (phase hard-break", 12, 2],
  ["hard-break-stale", "readiness exhausted (phase hard-break", 12, 2],
  [
    "hard-break-invalidation",
    "preparation invalidated (phase hard-break",
    12,
    2,
  ],
  ["hard-break-excess", "activation count failed (phase hard-break", 16, 6],
  ["hard-break-wrong", "changed the literal destinations", 16, 4],
  ["hard-break-geometry", "geometry-changed", 12, 2],
  [
    "scrollback-missing",
    "readiness exhausted (phase scrollback-populated",
    29,
    4,
  ],
  [
    "scrollback-visible-missing",
    "readiness exhausted (phase scrollback-visible",
    29,
    4,
  ],
  ["ordinary-missing", "readiness exhausted (phase modified-drag", 16, 4],
  [
    "changed-replacement-missing",
    "readiness exhausted (phase changed-url-replacement",
    24,
    4,
  ],
  ["alternate-stale", "readiness exhausted (phase alternate-screen", 27, 4],
  ["clipped-above-missing", "readiness exhausted (phase clipped-above", 31, 5],
  ["clipped-below-missing", "readiness exhausted (phase clipped-below", 33, 5],
  ["replay-loss", "modifiedDrag mouse reports", 19, 4],
] as const)(
  "rejects %s in the real caller without retries or unrelated payload diagnostics",
  async (mutation, phase, sends, requests) => {
    vi.useFakeTimers();
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const fixture = cancellingPreviewRenderer({
      flow: { wasm: await loadResttyWasm(), delay: 250, mutation },
    });
    try {
      const outcome = exerciseResttyLinks(fixture.options).catch(
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      const failure = await outcome;
      expect(failure instanceof Error && failure.message).toContain(phase);
      expect(fixture.events).toHaveLength(sends);
      expect(fixture.options.externalLinks).toHaveLength(requests);
      if (phase.includes("readiness") || phase.includes("invalidated")) {
        expect(failure instanceof Error && failure.message).toContain(
          `requests ${requests}, sent input events`,
        );
        expect(failure instanceof Error && failure.message).not.toMatch(
          /https:|scroll-\d|clip-\d|alternate-mouse/u,
        );
      }
      expect(fixture.destinationObserver.snapshot()).toBeUndefined();
      if (mutation.startsWith("hard-break"))
        expect(fixture.options.inputs).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  },
);
