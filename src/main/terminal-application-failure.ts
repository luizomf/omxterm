export type TerminalApplicationFailureStage =
  "launch-request" | "renderer-load" | "new-window" | "startup";

interface TerminalApplicationFailureDescription {
  readonly title: string;
  readonly message: string;
}

const descriptions: Record<
  TerminalApplicationFailureStage,
  TerminalApplicationFailureDescription
> = {
  "launch-request": {
    title: "OMXTerm could not start",
    message: "The -e option requires an executable.",
  },
  "renderer-load": {
    title: "Terminal Window could not load",
    message: "OMXTerm could not load the Terminal Window renderer.",
  },
  "new-window": {
    title: "Terminal Window could not open",
    message: "OMXTerm could not create a new Terminal Window.",
  },
  startup: {
    title: "OMXTerm could not start",
    message: "The initial Terminal Window could not be created.",
  },
};

export class TerminalApplicationFailure extends Error {
  readonly stage: TerminalApplicationFailureStage;

  constructor(stage: TerminalApplicationFailureStage, cause: unknown) {
    super(descriptions[stage].message, { cause });
    this.name = "TerminalApplicationFailure";
    this.stage = stage;
  }
}

export function terminalApplicationFailure(
  stage: TerminalApplicationFailureStage,
  cause: unknown,
): TerminalApplicationFailure {
  return new TerminalApplicationFailure(stage, cause);
}

export function terminalApplicationFailureDisplay(
  failure: TerminalApplicationFailure,
): TerminalApplicationFailureDescription {
  return descriptions[failure.stage];
}
