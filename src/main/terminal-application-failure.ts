import { CommandLineOptionError } from "./command-line-options";
import { MalformedLaunchRequestError } from "./launch-request";

export type TerminalApplicationFailureStage =
  | "launch-request"
  | "command-line"
  | "renderer-load"
  | "new-window"
  | "startup";

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
  "command-line": {
    title: "OMXTerm could not start",
    message:
      "A command-line option is invalid. Run omxterm --help to see the supported options.",
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

// The stage of a failure before the first window, by the kind of its cause.
export function startupFailureStage(
  cause: unknown,
): TerminalApplicationFailureStage {
  if (cause instanceof MalformedLaunchRequestError) return "launch-request";
  if (cause instanceof CommandLineOptionError) return "command-line";
  return "startup";
}
