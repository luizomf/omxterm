import { rm } from "node:fs/promises";

/** Remove an unlaunched, settled profile without losing its original failure. */
export async function removeFailedFixture(
  root: string,
  error: unknown,
): Promise<never> {
  try {
    await rm(root, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "Fixture preparation and owned profile cleanup failed",
      { cause: error },
    );
  }
  throw error;
}
