import { randomUUID } from "node:crypto";
import { isTerminalSessionId } from "../shared/terminal-contract";
import { isMirrorKeyInput } from "../shared/mirror-typing";

/** One window's revocable, fixed native recipients. This is NOT extension IPC:
 * only the core setup coordinator may grant, after its asynchronous admission
 * and visible handoff. No payload, queue or replay state is retained. */
export function createMirrorInputLease<Session extends object>(options: {
  current(id: string): Session | undefined;
  selected(ids: readonly string[]): boolean;
  focused(id: string): boolean;
  windowFocused(): boolean;
  available(): boolean;
  write(session: Session, data: string): void;
  stopped(
    lease: string,
    reason: "stopped" | "unavailable" | "write-failed",
  ): void;
}) {
  type Lease = {
    id: string;
    members: ReadonlyMap<string, Session>;
    sequence: number;
    signal: AbortSignal;
    abort(): void;
  };
  let active: Lease | undefined;
  const valid = (lease: Lease) =>
    !lease.signal.aborted &&
    options.available() &&
    options.selected([...lease.members.keys()]) &&
    [...lease.members].every(
      ([id, session]) => options.current(id) === session,
    );
  function revoke(
    reason: "stopped" | "unavailable" | "write-failed" = "stopped",
  ) {
    const lease = active;
    if (!lease) return;
    active = undefined; // Admission closes before callbacks or native cleanup.
    lease.signal.removeEventListener("abort", lease.abort);
    try {
      options.stopped(lease.id, reason);
    } catch {
      // A lost renderer must not interrupt session/native retirement.
    }
  }
  function recheck() {
    if (
      active &&
      (!valid(active) || ![...active.members.keys()].some(options.focused))
    )
      revoke("unavailable");
  }
  return {
    grant(ids: readonly string[], source: string, signal: AbortSignal): string {
      // There is no implicit replacement/resume: setup must first revoke.
      if (
        active ||
        signal.aborted ||
        !options.available() ||
        !options.windowFocused() ||
        ids.length < 2 ||
        ids.length > 16 ||
        new Set(ids).size !== ids.length ||
        !ids.every(isTerminalSessionId) ||
        !ids.includes(source) ||
        !options.focused(source) ||
        !options.selected(ids)
      )
        throw new Error("Mirror Typing unavailable");
      const members = new Map<string, Session>();
      for (const id of ids) {
        const session = options.current(id);
        if (!session) throw new Error("Mirror Typing unavailable");
        members.set(id, session);
      }
      const lease: Lease = {
        id: randomUUID(),
        members,
        sequence: 0,
        signal,
        abort: () => revoke("unavailable"),
      };
      active = lease;
      signal.addEventListener("abort", lease.abort, { once: true });
      return lease.id;
    },
    input(value: unknown): void {
      const lease = active;
      if (!lease || !isMirrorKeyInput(value) || value.lease !== lease.id)
        return;
      if (
        !valid(lease) ||
        !lease.members.has(value.sourceSessionId) ||
        !options.focused(value.sourceSessionId) ||
        value.sequence !== lease.sequence + 1
      ) {
        revoke("unavailable");
        return;
      }
      // Blur alone preserves the indication, but never admits background input.
      // Consume its sequence so a queued event cannot be replayed on refocus.
      lease.sequence = value.sequence;
      if (!options.windowFocused()) return;
      for (const session of lease.members.values()) {
        // Native writes can synchronously observe an exit or revocation.
        if (active !== lease || !valid(lease)) {
          if (active === lease) revoke("unavailable");
          return;
        }
        try {
          options.write(session, value.data);
        } catch {
          revoke("write-failed");
          return;
        }
      }
    },
    recheck,
    revoke,
  };
}
