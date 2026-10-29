import type {
  InstalledPackages,
  VersionSelection,
} from "../installed-packages/installed-packages.js";
import type { Bootstrap, Value } from "./protocol.js";

/** Host inputs and admitted backend handle share this process-ownership contract. */
export type RuntimeOptions = {
  packages: Pick<InstalledPackages, "openVersion">;
  bootstrap: Omit<Bootstrap, "selection">;
  spawn(): BackendProcess;
  owner: AbortSignal;
};
export type Backend = {
  readonly epoch: string;
  /** Revoked synchronously on stop, channel loss or exit, before settlement. */
  readonly signal: AbortSignal;
  readonly selection: VersionSelection;
  state(): "active" | "stopping" | "dormant" | "failed" | "unknown";
  call(value: Value, signal?: AbortSignal): Promise<Value>;
  retire(): Promise<Retirement>;
};

export type Pending = {
  resolve(value: Value): void;
  reject(reason: unknown): void;
  cleanup(): void;
  cancelled: boolean;
};

// Bounded process-lifetime coordination; a timeout never claims settlement.
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function within<T>(
  promise: Promise<T>,
  milliseconds: number,
  fallback: () => T,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback()), milliseconds);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Actual process exit and stream closure are separate retirement facts. */
export type Retirement = {
  settled: boolean;
  processStarted: boolean;
  exitObserved: boolean;
  exitCode: number | null;
  exitSignal: string | null;
  streamsClosed: boolean;
  killRequested: boolean;
  killAccepted: boolean | null;
  cooperative: boolean;
  cleanupFailed: boolean;
};
/** Sole direct-child owner/reaper. Controlled tests model these same events. */
export interface BackendProcess {
  send(message: string): void;
  disconnect(): void;
  kill(): boolean;
  onMessage(listener: (message: unknown) => void): void;
  onDisconnect(listener: () => void): void;
  onSpawn(listener: () => void): void;
  onError(listener: () => void): void;
  onClose(listener: () => void): void;
  onExit(listener: (code: number | null, signal: string | null) => void): void;
}
