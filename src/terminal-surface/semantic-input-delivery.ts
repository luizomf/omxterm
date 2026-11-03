import {
  requiresProtectedPaste,
  splitTerminalPayload,
  isTerminalWriteReceipt,
  type TerminalWriteReceipt,
} from "../shared/terminal-contract";

interface SemanticInputDeliveryOptions {
  readonly isLive: () => boolean;
  readonly isBracketedPasteEnabled: () => boolean;
  readonly confirmPaste?: (text: string) => Promise<boolean>;
  readonly write: (chunk: string) => void;
  readonly writeTracked?: (chunk: string) => Promise<TerminalWriteReceipt>;
  readonly chunkBytes?: number;
  readonly pauseBetweenChunks?: () => Promise<void>;
  readonly onFailure?: () => void;
}

export interface SemanticInputDelivery {
  deliverTracked(text: string): Promise<boolean>;
  deliver(
    text: string,
    options?: { readonly submit?: boolean },
  ): Promise<boolean>;
  deliverFrom(
    load: () => Promise<string>,
    options?: { readonly submit?: boolean },
  ): Promise<boolean>;
  dispose(): void;
}

export function createSemanticInputDelivery(
  options: SemanticInputDeliveryOptions,
): SemanticInputDelivery {
  let disposed = false;
  let tail = Promise.resolve();
  // A lost response does not establish whether main may still process the
  // chunk. Refuse subsequent queued input until a definitive late receipt, if
  // any; a rejected IPC has no such receipt and remains fenced for this Surface.
  let receiptFence = false;

  const writeTracked = async (chunk: string): Promise<boolean> => {
    if (!options.writeTracked || receiptFence) return false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const receipt = Promise.resolve()
      .then(() => options.writeTracked!(chunk))
      .then(
        (value) => {
          if (!isTerminalWriteReceipt(value)) return "lost" as const;
          if (timedOut) receiptFence = false;
          return value;
        },
        () => "lost" as const,
      );
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        receiptFence = true;
        resolve("timeout");
      }, 5000);
    });
    const result = await Promise.race([receipt, timeout]);
    clearTimeout(timer);
    if (result === "lost") receiptFence = true;
    return result === "accepted";
  };

  const sendChunks = async (
    payload: string,
    submit: boolean,
    tracked: boolean,
  ): Promise<boolean> => {
    const chunks = splitTerminalPayload(payload, options.chunkBytes);
    for (const [index, chunk] of chunks.entries()) {
      if (disposed || !options.isLive()) return false;
      if (tracked) {
        if (!(await writeTracked(chunk))) return false;
      } else options.write(chunk);
      if (index < chunks.length - 1) await options.pauseBetweenChunks?.();
    }
    if (submit) {
      if (disposed || !options.isLive()) return false;
      options.write("\r");
    }
    return true;
  };

  const execute = async (
    text: string,
    submit: boolean,
    tracked: boolean,
  ): Promise<boolean> => {
    if (
      disposed ||
      receiptFence ||
      !options.isLive() ||
      text.length === 0 ||
      (tracked && !options.writeTracked)
    )
      return false;
    const protectedPaste = requiresProtectedPaste(text);
    let approved = false;
    if (protectedPaste && !options.isBracketedPasteEnabled()) {
      if (!options.confirmPaste) return false;
      try {
        approved = await options.confirmPaste(text);
      } catch {
        options.onFailure?.();
        return false;
      }
      if (!approved) return false;
    }

    if (disposed || !options.isLive()) return false;
    const bracketed = options.isBracketedPasteEnabled();
    if (protectedPaste && !bracketed && !approved) return false;
    const payload = bracketed ? `\u001b[200~${text}\u001b[201~` : text;
    return sendChunks(payload, submit, tracked);
  };

  const enqueue = (
    load: () => string | Promise<string>,
    deliveryOptions?: { readonly submit?: boolean },
    tracked = false,
  ): Promise<boolean> => {
    let resolveResult: (delivered: boolean) => void = () => undefined;
    const result = new Promise<boolean>((resolve) => {
      resolveResult = resolve;
    });
    tail = tail
      .then(async () => {
        if (disposed || receiptFence || !options.isLive()) {
          resolveResult(false);
          return;
        }
        let text: string;
        try {
          text = await load();
        } catch {
          options.onFailure?.();
          resolveResult(false);
          return;
        }
        resolveResult(
          await execute(text, deliveryOptions?.submit === true, tracked),
        );
      })
      .catch(() => resolveResult(false));
    return result;
  };

  return {
    deliverTracked: (text) => enqueue(() => text, undefined, true),
    deliver: (text, deliveryOptions) => enqueue(() => text, deliveryOptions),
    deliverFrom(load, deliveryOptions) {
      const loaded = Promise.resolve()
        .then(load)
        .then(
          (text) => ({ ok: true as const, text }),
          () => ({ ok: false as const }),
        );
      return enqueue(async () => {
        const result = await loaded;
        if (!result.ok) throw new Error("Clipboard read failed");
        return result.text;
      }, deliveryOptions);
    },
    dispose() {
      disposed = true;
    },
  };
}
