const phases = [
  "app-ready",
  "window",
  "load",
  "first-program",
  "second-program",
  "third-program",
  "initial-selection",
  "initial-renderer-boundary",
  "save-canvases",
  "select-a",
  "background-exit",
  "paste",
  "selection-identity",
  "pasted-line",
  "native-keyboard",
  "snippet-loaded",
  "snippet-click",
  "snippet-delivered",
  "verification",
  "control-held-surface",
  "control-release-surface",
] as const;
export type TabRemovalPhase = (typeof phases)[number];
export const TAB_REMOVAL_STEP_TIMEOUT = 5000;
export const TAB_REMOVAL_PHASE_PREFIX = "__OMXTERM_TAB_REMOVAL_PHASE__";
export const TAB_REMOVAL_CONTROL_PREFIX = "__OMXTERM_TAB_REMOVAL_CONTROL__";

export interface TabRemovalObservation {
  readonly sessionCount: number;
  readonly initialSelected: boolean;
  readonly backgroundExited: boolean;
  readonly native: {
    readonly visible: boolean;
    readonly minimized: boolean;
    readonly focused: boolean;
  } | null;
}
export interface TabRemovalDiagnostic {
  readonly version: 1;
  readonly phase: TabRemovalPhase;
  readonly status: "begin" | "complete" | "failure";
  readonly category: "none" | "operation-timeout" | "operation-error";
  readonly observation: TabRemovalObservation | null;
}

class TabRemovalDeadline extends Error {
  constructor(phase: TabRemovalPhase) {
    super(`Tab removal fixture operation-timeout at ${phase}`);
  }
}

export function createTabRemovalReadiness(
  observe: () => TabRemovalObservation,
  emit: (line: string) => void = (line) => {
    process.stdout.write(line);
  },
) {
  const record = (
    phase: TabRemovalPhase,
    status: TabRemovalDiagnostic["status"],
    category: TabRemovalDiagnostic["category"],
  ) => {
    try {
      const value: TabRemovalDiagnostic = {
        version: 1,
        phase,
        status,
        category,
        observation: safeObservation(observe),
      };
      emit(`${TAB_REMOVAL_PHASE_PREFIX}${JSON.stringify(value)}\n`);
    } catch {
      // Missing diagnostics never replace the original outcome or establish success.
    }
  };
  async function step<T>(
    phase: TabRemovalPhase,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!phases.includes(phase)) throw new Error("Invalid tab removal phase");
    const cancellation = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    record(phase, "begin", "none");
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => operation(cancellation.signal)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new TabRemovalDeadline(phase)),
            TAB_REMOVAL_STEP_TIMEOUT,
          );
        }),
      ]);
      record(phase, "complete", "none");
      return result;
    } catch (error) {
      record(
        phase,
        "failure",
        error instanceof TabRemovalDeadline
          ? "operation-timeout"
          : "operation-error",
      );
      throw error;
    } finally {
      clearTimeout(timer);
      cancellation.abort();
    }
  }
  const waitFor = (
    phase: TabRemovalPhase,
    predicate: () => boolean | Promise<boolean>,
  ) => step(phase, (signal) => poll(predicate, signal));
  return {
    step,
    waitFor,
    async initial(
      acknowledged: () => boolean,
      rendererBoundary: () => Promise<unknown>,
    ) {
      await waitFor("initial-selection", acknowledged);
      await step("initial-renderer-boundary", rendererBoundary);
    },
  };
}

function safeObservation(
  observe: () => TabRemovalObservation,
): TabRemovalObservation | null {
  try {
    const { sessionCount, initialSelected, backgroundExited, native } =
      observe();
    return {
      sessionCount:
        Number.isSafeInteger(sessionCount) &&
        sessionCount >= 0 &&
        sessionCount <= 3
          ? sessionCount
          : 0,
      initialSelected: initialSelected === true,
      backgroundExited: backgroundExited === true,
      native:
        native === null
          ? null
          : {
              visible: native.visible === true,
              minimized: native.minimized === true,
              focused: native.focused === true,
            },
    };
  } catch {
    return null;
  }
}

async function poll(
  predicate: () => boolean | Promise<boolean>,
  signal: AbortSignal,
) {
  for (;;) {
    signal.throwIfAborted();
    const satisfied = await predicate();
    signal.throwIfAborted();
    if (satisfied) return;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(finish, 25);
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
