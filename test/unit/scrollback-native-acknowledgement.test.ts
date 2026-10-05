import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { scrollbackInputEvidence } from "../fixtures/scrollback-input-evidence";
import { buildFixture } from "../fixtures/restty-scrollback-rendering-build";
import {
  hasNativeDrag,
  observeScrollbackNativeInput,
  type NativeInputObservation,
} from "../fixtures/scrollback-native-input";

// Exercise the emitted main caller, not a duplicate of its polling algorithm.
// Bundling is external I/O; source generation and the input observer stay real.
vi.mock("esbuild", () => ({ build: vi.fn(async () => {}) }));
let caller: string;
beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-scrollback-caller-"));
  try {
    await buildFixture(root);
    const source = await readFile(path.join(root, "main.cjs"), "utf8");
    await mkdir(".scratch", { recursive: true });
    await writeFile(".scratch/scrollback-native-caller.generated.cjs", source);
    const section = (start: string, end: string) => {
      expect(source.split(start)).toHaveLength(2);
      expect(source.split(end)).toHaveLength(2);
      return source.slice(source.indexOf(start), source.indexOf(end));
    };
    caller = `(async () => {
      ${section("class StimulusTimeout", "async function prepareInput")}
      ${section("const autoscrollStartTop", "window.setSize(700, 440)")}
      return { nativeDrag, autoscrolledTop };
    })()`;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface InputOptions {
  invalid?:
    | "absent"
    | "malformed"
    | "untrusted"
    | "coordinates"
    | "identity"
    | "buttons"
    | "target"
    | "not-dragging";
  registerAfterDelivery?: boolean;
  deliveryDelayMs?: number;
  consumptionDelayMs?: number;
  delayInputDeadline?: boolean;
  cancelled?: boolean;
  unexpectedWrite?: boolean;
}

function rendererInput(options: InputOptions) {
  const listeners = new Map<string, ((event: PointerEvent) => void)[]>();
  let dragging = false;
  const input = { disabled: false, addEventListener() {} };
  const host = { scrollTop: 39368, scrollHeight: 39836, clientHeight: 468 };
  const canvas = {
    addEventListener(type: string, listener: (event: PointerEvent) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 468 }),
  };
  const document = {
    hasFocus: () => true,
    activeElement: input,
    querySelector: () => host,
  };
  vi.stubGlobal("document", document);
  const evidence = scrollbackInputEvidence();
  const observer = observeScrollbackNativeInput(
    canvas as unknown as HTMLCanvasElement,
    input as unknown as HTMLTextAreaElement,
    () => dragging,
    () => false,
    evidence,
  );
  const deliver = (type: string, x: number, y: number, buttons: number) => {
    // This port models browser-trusted delivery and live product drag state;
    // it does not synthesize native/rendering qualification or a scroll result.
    const moved = type === "pointermove";
    if (moved && options.unexpectedWrite) evidence.write("private input");
    dragging = moved && options.invalid !== "not-dragging";
    const event = {
      type,
      clientX: x,
      clientY: moved && options.invalid === "coordinates" ? y + 1 : y,
      buttons: moved && options.invalid === "buttons" ? 0 : buttons,
      pointerId: moved && options.invalid === "identity" ? 2 : 1,
      isTrusted:
        moved && options.invalid === "malformed"
          ? undefined
          : !(moved && options.invalid === "untrusted"),
      target: moved && options.invalid === "target" ? input : canvas,
    } as unknown as PointerEvent;
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  return { observer, document, deliver };
}

async function exercise(withholdPoll: boolean, options: InputOptions = {}) {
  vi.useFakeTimers();
  const renderer = rendererInput(options);
  let released = false;
  let releasedAt: number | undefined;
  let pendingEvaluations = 0;
  let acknowledgedAt: number | undefined;
  const exposure: { start: number; end?: number }[] = [];
  const viewportReads: { at: number; released: boolean }[] = [];
  const startedAt = Date.now();
  let moveSent = false;
  const records: string[] = [];
  const context = {
    document: renderer.document,
    __omxtermResttyScrollback: {
      nativeInput: renderer.observer.snapshot,
      waitForNativeDrag: renderer.observer.waitForDrag,
    },
  };
  const window = {
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => true,
    webContents: {
      executeJavaScript: async (source: string): Promise<unknown> => {
        if (!source.includes("waitForNativeDrag")) {
          if (
            source ===
            "document.querySelector('.restty-native-scroll-host').scrollTop"
          )
            viewportReads.push({ at: Date.now() - startedAt, released });
          return runInNewContext(source, context);
        }
        if (options.registerAfterDelivery)
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        pendingEvaluations += 1;
        const evaluation = (
          runInNewContext(source, context) as Promise<unknown>
        ).finally(() => {
          pendingEvaluations -= 1;
        });
        if (options.cancelled)
          return Promise.race([
            evaluation,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Renderer destroyed")), 10),
            ),
          ]);
        const value = await evaluation;
        if (options.consumptionDelayMs)
          await new Promise<void>((resolve) =>
            setTimeout(resolve, options.consumptionDelayMs),
          );
        acknowledgedAt = Date.now() - startedAt;
        return value;
      },
      sendInputEvent(event: { type: string; x: number; y: number }) {
        if (event.type === "mouseDown")
          renderer.deliver("pointerdown", event.x, event.y, 1);
        if (event.type === "mouseMove") {
          moveSent = true;
          if (options.invalid !== "absent")
            setTimeout(
              () => renderer.deliver("pointermove", event.x, event.y, 1),
              options.deliveryDelayMs ?? 5,
            );
        }
        if (event.type === "mouseUp") {
          released = true;
          releasedAt = Date.now() - startedAt;
          renderer.deliver("pointerup", event.x, event.y, 0);
        }
      },
    },
  };
  const operation = runInNewContext(caller, {
    window,
    hasNativeDrag,
    Date,
    clearTimeout,
    setTimeout: (callback: () => void, delay: number) => {
      const withheld = withholdPoll && moveSent && delay === 25;
      const lateDeadline = options.delayInputDeadline && delay === 5000;
      const held =
        delay === 500 ? { start: Date.now() - startedAt } : undefined;
      if (held) exposure.push(held);
      return setTimeout(
        () => {
          if (held) Object.assign(held, { end: Date.now() - startedAt });
          callback();
        },
        lateDeadline ? 6000 : withheld ? 600 : delay,
      );
    },
    process: { stdout: { write: (text: string) => records.push(text) } },
    autoscroll: { startTop: 39368, x: 80, startY: 438, endY: 0 },
  }) as Promise<{
    nativeDrag: NativeInputObservation;
    autoscrolledTop: number;
  }>;
  const outcome = operation.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error: String(error) }),
  );
  await vi.advanceTimersByTimeAsync(7000);
  return {
    ...(await outcome),
    released,
    releasedAt,
    pendingEvaluations,
    acknowledgedAt,
    exposure,
    viewportReads,
    observed: renderer.observer.snapshot(),
    records,
  };
}

