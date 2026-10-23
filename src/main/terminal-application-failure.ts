import type { MessageKey } from "../shared/i18n";
import { CommandLineOptionError } from "./command-line-options";
import { mainTranslator } from "./main-translator";
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

// The dialog text, in the main process language.
export function terminalApplicationFailureDisplay(
  failure: TerminalApplicationFailure,
): TerminalApplicationFailureDescription {
  const t = mainTranslator().t.bind(mainTranslator());
  const [title, message] = DISPLAY_KEYS[failure.stage];
  return { title: t(title), message: t(message) };
}

const DISPLAY_KEYS: Record<
  TerminalApplicationFailureStage,
  readonly [MessageKey, MessageKey]
> = {
  "launch-request": ["failure.start.title", "failure.launchRequest"],
  "command-line": ["failure.start.title", "failure.commandLine"],
  "renderer-load": [
    "failure.rendererLoad.title",
    "failure.rendererLoad.message",
  ],
  "new-window": ["failure.newWindow.title", "failure.newWindow.message"],
  startup: ["failure.start.title", "failure.startup"],
};

// The stage of a failure before the first window, by the kind of its cause.
export function startupFailureStage(
  cause: unknown,
): TerminalApplicationFailureStage {
  if (cause instanceof MalformedLaunchRequestError) return "launch-request";
  if (cause instanceof CommandLineOptionError) return "command-line";
  return "startup";
}
