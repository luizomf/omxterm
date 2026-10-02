export const siblingResponseToken = "__UNAFFECTED_AFTER_BACKEND_LOSS__";

export function siblingResponseCommand(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? "Write-Output ('__UNAFFECTED_'+'AFTER_BACKEND_LOSS__')"
    : "printf '%s%s\\n' '__UNAFFECTED_' 'AFTER_BACKEND_LOSS__'";
}

export function hasSiblingResponse(text: string): boolean {
  return text.includes(siblingResponseToken);
}

export async function waitForSiblingResponse(options: {
  readonly sourceOutput: () => string;
  readonly destinationText: () => string | Promise<string>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
  readonly diagnosticTimeoutMs?: number;
}) {
  // Broad qualification retains the host's existing waitFor. A focused defect
  // control can bound each evidence phase without racing an orphaned wait loop.
  async function waitForEvidence(
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) {
    const timeout = options.diagnosticTimeoutMs;
    const deadline = timeout === undefined ? Infinity : Date.now() + timeout;
    await options.waitFor(async () => {
      if (Date.now() >= deadline)
        throw new Error(`Timed out waiting for ${label}`);
      const accepted = await predicate();
      if (!accepted && Date.now() >= deadline)
        throw new Error(`Timed out waiting for ${label}`);
      return accepted;
    }, label);
  }
  await waitForEvidence(
    () => hasSiblingResponse(options.sourceOutput()),
    "sibling source executed response after backend loss",
  );
  await waitForEvidence(
    async () => hasSiblingResponse(await options.destinationText()),
    "sibling destination response in surviving Surface core after backend loss (source executed response observed)",
  );
  return { executedResponse: true, responseInSurvivingSurface: true };
}
