import {
  isLocalImageData,
  isLocalImageRequest,
  type LocalImageData,
  type LocalImageRequest,
} from "../shared/local-image";

export interface LocalImageIpcBoundary {
  request(payload?: unknown): Promise<LocalImageData | null>;
  dispose(): void;
}

export function createLocalImageIpcBoundary(options: {
  readonly load: (
    request: LocalImageRequest,
    abortSignal: AbortSignal,
  ) => Promise<LocalImageData | null>;
  readonly isOwnerLost: () => boolean;
  readonly reject: () => void;
}): LocalImageIpcBoundary {
  let disposed = false;
  let inFlight = false;
  let activeAbort: AbortController | undefined;

  return {
    async request(payload) {
      if (!isLocalImageRequest(payload)) {
        options.reject();
        throw new TypeError("Invalid local image request");
      }
      if (disposed || options.isOwnerLost())
        throw new Error("Local image request was superseded");
      if (inFlight) {
        options.reject();
        throw new Error("A local image request is already in progress");
      }
      inFlight = true;
      const abort = new AbortController();
      activeAbort = abort;
      try {
        const loaded = await options.load(payload, abort.signal);
        if (disposed || options.isOwnerLost())
          throw new Error("Local image request was superseded");
        if (loaded !== null && !isLocalImageData(loaded))
          throw new TypeError("Invalid local image response");
        return loaded;
      } finally {
        if (activeAbort === abort) activeAbort = undefined;
        inFlight = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeAbort?.abort();
      activeAbort = undefined;
    },
  };
}
