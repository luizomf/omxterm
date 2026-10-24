import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type MessageKey,
  type Translator,
} from "../shared/i18n";
export type TerminalApplicationFailureStage =
  "launch-request" | "renderer-load" | "new-window" | "startup";

interface TerminalApplicationFailureDescription {
  readonly title: string;
  readonly message: string;
}

const descriptions: Record<
  TerminalApplicationFailureStage,
  readonly [title: MessageKey, message: MessageKey]
> = {
  "launch-request": ["failure.start.title", "failure.launchRequest"],
  "renderer-load": [
    "failure.rendererLoad.title",
    "failure.rendererLoad.message",
  ],
  "new-window": ["failure.newWindow.title", "failure.newWindow.message"],
  startup: ["failure.start.title", "failure.startup"],
};
const english = translatorFor(DEFAULT_LANGUAGE);

export class TerminalApplicationFailure extends Error {
  readonly stage: TerminalApplicationFailureStage;

  constructor(stage: TerminalApplicationFailureStage, cause: unknown) {
    super(english.t(descriptions[stage][1]), { cause });
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
  { t }: Translator = english,
): TerminalApplicationFailureDescription {
  const [title, message] = descriptions[failure.stage];
  return { title: t(title), message: t(message) };
}
