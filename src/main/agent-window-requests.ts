// One correlated, time-bounded request to a granted window (a pane's text,
// a press's bytes, its tabs, a shortcut's action), and the settling of each
// answer by its own channel only (ADR 0052).
import { randomUUID } from "node:crypto";
import {
  agentIpc,
  type AgentActionResult,
  type AgentPressResult,
  type AgentReadResult,
  type AgentTabsResult,
} from "../shared/agent-access";
import { AgentApiError } from "./agent-commands";
import type { TrustedWebContents } from "./terminal-ipc-types";

const READ_TIMEOUT_MS = 3000;

// Each request remembers its channel: only that channel's answer settles it.
export type PendingRequests = Map<
  string,
  {
    readonly channel: string;
    resolve(value: unknown): void;
    reject(error: Error): void;
  }
>;

const READ_TIMEOUT = () =>
  new AgentApiError("unavailable", "The window didn't answer in time.");

// One request to the window (a pane's text, a press's bytes), correlated by
// id and bounded in time.
export function requestWindow<T>(
  contents: TrustedWebContents,
  pending: PendingRequests,
  channel: string,
  request: object,
  signal: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      pending.delete(id);
    };
    // An action main stops waiting for must not run later in the window.
    const cancel = () => {
      if (channel !== agentIpc.action) return;
      try {
        contents.send(agentIpc.actionCancel, { id });
      } catch {
        // A window being torn down runs nothing more.
      }
    };
    const abort = () => {
      finish();
      cancel();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      finish();
      cancel();
      reject(READ_TIMEOUT());
    }, READ_TIMEOUT_MS);
    pending.set(id, {
      channel,
      resolve: (value) => {
        finish();
        resolve(value as T);
      },
      reject: (error) => {
        finish();
        reject(error);
      },
    });
    signal.addEventListener("abort", abort, { once: true });
    try {
      contents.send(channel, { id, ...request });
    } catch {
      pending.get(id)?.reject(READ_TIMEOUT());
    }
  });
}

export function settlePress(
  pending: PendingRequests,
  result: AgentPressResult,
) {
  const request = pending.get(result.id);
  if (request?.channel !== agentIpc.press) return;
  if ("error" in result)
    request.reject(
      result.error === "unknown-pane"
        ? new AgentApiError("unknown-pane", "No such pane in this window.")
        : new AgentApiError("unavailable", "The pane isn't ready for keys."),
    );
  else request.resolve(result.data);
}

export function settleAction(
  pending: PendingRequests,
  result: AgentActionResult,
) {
  const request = pending.get(result.id);
  if (request?.channel !== agentIpc.action) return;
  if ("error" in result)
    request.reject(
      result.error === "unknown-pane"
        ? new AgentApiError("unknown-pane", "No such pane in this window.")
        : new AgentApiError("unavailable", "The window can't run that now."),
    );
  else request.resolve(undefined);
}

export function settleTabs(pending: PendingRequests, result: AgentTabsResult) {
  const request = pending.get(result.id);
  if (request?.channel !== agentIpc.tabs) return;
  if ("error" in result)
    request.reject(
      new AgentApiError("unavailable", "The window's tabs couldn't be read."),
    );
  else request.resolve(result.tabs);
}

export function settleRead(reads: PendingRequests, result: AgentReadResult) {
  const pending = reads.get(result.id);
  if (pending?.channel !== agentIpc.read) return;
  if ("error" in result)
    pending.reject(
      result.error === "unknown-pane"
        ? new AgentApiError("unknown-pane", "No such pane in this window.")
        : new AgentApiError("unavailable", "The pane's text couldn't be read."),
    );
  else
    pending.resolve({
      text: result.text,
      truncated: result.truncated,
      ...(result.cols === undefined
        ? {}
        : { cols: result.cols, rows: result.rows }),
    });
}
