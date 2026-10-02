import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createTabRemovalReadiness,
  TAB_REMOVAL_STEP_TIMEOUT,
  TAB_REMOVAL_PHASE_PREFIX,
  type TabRemovalPhase,
} from "../fixtures/tab-removal-readiness";

const observation = () => ({
  sessionCount: 1,
  initialSelected: false,
  backgroundExited: false,
  native: { visible: true, minimized: false, focused: true },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("holds first actions until initial selection acknowledgement and the renderer boundary", async () => {
  let acknowledged = false;
  let release!: () => void;
  const events: string[] = [];
  const rendererBoundary = () => {
    events.push("renderer boundary");
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const ready = createTabRemovalReadiness(observation)
    .initial(() => acknowledged, rendererBoundary)
    .then(() => events.push("first action"));
  await vi.advanceTimersByTimeAsync(250);
  expect(events).toEqual([]);
  acknowledged = true;
  await vi.advanceTimersByTimeAsync(25);
  expect(events).toEqual(["renderer boundary"]);
  release();
  await ready;
  expect(events).toEqual(["renderer boundary", "first action"]);
  expect(vi.getTimerCount()).toBe(0);
});

it("retains safe named phase evidence without replacing an original exception", async () => {
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  const original = new Error("PRIVATE clipboard and environment");
  const observe = () => ({
    ...observation(),
    payload: "PRIVATE",
    native: {
      ...observation().native,
      title: "PRIVATE",
    },
  });
  await expect(
    createTabRemovalReadiness(observe).step("load", async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  const records = lines
    .filter((l) => l.startsWith(TAB_REMOVAL_PHASE_PREFIX))
    .map(
      (l) => JSON.parse(l.slice(TAB_REMOVAL_PHASE_PREFIX.length)) as unknown,
    );
  expect(records).toEqual([
    {
      version: 1,
      phase: "load",
      status: "begin",
      category: "none",
      observation: observation(),
    },
    {
      version: 1,
      phase: "load",
      status: "failure",
      category: "operation-error",
      observation: observation(),
    },
  ]);
  expect(lines.join("")).not.toContain("PRIVATE");
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects an actually held renderer operation at its named main deadline", async () => {
  const outcomes: string[] = [];
  const running = createTabRemovalReadiness(observation)
    .step("initial-renderer-boundary", () => new Promise<void>(() => {}))
    .then(
      () => outcomes.push("resolved"),
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        outcomes.push((error as Error).message);
      },
    );
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  expect(outcomes).toEqual([
    "Tab removal fixture operation-timeout at initial-renderer-boundary",
  ]);
  await running;
  expect(vi.getTimerCount()).toBe(0);
});

it("does not replace acknowledged readiness with an arbitrary quiet delay", async () => {
  const events: string[] = [];
  await createTabRemovalReadiness(observation).initial(
    () => true,
    async () => {
      events.push("renderer boundary");
    },
  );
  expect(events).toEqual(["renderer boundary"]);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds missing initial acknowledgement and stops polling without crossing the renderer", async () => {
  const renderer = vi.fn(async () => {});
  let acknowledged = false;
  const ready = expect(
    createTabRemovalReadiness(observation).initial(
      () => acknowledged,
      renderer,
    ),
  ).rejects.toThrow("operation-timeout at initial-selection");
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  await ready;
  acknowledged = true;
  await vi.advanceTimersByTimeAsync(100);
  expect(renderer).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps actions blocked on renderer rejection even after genuine selection acknowledgement", async () => {
  const original = new Error("renderer failed");
  const firstAction = vi.fn();
  await expect(
    createTabRemovalReadiness(observation)
      .initial(
        () => true,
        async () => {
          throw original;
        },
      )
      .then(firstAction),
  ).rejects.toBe(original);
  expect(firstAction).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("consumes late renderer rejection after the deadline and retains only its original phase failure", async () => {
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  let reject!: (error: Error) => void;
  const held = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const ready = expect(
    createTabRemovalReadiness(observation).initial(
      () => true,
      () => held,
    ),
  ).rejects.toThrow("operation-timeout at initial-renderer-boundary");
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  await ready;
  const before = [...lines];
  reject(new Error("PRIVATE late error"));
  await vi.advanceTimersByTimeAsync(100);
  expect(lines).toEqual(before);
  expect(lines.join("")).not.toContain("PRIVATE");
  expect(vi.getTimerCount()).toBe(0);
});

it("stops a held async condition after deadline rather than polling external I/O again", async () => {
  let finish!: (value: boolean) => void;
  const held = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const condition = vi.fn(() => held);
  const ready = expect(
    createTabRemovalReadiness(observation).waitFor(
      "background-exit",
      condition,
    ),
  ).rejects.toThrow("operation-timeout at background-exit");
  await vi.advanceTimersByTimeAsync(TAB_REMOVAL_STEP_TIMEOUT + 1);
  await ready;
  finish(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(condition).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("clears the operation timer and aborts owned polling on success or synchronous failure", async () => {
  let signal!: AbortSignal;
  const ready = createTabRemovalReadiness(observation);
  expect(
    await ready.step("load", async (value) => {
      signal = value;
      return "loaded";
    }),
  ).toBe("loaded");
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const error = new Error("original");
  await expect(
    ready.step("load", (value) => {
      signal = value;
      throw error;
    }),
  ).rejects.toBe(error);
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects unknown phase labels before invoking I/O or emitting arbitrary text", async () => {
  const lines: string[] = [];
  const operation = vi.fn(async () => true);
  const ready = createTabRemovalReadiness(observation, (line) => {
    lines.push(line);
  });
  await expect(
    ready.step("PRIVATE arbitrary expression" as TabRemovalPhase, operation),
  ).rejects.toThrow("Invalid tab removal phase");
  expect(operation).not.toHaveBeenCalled();
  expect(lines).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it("projects only bounded finite session counts into retained diagnostics", async () => {
  const lines: string[] = [];
  for (const sessionCount of [NaN, Infinity, -1, 4, 1.5]) {
    await createTabRemovalReadiness(
      () => ({ ...observation(), sessionCount }),
      (line) => {
        lines.push(line);
      },
    ).step("load", async () => {});
  }
  for (const line of lines) {
    expect(
      JSON.parse(line.slice(TAB_REMOVAL_PHASE_PREFIX.length)) as unknown,
    ).toMatchObject({ observation: { sessionCount: 0 } });
  }
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves outcomes when native observation or diagnostic output is unavailable", async () => {
  const lines: string[] = [];
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  expect(
    await createTabRemovalReadiness(() => {
      throw new Error("PRIVATE");
    }).step("load", async () => 3),
  ).toBe(3);
  expect(lines.join("")).toContain('"observation":null');
  expect(lines.join("")).not.toContain("PRIVATE");
  write.mockImplementation(() => {
    throw new Error("sink unavailable");
  });
  expect(
    await createTabRemovalReadiness(observation).step("load", async () => 4),
  ).toBe(4);
  const error = new Error("original");
  await expect(
    createTabRemovalReadiness(observation).step("load", async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(vi.getTimerCount()).toBe(0);
});
