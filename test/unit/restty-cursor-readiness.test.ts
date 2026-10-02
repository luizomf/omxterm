import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
import {
  runCursorStep,
  type CursorStep,
  type CursorWindow,
} from "../fixtures/restty-cursor-readiness";

const step: CursorStep = {
  dpr: 1,
  font: "bundled",
  padding: 0,
  lifecycle: "initial",
  kind: "execute",
  operation: "cursor",
};
const visibleWindow = (): CursorWindow => ({
  isVisible: () => true,
  isMinimized: () => false,
  isFocused: () => false,
  getBounds: () => ({ x: 20, y: 30, width: 900, height: 600 }),
});

it("rejects a native minimized window before invoking its cursor operation", async () => {
  const operation = vi.fn(async () => "should not run");
  await expect(
    runCursorStep(
      { ...visibleWindow(), isMinimized: () => true },
      step,
      operation,
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
  expect(operation).not.toHaveBeenCalled();
});

it("retains only safe begin/failure phase metadata in supervised stdout, preserving the original error", async () => {
  let text = "";
  const output = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((value) => {
      text += String(value);
      return true;
    });
  const original = new Error(
    "private terminal payload /secret/path clipboard contents",
  );
  try {
    await expect(
      runCursorStep(visibleWindow(), step, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    const records = text
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line.slice("__OMXTERM_CURSOR_PHASE__".length)) as unknown,
      );
    expect(records).toEqual([
      {
        version: 1,
        step,
        status: "begin",
        category: "none",
        native: {
          visible: true,
          minimized: false,
          focused: false,
          bounds: { x: 20, y: 30, width: 900, height: 600 },
        },
      },
      {
        version: 1,
        step,
        status: "failure",
        category: "operation-error",
        native: {
          visible: true,
          minimized: false,
          focused: false,
          bounds: { x: 20, y: 30, width: 900, height: 600 },
        },
      },
    ]);
    expect(text).not.toContain("private");
    expect(text).not.toContain("secret");
  } finally {
    output.mockRestore();
  }
});

it("bounds a held renderer operation and names its real cursor phase", async () => {
  vi.useFakeTimers();
  let failure: unknown;
  try {
    void runCursorStep(
      visibleWindow(),
      step,
      () => new Promise(() => {}),
    ).catch((error: unknown) => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(5001);
    expect(failure).toMatchObject({ category: "operation-timeout" });
    expect((failure as Error).message).toContain("initial/execute/cursor");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("accepts a visible unfocused window without changing focus and clears its timer", async () => {
  vi.useFakeTimers();
  const native = visibleWindow();
  await expect(runCursorStep(native, step, async () => 42)).resolves.toBe(42);
  expect(vi.getTimerCount()).toBe(0);
  expect(native.isFocused()).toBe(false);
});

it("rejects a native hidden window without invoking a capture", async () => {
  const operation = vi.fn(async () => "unexpected bitmap");
  await expect(
    runCursorStep(
      { ...visibleWindow(), isVisible: () => false },
      { ...step, kind: "capture", operation: "hidden" },
      operation,
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
  expect(operation).not.toHaveBeenCalled();
});

it("bounds a held capture with the capture phase and consumes its late rejection", async () => {
  vi.useFakeTimers();
  let rejectCapture: (error: Error) => void = () => {};
  const capture = new Promise<never>((_, reject) => {
    rejectCapture = reject;
  });
  const outcome = expect(
    runCursorStep(
      visibleWindow(),
      { ...step, kind: "capture", operation: "hidden" },
      () => capture,
    ),
  ).rejects.toMatchObject({
    category: "operation-timeout",
    message:
      "Cursor fixture operation-timeout at bundled/0/initial/capture/hidden",
  });
  await vi.advanceTimersByTimeAsync(5001);
  await outcome;
  rejectCapture(new Error("private late capture details"));
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects presentation lost during an otherwise successful operation", async () => {
  let visible = true;
  await expect(
    runCursorStep(
      { ...visibleWindow(), isVisible: () => visible },
      step,
      async () => {
        visible = false;
        return 42;
      },
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
});

it("classifies lost native presentation at the deadline instead of inventing a renderer freeze", async () => {
  vi.useFakeTimers();
  let minimized = false;
  const outcome = expect(
    runCursorStep(
      { ...visibleWindow(), isMinimized: () => minimized },
      step,
      () => new Promise(() => {}),
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
  await vi.advanceTimersByTimeAsync(1000);
  minimized = true;
  await vi.advanceTimersByTimeAsync(4001);
  await outcome;
});

it("permits only the initial still-hidden load to precede native presentation", async () => {
  await expect(
    runCursorStep(
      { ...visibleWindow(), isVisible: () => false },
      { ...step, lifecycle: "load", operation: "load" },
      async () => 42,
    ),
  ).resolves.toBe(42);
  await expect(
    runCursorStep(
      { ...visibleWindow(), isVisible: () => false },
      { ...step, lifecycle: "load", operation: "load", kind: "capture" },
      async () => 42,
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
});

it("does not let unavailable diagnostic output replace an original operation failure", async () => {
  vi.mocked(process.stdout.write).mockImplementation(() => {
    throw new Error("private sink failure");
  });
  const original = new Error("original error");
  await expect(
    runCursorStep(visibleWindow(), step, async () => {
      throw original;
    }),
  ).rejects.toBe(original);
});

it("projects bounded safe metadata and rejects arbitrary phase strings", async () => {
  let text = "";
  vi.mocked(process.stdout.write).mockImplementation((value) => {
    text += String(value);
    return true;
  });
  const extra = { ...step, secret: "private path" };
  await runCursorStep(visibleWindow(), extra, async () => 42);
  expect(text).not.toContain("secret");
  expect(text).not.toContain("private");
  expect(
    text
      .trim()
      .split("\n")
      .every((line) => Buffer.byteLength(line) < 512),
  ).toBe(true);
  await expect(
    runCursorStep(
      visibleWindow(),
      { ...step, operation: "private operation" as never },
      async () => 42,
    ),
  ).rejects.toThrow("Invalid cursor diagnostic step");
  expect(text).not.toContain("private operation");
});

it("records unavailable native inspection without arbitrary exception details", async () => {
  let text = "";
  vi.mocked(process.stdout.write).mockImplementation((value) => {
    text += String(value);
    return true;
  });
  await expect(
    runCursorStep(
      {
        ...visibleWindow(),
        getBounds: () => {
          throw new Error("private native exception");
        },
      },
      step,
      async () => 42,
    ),
  ).rejects.toMatchObject({ category: "presentation-unavailable" });
  expect(text).toContain('"native":null');
  expect(text).not.toContain("private");
});
