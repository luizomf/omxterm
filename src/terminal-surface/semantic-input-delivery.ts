import {
  requiresProtectedPaste,
  splitTerminalPayload,
} from "../shared/terminal-contract";

interface SemanticInputDeliveryOptions {
  readonly isLive: () => boolean;
  readonly isBracketedPasteEnabled: () => boolean;
  readonly confirmPaste?: (text: string) => Promise<boolean>;
  readonly write: (chunk: string) => void;
  readonly onFailure?: () => void;
}

export interface SemanticInputDelivery {
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

  const execute = async (text: string, submit: boolean): Promise<boolean> => {
    if (disposed || !options.isLive() || text.length === 0) return false;
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
    for (const chunk of splitTerminalPayload(payload)) {
      if (disposed || !options.isLive()) return false;
      options.write(chunk);
    }
    if (submit) {
      if (disposed || !options.isLive()) return false;
      options.write("\r");
    }
    return true;
  };

  const enqueue = (
    load: () => string | Promise<string>,
    deliveryOptions?: { readonly submit?: boolean },
  ): Promise<boolean> => {
    let resolveResult: (delivered: boolean) => void = () => undefined;
    const result = new Promise<boolean>((resolve) => {
      resolveResult = resolve;
    });
    tail = tail
      .then(async () => {
        if (disposed || !options.isLive()) {
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
        resolveResult(await execute(text, deliveryOptions?.submit === true));
      })
      .catch(() => resolveResult(false));
    return result;
  };

  return {
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
