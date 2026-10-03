import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordCursorBlinkFailure } from "../fixtures/restty-cursor-readiness";
import { recordInitializationStage } from "../fixtures/initialization-cancellation-diagnostics";

let output: string[];
beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    output.push(String(value));
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

const context = {
  dpr: 1,
  font: "bundled",
  padding: 0,
  lifecycle: "initial",
} as const;
const blinkRecord = () =>
  JSON.parse(output[0]!.slice("__OMXTERM_CURSOR_BLINK_FAILURE__".length)) as {
    sampleCount: number;
    samples: Record<string, number | null>[];
  };

it("retains actual capture intervals/counts and negative remaining exposure without substituting a phase", () => {
  recordCursorBlinkFailure(context, 2100, 16, 2, [
    {
      focusBegin: 100,
      focusEnd: 140,
      captureBegin: 141,
      captureEnd: 180,
      count: 0,
      remainingMs: 1920,
    },
    {
      focusBegin: 2000,
      focusEnd: 2050,
      captureBegin: 2051,
      captureEnd: 2110,
      count: 16,
      remainingMs: -10,
    },
  ]);
  expect(blinkRecord()).toEqual({
    version: 1,
    context,
    deadline: 2100,
    fullBar: 16,
    sampleCount: 2,
    samples: [
      {
        focusBegin: 100,
        focusEnd: 140,
        captureBegin: 141,
        captureEnd: 180,
        count: 0,
        remainingMs: 1920,
      },
      {
        focusBegin: 2000,
        focusEnd: 2050,
        captureBegin: 2051,
        captureEnd: 2110,
        count: 16,
        remainingMs: -10,
      },
    ],
  });
});

it("does not invent a zero-pixel capture or successful result when native evidence is missing", () => {
  recordCursorBlinkFailure(context, 2100, 16, 1, [{ focusBegin: 100 }]);
  expect(blinkRecord().samples).toEqual([
    {
      focusBegin: 100,
      focusEnd: null,
      captureBegin: null,
      captureEnd: null,
      count: null,
      remainingMs: null,
    },
  ]);
  expect(output.join("")).not.toContain("__OMXTERM_CURSOR_RESULT__");
  expect(blinkRecord()).not.toHaveProperty("success");
});

it("bounds failure history to 32 numeric samples and excludes additional payload fields", () => {
  const secret = "terminal clipboard font config /private/path";
  const extraContext = { ...context, secret };
  recordCursorBlinkFailure(
    extraContext,
    2100,
    16,
    100,
    Array.from({ length: 100 }, (_, i) => ({
      focusBegin: i,
      count: Number.NaN,
      secret,
    })),
  );
  const record = blinkRecord();
  expect(record.sampleCount).toBe(100);
  expect(record.samples).toHaveLength(32);
  expect(record.samples[0]!.focusBegin).toBe(68);
  expect(record.samples[31]!.count).toBeNull();
  expect(output.join("")).not.toContain(secret);
  expect(output[0]!.length).toBeLessThan(6000);
});

it("retains fixed initialization boundaries/timestamps without claiming completion of a begun operation", () => {
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(200)
    .mockReturnValueOnce(210);
  recordInitializationStage("fonts", "app-ready", "begin");
  recordInitializationStage("fonts", "app-ready", "complete");
  recordInitializationStage("fonts", "window-load", "begin");
  expect(
    output.map(
      (line) =>
        JSON.parse(
          line.slice("__OMXTERM_INITIALIZATION_STAGE__".length),
        ) as unknown,
    ),
  ).toEqual([
    {
      version: 1,
      boundary: "fonts",
      stage: "app-ready",
      status: "begin",
      at: 100,
    },
    {
      version: 1,
      boundary: "fonts",
      stage: "app-ready",
      status: "complete",
      at: 200,
    },
    {
      version: 1,
      boundary: "fonts",
      stage: "window-load",
      status: "begin",
      at: 210,
    },
  ]);
  expect(output.every((line) => line.length < 200)).toBe(true);
  expect(output.join("")).not.toContain("__OMXTERM_CANCELLATION_RESULT__");
});

it("rejects arbitrary stage/context strings without logging user data", () => {
  recordInitializationStage(
    "fonts",
    "private terminal payload" as never,
    "begin",
  );
  recordInitializationStage("private font" as never, "app-ready", "begin");
  recordInitializationStage(
    "runtime",
    "app-ready",
    "private clipboard" as never,
  );
  recordCursorBlinkFailure(
    { ...context, font: "private config" as never },
    1,
    1,
    0,
    [],
  );
  expect(output).toEqual([]);
});

it("diagnostic sink failures cannot replace an original failure or prevent the next native operation", () => {
  vi.mocked(process.stdout.write).mockImplementation(() => {
    throw new Error("sink failure");
  });
  expect(() =>
    recordInitializationStage("runtime", "b-held", "begin"),
  ).not.toThrow();
  expect(() =>
    recordCursorBlinkFailure(context, 2000, 16, 0, []),
  ).not.toThrow();
});
