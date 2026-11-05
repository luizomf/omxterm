import type { SettingsChange, SettingsResult } from "../shared/settings";

// Owns request ordering and latest-choice replacement together. Callers submit
// immediately; no view lifetime or timer can discard the final choice.
export function createSettingsQueue(
  applyChange: (change: SettingsChange) => Promise<SettingsResult>,
) {
  let queue: Promise<unknown> = Promise.resolve();
  let pendingChoice:
    | {
        selection: { change: SettingsChange };
        result: Promise<SettingsResult>;
      }
    | undefined;

  const run = <Result>(task: () => Promise<Result>) => {
    // Every different operation is an ordering barrier, including reads.
    pendingChoice = undefined;
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };

  const change = (submitted: SettingsChange): Promise<SettingsResult> => {
    // Capture the request rather than retaining a caller's mutable object.
    const requested = { ...submitted };
    if (
      requested.path !== "theme.path" &&
      requested.path !== "window.transparency"
    )
      return run(() => applyChange(requested));

    let job = pendingChoice;
    if (job?.selection.change.path !== requested.path) job = undefined;
    if (job) job.selection.change = requested;
    else {
      const selection = { change: requested };
      const result = run(() => {
        // Once validation/write/reload starts, it must run to completion.
        if (pendingChoice?.selection === selection) pendingChoice = undefined;
        return applyChange(selection.change);
      });
      pendingChoice = job = { selection, result };
    }
    const selected = job;
    return selected.result.then((result) =>
      selected.selection.change === requested
        ? result
        : { status: "superseded", snapshot: result.snapshot },
    );
  };

  return { run, change };
}