it.each([false, true])(
  "acknowledges valid renderer drag without requiring a punctual main polling timer (withheld=%s)",
  async (withheld) => {
    const result = await exercise(withheld);
    expect(result.observed.move).toMatchObject({
      trusted: true,
      canvas: true,
      buttons: 1,
      dragging: true,
    });
    expect(result.released).toBe(true);
    expect(result.error).toBeNull();
    expect(result.acknowledgedAt).toBe(5);
    expect(result.exposure).toEqual([{ start: 5, end: 505 }]);
    expect(result.releasedAt).toBe(505);
    expect(result.pendingEvaluations).toBe(0);
    expect(result.value?.nativeDrag.move).toMatchObject({
      x: 80,
      y: 0,
      dragging: true,
    });
  },
);

it("acknowledges matching input delivered before renderer registration", async () => {
  const result = await exercise(true, { registerAfterDelivery: true });
  expect(result.error).toBeNull();
  expect(result.value?.nativeDrag.move?.dragging).toBe(true);
  expect(result.exposure).toEqual([{ start: 10, end: 510 }]);
  expect(result.releasedAt).toBe(510);
});

it.each([
  { deliveryDelayMs: 600, consumptionDelayMs: 0, acknowledgedAt: 600 },
  { deliveryDelayMs: 5, consumptionDelayMs: 550, acknowledgedAt: 555 },
])(
  "holds for 500ms after bounded acknowledgment beyond the former 500ms gate: %j",
  async (options) => {
    const result = await exercise(true, options);
    expect(result.observed.move).toMatchObject({
      trusted: true,
      canvas: true,
      dragging: true,
    });
    expect(result.error).toBeNull();
    expect(result.acknowledgedAt).toBe(options.acknowledgedAt);
    expect(result.exposure).toEqual([
      { start: options.acknowledgedAt, end: options.acknowledgedAt + 500 },
    ]);
    expect(result.releasedAt).toBe(options.acknowledgedAt + 500);
    expect(result.viewportReads).toEqual([
      { at: result.releasedAt, released: true },
    ]);
    expect(result.value?.autoscrolledTop).toBe(39368);
  },
);

