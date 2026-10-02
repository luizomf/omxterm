import { expect, it } from "vitest";
import {
  waitForScrollFeedbackStartup,
  type ScrollFeedbackStartupGeometry,
} from "../fixtures/restty-scroll-feedback-startup";

function geometry(dpr = 2): ScrollFeedbackStartupGeometry {
  return {
    width: 829,
    clientHeight: 854,
    canvasWidth: 829 * dpr,
    canvasHeight: 854 * dpr,
    canvasCssWidth: 829,
    canvasCssHeight: 854,
    viewportWidth: 829,
    viewportHeight: 854,
    dpr,
    sameCanvas: true,
    scrollHeight: 39886,
    scrollTop: 39032,
    core: { total: 2841, offset: 2788, len: 53, cellH: 16 * dpr },
  };
}
function clock() {
  let time = 0;
  return {
    now: () => time,
    async frame() {
      time += 25;
    },
  };
}

it("waits past a DOM-bottom startup snapshot until backing and core geometry agree", async () => {
  const timer = clock();
  const pending = {
    ...geometry(),
    width: 833,
    clientHeight: 858,
    canvasCssWidth: 833,
    canvasCssHeight: 858,
    canvasWidth: 1600,
    canvasHeight: 942,
    scrollHeight: 40226,
    scrollTop: 39368,
    core: { total: 2841, offset: 2812, len: 29, cellH: 32 },
  };
  const settled = geometry();
  const result = await waitForScrollFeedbackStartup(
    () => (timer.now() < 100 ? pending : settled),
    timer.frame,
    timer.now,
  );
  expect(result).toBe(settled);
  expect(timer.now()).toBe(200);
});

it.each([1, 2])(
  "observes a coherent DPR %i baseline for the complete startup interval",
  async (dpr) => {
    const timer = clock();
    const settled = geometry(dpr);
    expect(
      await waitForScrollFeedbackStartup(() => settled, timer.frame, timer.now),
    ).toBe(settled);
    expect(timer.now()).toBe(125);
  },
);

it.each([
  {
    label: "integral CSS",
    canvasCssWidth: 829,
    canvasCssHeight: 854,
    canvasWidth: 1243,
    canvasHeight: 1281,
  },
  {
    label: "fractional CSS",
    canvasCssWidth: 829.375,
    canvasCssHeight: 854.375,
    canvasWidth: 1244,
    canvasHeight: 1281,
  },
])(
  "accepts Restty's actual floored rectangle at DPR 1.5 ($label)",
  async (rectangle) => {
    const timer = clock();
    // Worked backing-pixel examples, not expectations computed by the helper.
    // 829 * 1.5 = 1243.5; 829.375 * 1.5 = 1244.0625.
    // The latter rectangle still has integer clientWidth 829, so flooring the
    // client dimension is also wrong. 854.375 * 1.5 = 1281.5625 floors to 1281.
    const settled = { ...geometry(1.5), ...rectangle };
    expect(
      await waitForScrollFeedbackStartup(() => settled, timer.frame, timer.now),
    ).toBe(settled);
    expect(timer.now()).toBe(125);
  },
);

it("restarts the interval when native viewport geometry changes despite a fitted host", async () => {
  const timer = clock();
  const first = geometry();
  const changed = { ...first, viewportWidth: 833 };
  expect(
    await waitForScrollFeedbackStartup(
      () => (timer.now() < 75 ? first : changed),
      timer.frame,
      timer.now,
    ),
  ).toBe(changed);
  expect(timer.now()).toBe(175);
});

it("restarts the interval for fractional CSS changes within the same backing bucket", async () => {
  const timer = clock();
  const first = { ...geometry(), canvasCssWidth: 829.125 };
  const changed = { ...first, canvasCssWidth: 829.25 };
  expect(
    await waitForScrollFeedbackStartup(
      () => (timer.now() < 75 ? first : changed),
      timer.frame,
      timer.now,
    ),
  ).toBe(changed);
  expect(timer.now()).toBe(175);
});

it("requires continuous coherence, not elapsed time since an older live frame", async () => {
  const timer = clock();
  const settled = geometry();
  const staleCore = { ...settled, core: { ...settled.core, offset: 2787 } };
  expect(
    await waitForScrollFeedbackStartup(
      () => (timer.now() === 75 ? staleCore : settled),
      timer.frame,
      timer.now,
    ),
  ).toBe(settled);
  expect(timer.now()).toBe(200);
});

it("rejects a coherent frame observed only after the startup deadline", async () => {
  let time = 0;
  const current = geometry();
  await expect(
    waitForScrollFeedbackStartup(
      () => current,
      async () => {
        time = time === 0 ? 25 : 6000;
      },
      () => time,
    ),
  ).rejects.toThrow("Scroll feedback startup geometry did not settle");
});

it.each([
  { canvasWidth: 1600 },
  { canvasHeight: 942 },
  { core: { total: 2841, offset: 2812, len: 29, cellH: 32 } },
  { scrollTop: 39031 },
  { sameCanvas: false },
  { width: 0 },
  { canvasCssWidth: 0 },
  { canvasCssHeight: 0 },
  { dpr: 0 },
])(
  "rejects incoherent startup geometry within its bounded deadline: %j",
  async (change) => {
    const timer = clock();
    const current = { ...geometry(), ...change };
    await expect(
      waitForScrollFeedbackStartup(() => current, timer.frame, timer.now),
    ).rejects.toThrow(
      `Scroll feedback startup geometry did not settle: ${JSON.stringify(current)}`,
    );
    expect(timer.now()).toBe(5000);
  },
);
