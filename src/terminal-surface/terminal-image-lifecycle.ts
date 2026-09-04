// Match the pinned xterm parser's main-parameter cap and state transitions,
// retaining only the information needed for RIS, DECSTR, and alternate exit.
const MAX_CSI_PARAMETERS = 32;

interface LifecycleCsiState {
  currentDigits: boolean;
  currentValue: number;
  inSubparameter: boolean;
  intermediate: "" | "!" | "other";
  parameterCount: number;
  phase: "entry" | "ignore" | "intermediate" | "parameter";
  prefix: "" | "?" | "other";
  targetParameter: boolean;
}

export class TerminalImageLifecycle {
  private escapePending = false;
  private csi: LifecycleCsiState | undefined;

  constructor(private readonly onRelease: () => void) {}

  observe(data: string): void {
    for (const character of data) {
      const code = character.codePointAt(0)!;
      if (this.csi) {
        this.observeCsi(character, code);
        continue;
      }
      if (this.escapePending) {
        this.observeEscape(character, code);
        continue;
      }
      if (code === 0x1b) this.escapePending = true;
      else if (code === 0x9b) this.csi = createLifecycleCsi();
    }
  }

  reset(): void {
    this.escapePending = false;
    this.csi = undefined;
  }

  private observeCsi(character: string, code: number): void {
    if (code === 0x1b) {
      this.csi = undefined;
      this.escapePending = true;
      return;
    }
    if (code === 0x9b) {
      this.csi = createLifecycleCsi();
      return;
    }
    if (code === 0x18 || code === 0x1a || (code >= 0x80 && code <= 0x9f)) {
      this.csi = undefined;
      return;
    }

    const result = advanceLifecycleCsi(this.csi!, character, code);
    this.csi = result.state;
    if (result.release) this.onRelease();
  }

  private observeEscape(character: string, code: number): void {
    if ((code < 0x20 && code !== 0x18 && code !== 0x1a) || code === 0x7f)
      return;
    this.escapePending = false;
    if (character === "[") this.csi = createLifecycleCsi();
    else if (character === "c") this.onRelease();
    else if (code === 0x1b) this.escapePending = true;
    else if (code === 0x9b) this.csi = createLifecycleCsi();
  }
}

function createLifecycleCsi(): LifecycleCsiState {
  return {
    currentDigits: false,
    currentValue: 0,
    inSubparameter: false,
    intermediate: "",
    parameterCount: 1,
    phase: "entry",
    prefix: "",
    targetParameter: false,
  };
}

function advanceLifecycleCsi(
  state: LifecycleCsiState,
  character: string,
  code: number,
): { readonly release: boolean; readonly state?: LifecycleCsiState } {
  if (code <= 0x1f || code === 0x7f) return retained(state);
  if (code >= 0x40 && code <= 0x7e)
    return {
      release: state.phase !== "ignore" && finishLifecycleCsi(state, character),
    };
  if (state.phase === "ignore") return retained(state);
  if (code >= 0x30 && code <= 0x39)
    return retained(consumeDigit(state, code - 0x30));
  if (character === ";") return retained(consumeParameterSeparator(state));
  if (character === ":") return retained(consumeSubparameter(state));
  if (code >= 0x3c && code <= 0x3f)
    return retained(consumePrefix(state, character));
  if (code >= 0x20 && code <= 0x2f)
    return retained(consumeIntermediate(state, character));
  return { release: false };
}

function retained(state: LifecycleCsiState): {
  readonly release: false;
  readonly state: LifecycleCsiState;
} {
  return { release: false, state };
}

function consumeDigit(
  state: LifecycleCsiState,
  digit: number,
): LifecycleCsiState {
  if (state.phase === "intermediate") {
    state.phase = "ignore";
    return state;
  }
  if (!state.inSubparameter && state.parameterCount <= MAX_CSI_PARAMETERS) {
    state.currentDigits = true;
    state.currentValue = Math.min(1_000_000, state.currentValue * 10 + digit);
    state.phase = "parameter";
  }
  return state;
}

function consumeParameterSeparator(
  state: LifecycleCsiState,
): LifecycleCsiState {
  if (state.phase === "intermediate") {
    state.phase = "ignore";
    return state;
  }
  finishLifecycleParameter(state);
  state.parameterCount = Math.min(
    MAX_CSI_PARAMETERS + 1,
    state.parameterCount + 1,
  );
  state.currentDigits = false;
  state.currentValue = 0;
  state.inSubparameter = false;
  state.phase = "parameter";
  return state;
}

function consumeSubparameter(state: LifecycleCsiState): LifecycleCsiState {
  if (state.phase === "intermediate") state.phase = "ignore";
  else {
    state.inSubparameter = true;
    state.phase = "parameter";
  }
  return state;
}

function consumePrefix(
  state: LifecycleCsiState,
  character: string,
): LifecycleCsiState {
  if (state.phase !== "entry" || state.prefix !== "") state.phase = "ignore";
  else {
    state.prefix = character === "?" ? "?" : "other";
    state.phase = "parameter";
  }
  return state;
}

function consumeIntermediate(
  state: LifecycleCsiState,
  character: string,
): LifecycleCsiState {
  finishLifecycleParameter(state);
  state.phase = "intermediate";
  // Only a single ! can dispatch DECSTR. Retain no unbounded CSI text.
  state.intermediate =
    state.intermediate === "" && character === "!" ? "!" : "other";
  return state;
}

function finishLifecycleCsi(state: LifecycleCsiState, final: string): boolean {
  finishLifecycleParameter(state);
  return (
    (final === "l" &&
      state.prefix === "?" &&
      state.intermediate === "" &&
      state.targetParameter) ||
    (final === "p" && state.prefix === "" && state.intermediate === "!")
  );
}

function finishLifecycleParameter(state: LifecycleCsiState): void {
  if (
    state.currentDigits &&
    state.parameterCount <= MAX_CSI_PARAMETERS &&
    (state.currentValue === 47 ||
      state.currentValue === 1_047 ||
      state.currentValue === 1_049)
  )
    state.targetParameter = true;
}
