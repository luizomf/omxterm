import type { TerminalFontData } from "../shared/terminal-font-data";

interface PendingFontDataRequest {
  readonly identity: object;
  readonly family: string | undefined;
  readonly generation: number;
  readonly promise: Promise<TerminalFontData>;
}

export function createFontDataRequest(options: {
  readonly family: () => string | undefined;
  readonly generation: () => number;
  readonly isDisposed: () => boolean;
  readonly load: (family: string | undefined) => Promise<TerminalFontData>;
  readonly reject: () => void;
}) {
  let pending: PendingFontDataRequest | undefined;
  return (payload?: unknown): Promise<TerminalFontData> => {
    const family = options.family();
    if (payload !== family) {
      options.reject();
      return Promise.reject(
        new TypeError(
          "Terminal Font request does not match the active configured family",
        ),
      );
    }
    if (options.isDisposed())
      return Promise.reject(new Error("Terminal IPC controller is disposed"));
    const generation = options.generation();
    if (
      pending !== undefined &&
      pending.family === family &&
      pending.generation === generation
    )
      return pending.promise;

    const previous = pending?.promise;
    const identity = {};
    const promise = (async () => {
      try {
        // A new configuration waits for the previous bounded read, even when
        // that read fails. Superseded generations never start another read.
        if (previous) await previous.catch(() => undefined);
        if (
          options.isDisposed() ||
          options.family() !== family ||
          options.generation() !== generation
        )
          throw new Error("Terminal Font request was superseded");
        const loaded = await options.load(family);
        if (
          options.isDisposed() ||
          options.family() !== family ||
          options.generation() !== generation
        )
          throw new Error("Terminal Font request was superseded");
        return loaded;
      } finally {
        if (pending?.identity === identity) pending = undefined;
      }
    })();
    pending = { identity, family, generation, promise };
    return promise;
  };
}
