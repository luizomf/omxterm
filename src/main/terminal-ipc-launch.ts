import type { TerminalSessionId } from "../shared/terminal-contract";
import {
  isTerminalLaunchSpec,
  workingDirectoryFromReport,
} from "../shared/terminal-launch";
import type { LocalTerminalSession } from "./local-terminal-session";
import type { RejectBoundary } from "./terminal-ipc-boundaries";
import type {
  TerminalIpcControllerOptions,
  TerminalSessionLaunch,
} from "./terminal-ipc-types";

// Launch resolution, OSC 7 working directories and broadcast confirmation
// for one Terminal Window. Working directories stay in memory only.
export function createLaunchRequests(
  options: Pick<
    TerminalIpcControllerOptions,
    "localHostNames" | "onWorkingDirectory" | "confirmBroadcast"
  >,
  reject: RejectBoundary,
  sessions: ReadonlyMap<
    TerminalSessionId,
    { readonly session: Pick<LocalTerminalSession, "workingDirectory"> }
  >,
  isDisposed: () => boolean,
) {
  const workingDirectories = new Map<TerminalSessionId, string>();
  return {
    resolve(launch: unknown): TerminalSessionLaunch {
      if (launch === undefined) return { kind: "default" };
      if (!isTerminalLaunchSpec(launch)) {
        reject("ipc", "invalid-payload");
        throw new TypeError("Invalid terminal launch request");
      }
      if (launch.kind !== "inherit") return launch;
      const directory =
        workingDirectories.get(launch.sessionId) ??
        sessions.get(launch.sessionId)?.session.workingDirectory?.();
      return directory === undefined
        ? { kind: "inherit" }
        : { kind: "inherit", workingDirectory: directory };
    },
    forget(sessionId: TerminalSessionId) {
      workingDirectories.delete(sessionId);
    },
    reportWorkingDirectory(payload?: unknown) {
      if (
        typeof payload !== "object" ||
        payload === null ||
        Object.keys(payload).sort().join(",") !== "sessionId,uri"
      ) {
        reject("ipc", "invalid-payload");
        return;
      }
      const { sessionId, uri } = payload as Record<string, unknown>;
      if (typeof sessionId !== "string" || typeof uri !== "string") {
        reject("ipc", "invalid-payload");
        return;
      }
      if (!sessions.has(sessionId)) {
        reject("ipc", "unknown-session");
        return;
      }
      const directory = workingDirectoryFromReport(
        uri,
        options.localHostNames ?? [],
      );
      // Remote shells report remote paths; they stay out of local launches.
      if (directory === undefined) {
        workingDirectories.delete(sessionId);
        return;
      }
      workingDirectories.set(sessionId, directory);
      options.onWorkingDirectory?.(sessionId, directory);
    },
    async confirmBroadcast(payload?: unknown): Promise<boolean> {
      if (!Number.isInteger(payload) || (payload as number) < 1) {
        reject("ipc", "invalid-payload");
        throw new TypeError("Invalid broadcast target count");
      }
      if (isDisposed()) return false;
      return options.confirmBroadcast
        ? options.confirmBroadcast(payload as number)
        : true;
    },
  };
}