it.each<NonNullable<InputOptions["invalid"]>>([
  "absent",
  "malformed",
  "untrusted",
  "coordinates",
  "identity",
  "buttons",
  "target",
  "not-dragging",
])(
  "rejects %s input without relaxing the original drag predicate",
  async (invalid) => {
    const result = await exercise(true, { invalid });
    expect(result.error).toBe(
      "Error: Scrollback stimulus-unavailable at mouse-drag",
    );
    expect(result.value).toBeNull();
    expect(result.released).toBe(true);
    expect(result.releasedAt).toBe(5000);
    expect(result.exposure).toEqual([]);
    expect(result.viewportReads).toEqual([]);
    expect(result.pendingEvaluations).toBe(0);
  },
);

it.each([false, true])(
  "rejects consumption beyond the ordinary bound without reviving an ended phase (deadline delayed=%s)",
  async (delayInputDeadline) => {
    const result = await exercise(true, {
      consumptionDelayMs: 5100,
      delayInputDeadline,
    });
    expect(result.observed.move?.dragging).toBe(true);
    expect(result.error).toBe(
      "Error: Scrollback stimulus-unavailable at mouse-drag",
    );
    expect(result.releasedAt).toBe(delayInputDeadline ? 5105 : 5000);
    expect(result.exposure).toEqual([]);
    expect(result.viewportReads).toEqual([]);
    const phases = result.records.map(
      (line) =>
        JSON.parse(line.slice("__OMXTERM_SCROLLBACK_INPUT__".length)) as {
          phase: string;
          status: string;
        },
    );
    expect(phases).not.toContainEqual(
      expect.objectContaining({ phase: "mouse-drag", status: "complete" }),
    );
  },
);

it("does not restart exposure when matching delivery arrives after the phase ended", async () => {
  const result = await exercise(true, { deliveryDelayMs: 5100 });
  expect(result.error).toBe(
    "Error: Scrollback stimulus-unavailable at mouse-drag",
  );
  expect(result.value).toBeNull();
  expect(result.releasedAt).toBe(5000);
  expect(result.exposure).toEqual([]);
  expect(result.viewportReads).toEqual([]);
  expect(result.pendingEvaluations).toBe(0);
});

it("classifies unexpected Adapter input as an invalidated stimulus without retaining its contents", async () => {
  const result = await exercise(true, { unexpectedWrite: true });
  expect(result.error).toBe(
    "Error: Scrollback stimulus-invalidated at mouse-drag",
  );
  expect(result.released).toBe(true);
  expect(result.exposure).toEqual([]);
  expect(result.records.join("")).toContain('"writes":1');
  expect(result.records.join("")).not.toContain("private input");
});

it("releases the held button when the renderer evaluation is cancelled", async () => {
  const result = await exercise(true, { invalid: "absent", cancelled: true });
  expect(result.error).toBe("Error: Scrollback operation-error at mouse-drag");
  expect(result.releasedAt).toBe(10);
  expect(result.exposure).toEqual([]);
  expect(result.viewportReads).toEqual([]);
  expect(result.pendingEvaluations).toBe(0);
  expect(result.observed.up).toMatchObject({ buttons: 0, dragging: false });
});
