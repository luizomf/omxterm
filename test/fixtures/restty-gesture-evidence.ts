export type ResttyGestureName =
  | "modifiedDrag"
  | "plainPrimary"
  | "modifiedMiddle"
  | "changedUrl"
  | "releasedModifier"
  | "wheel"
  | "alternatePrimary"
  | "alternateWheel";

export interface ResttyGestureEvidence {
  readonly mouseReports: string;
  readonly expectedMouseReports: string;
  readonly activationsBefore: number;
  readonly activationsAfter: number;
  readonly inputStart: number;
  readonly inputEnd: number;
  readonly unattributedInput: string;
}

// The fixture gestures use zero-based (3,0), with drag release at (3,1).
// Mode 1000 has no motion report; SGR uses one-based coordinates. Meta adds
// nothing, Ctrl adds 16, and a released modifier must not survive on pointer-up.
export function expectedResttyGestureReports(
  name: ResttyGestureName,
  platform: string,
): string {
  const modified = platform === "darwin" ? 0 : 16;
  switch (name) {
    case "modifiedDrag":
      return `\u001b[<${modified};4;1M\u001b[<${modified};4;2m`;
    case "modifiedMiddle":
      return `\u001b[<${modified + 1};4;1M\u001b[<${modified + 1};4;1m`;
    case "changedUrl":
      return `\u001b[<${modified};4;1M\u001b[<${modified};4;1m`;
    case "releasedModifier":
      return `\u001b[<${modified};4;1M\u001b[<0;4;1m`;
    case "plainPrimary":
    case "alternatePrimary":
      return "\u001b[<0;4;1M\u001b[<0;4;1m";
    case "wheel":
      // The actual runtime supplies wheel cell metrics: two line ticks, not
      // the sign-only fallback used by an encoder without those metrics.
      return "\u001b[<65;4;1M\u001b[<65;4;1M";
    case "alternateWheel":
      return "\u001b[<64;4;1M";
  }
}

export function gestureInputSince(
  inputs: readonly string[],
  start: number,
): string {
  // Ignore only native focus reports; every other byte remains attributable.
  return inputs
    .join("")
    .slice(start)
    .replaceAll(/\u001b\[[IO]/gu, "");
}

export function assertResttyGestureEvidence(
  name: ResttyGestureName,
  evidence: ResttyGestureEvidence,
  platform: string,
): void {
  const expected = expectedResttyGestureReports(name, platform);
  if (evidence.mouseReports !== expected)
    throw new Error(
      `${name} mouse reports: expected ${JSON.stringify(expected)}, received ${JSON.stringify(evidence.mouseReports)}; activationDelta=${evidence.activationsAfter - evidence.activationsBefore}`,
    );
  if (evidence.activationsAfter !== evidence.activationsBefore)
    throw new Error(`${name} unexpectedly activated a destination`);
  if (evidence.unattributedInput !== "")
    throw new Error(
      `${name} has unattributed input: ${JSON.stringify(evidence.unattributedInput)}`,
    );
}

export function createResttyGestureRecorder(options: {
  readonly inputs: readonly string[];
  readonly activations: () => number;
  readonly drain: () => Promise<void>;
  readonly platform: string;
}) {
  let previousEnd = options.inputs.join("").length;
  return async (
    name: ResttyGestureName,
    dispatch: () => Promise<void>,
  ): Promise<ResttyGestureEvidence> => {
    await options.drain();
    const betweenGestures = gestureInputSince(options.inputs, previousEnd);
    if (betweenGestures !== "")
      throw new Error(
        `${name} has leftover input before dispatch: ${JSON.stringify(betweenGestures)}`,
      );
    const inputStart = options.inputs.join("").length;
    const activationsBefore = options.activations();
    await dispatch();
    await options.drain();
    const mouseReports = gestureInputSince(options.inputs, inputStart);
    const inputEnd = options.inputs.join("").length;
    // A second renderer/main round trip must not bring a late report that
    // could otherwise be credited to the next gesture.
    await options.drain();
    const evidence = {
      mouseReports,
      expectedMouseReports: expectedResttyGestureReports(
        name,
        options.platform,
      ),
      activationsBefore,
      activationsAfter: options.activations(),
      inputStart,
      inputEnd,
      unattributedInput: gestureInputSince(options.inputs, inputEnd),
    };
    assertResttyGestureEvidence(name, evidence, options.platform);
    previousEnd = options.inputs.join("").length;
    return evidence;
  };
}
