import type { BrowserWindow } from "electron";

const lifecycles = [
  "load",
  "mount",
  "initial",
  "zoom",
  "refit",
  "reload",
  "dispose",
] as const;
const operations = [
  "load",
  "mount",
  "phase",
  "cursor",
  "blur",
  "focus",
  "dispose",
  "hidden",
  "bar0",
  "bar1",
  "block0",
  "underline0",
  "unfocused",
  "refocused",
  "blink",
] as const;
export const CURSOR_PHASE_PREFIX = "__OMXTERM_CURSOR_PHASE__";
export const CURSOR_STEP_TIMEOUT = 5000;

export function selectCursorPresentationControl(
  declaration: string | undefined,
): "early-minimize" | "early-hide" {
  if (
    declaration !== undefined &&
    declaration !== "minimize" &&
    declaration !== "hide"
  )
    throw new Error(
      "OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL must be minimize or hide",
    );
  return declaration === "hide" ? "early-hide" : "early-minimize";
}

export interface CursorStep {
  readonly dpr: 1 | 2;
  readonly font: "bundled" | "configured";
  readonly padding: 0 | 8;
  readonly lifecycle: (typeof lifecycles)[number];
  readonly kind: "execute" | "capture";
  readonly operation: (typeof operations)[number];
}
export type CursorWindow = Pick<
  BrowserWindow,
  "isVisible" | "isMinimized" | "isFocused" | "getBounds"
>;
export interface CursorDiagnostic {
  readonly version: 1;
  readonly step: CursorStep;
  readonly status: "begin" | "complete" | "failure";
  readonly category:
    | "none"
    | "presentation-unavailable"
    | "operation-timeout"
    | "operation-error";
  readonly native: {
    readonly visible: boolean;
    readonly minimized: boolean;
    readonly focused: boolean;
    readonly bounds: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  } | null;
}

class CursorReadinessError extends Error {
  constructor(
    readonly category: "presentation-unavailable" | "operation-timeout",
    step: CursorStep,
  ) {
    super(
      `Cursor fixture ${category} at ${step.font}/${step.padding}/${step.lifecycle}/${step.kind}/${step.operation}`,
    );
  }
}

function nativeState(window: CursorWindow): CursorDiagnostic["native"] {
  try {
    const bounds = window.getBounds();
    const integer = (value: number) =>
      Number.isSafeInteger(value) ? value : 0;
    return {
      visible: window.isVisible() === true,
      minimized: window.isMinimized() === true,
      focused: window.isFocused() === true,
      bounds: {
        x: integer(bounds.x),
        y: integer(bounds.y),
        width: integer(bounds.width),
        height: integer(bounds.height),
      },
    };
  } catch {
    return null;
  }
}

/** Fixture metadata only, retained by the existing supervisor outside its profile.
 * Never completion/ownership evidence; never renderer expressions or error payloads.
 */
export async function runCursorStep<T>(
  window: CursorWindow,
  input: CursorStep,
  operation: () => Promise<T>,
): Promise<T> {
  // Project a fixed vocabulary, even if a caller supplies additional properties.
  if (
    ![1, 2].includes(input.dpr) ||
    ![0, 8].includes(input.padding) ||
    !["bundled", "configured"].includes(input.font) ||
    !lifecycles.includes(input.lifecycle) ||
    !["execute", "capture"].includes(input.kind) ||
    !operations.includes(input.operation)
  )
    throw new Error("Invalid cursor diagnostic step");
  const { dpr, font, padding, lifecycle, kind, operation: name } = input;
  const step: CursorStep = {
    dpr,
    font,
    padding,
    lifecycle,
    kind,
    operation: name,
  };
  const record = (
    status: CursorDiagnostic["status"],
    category: CursorDiagnostic["category"],
  ) => {
    try {
      const value: CursorDiagnostic = {
        version: 1,
        step,
        status,
        category,
        native: nativeState(window),
      };
      process.stdout.write(`${CURSOR_PHASE_PREFIX}${JSON.stringify(value)}\n`);
    } catch {
      // A missing diagnostic must not hide the original failure or create success.
    }
  };
  // Loading the still-hidden renderer precedes showInactive; only this step is exempt.
  const loading = lifecycle === "load" && kind === "execute" && name === "load";
  const presented = () => {
    const state = nativeState(window);
    return loading || Boolean(state?.visible && !state.minimized);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  record("begin", "none");
  try {
    if (!presented())
      throw new CursorReadinessError("presentation-unavailable", step);
    // Same local Promise.race/finally-clear pattern as the appearance fixture.
    const result = await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CursorReadinessError(
                presented() ? "operation-timeout" : "presentation-unavailable",
                step,
              ),
            ),
          CURSOR_STEP_TIMEOUT,
        );
      }),
    ]);
    if (!presented())
      throw new CursorReadinessError("presentation-unavailable", step);
    record("complete", "none");
    return result;
  } catch (error) {
    record(
      "failure",
      error instanceof CursorReadinessError
        ? error.category
        : "operation-error",
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
