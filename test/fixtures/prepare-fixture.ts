import { removeFailedFixture } from "./remove-failed-fixture";

type PreparationTask = () => Promise<unknown>;
type StartPreparationTask = (task: PreparationTask) => Promise<unknown>;

export type FixtureCleanupOwner = "recipe" | "runner";

/** Join pre-launch writers; delegated cleanup belongs to the identity-checking runner. */
export async function prepareFixture(
  root: string,
  prepare: (start: StartPreparationTask) => Promise<void>,
  cleanupOwner: FixtureCleanupOwner = "recipe",
): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const start: StartPreparationTask = (task) => {
    // Register before invocation, including tasks whose setup throws synchronously.
    const operation = Promise.resolve().then(task);
    pending.push(operation);
    return operation;
  };
  try {
    await prepare(start);
    await Promise.all(pending);
  } catch (error) {
    // A caller's finally must not remove the root while a writer can recreate it.
    await Promise.allSettled(pending);
    if (cleanupOwner === "runner") throw error;
    return removeFailedFixture(root, error);
  }
}
