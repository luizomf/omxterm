import { rm } from "node:fs/promises";
import { vi } from "vitest";
import { runNativeFixture } from "./run-native-fixture";

export const completedFixtureOutcome = {
  exitCode: 7,
  signal: null,
  reason: "exit",
  stdout: "synthetic stdout\n",
  stderr: "synthetic stderr\n",
  cleanupErrors: ["synthetic cleanup failure"],
  ownedProcesses: [{ pid: 42, parent: 1, identity: "456" }],
};

/** Keep unit-test mocks and profiles alive until every mocked runner settles. */
export function createNativeFixtureUnitScope(
  root: string,
  preservedRoots: readonly string[] = [],
) {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const operations: Promise<unknown>[] = [];
  return {
    run(options: Parameters<typeof runNativeFixture>[0]) {
      const operation = runNativeFixture(options);
      // Observe rejection immediately without changing the caller's result.
      operations.push(operation.catch(() => undefined));
      return operation;
    },
    async teardown() {
      await Promise.all(operations);
      vi.useRealTimers();
      vi.restoreAllMocks();
      Object.defineProperty(process, "platform", platform);
      await rm(root, { recursive: true, force: true });
      await Promise.all(
        preservedRoots.map((profile) =>
          rm(profile, { recursive: true, force: true }),
        ),
      );
    },
  };
}
