import os from "node:os";
import {
  loadTerminalSnippets,
  type LoadTerminalSnippetsOptions,
} from "../../src/main/snippets.js";
import type { Value } from "../../src/extension-runtime/protocol.js";
import { createSnippetCatalog } from "./catalog.js";

// The runtime shares this backend between hosted views and does not pass a view
// identity to invoke. Each visible activation supplies a fresh random token;
// hiding/superseding it must send close, including while open is pending.
const MAX_ACTIVATIONS = 32;
const MAX_READS = 8;
type Catalog = ReturnType<typeof createSnippetCatalog>;
type Activation = { catalog: Catalog; release: () => void };

export function activate(
  context: { signal: AbortSignal },
  options: LoadTerminalSnippetsOptions = {
    environment: process.env,
    homeDirectory: os.homedir(),
  },
) {
  const activations = new Map<string, Activation>();
  let retired = false;
  let reads = 0;

  function deactivate() {
    retired = true;
    context.signal.removeEventListener("abort", deactivate);
    for (const activation of activations.values()) activation.release();
  }
  if (context.signal.aborted) deactivate();
  else context.signal.addEventListener("abort", deactivate, { once: true });

  return {
    async invoke(value: unknown, signal: AbortSignal): Promise<Value> {
      if (retired || signal.aborted) return { ok: false, error: "unavailable" };
      if (!value || typeof value !== "object" || Array.isArray(value))
        return { ok: false, error: "invalid-request" };
      const request = value as Record<string, unknown>;
      const { operation, activation: token, cursor } = request;
      const keys = operation === "next" ? 3 : 2;
      if (
        !["open", "next", "close"].includes(operation as string) ||
        Object.keys(request).length !== keys ||
        Object.keys(request).some(
          (key) =>
            ![
              "operation",
              "activation",
              ...(operation === "next" ? ["cursor"] : []),
            ].includes(key),
        ) ||
        typeof token !== "string" ||
        !/^[a-zA-Z0-9_-]{16,128}$/.test(token) ||
        (operation === "next" && typeof cursor !== "string")
      )
        return { ok: false, error: "invalid-request" };

      if (operation === "close") {
        activations.get(token)?.release();
        return { ok: true };
      }
      let activation = activations.get(token);
      if (operation === "open") {
        if (activation) return { ok: false, error: "activation-in-use" };
        if (activations.size >= MAX_ACTIVATIONS || reads >= MAX_READS)
          return { ok: false, error: "busy" };
        const catalog = createSnippetCatalog(() =>
          loadTerminalSnippets(options),
        );
        const release = () => {
          catalog.dispose();
          signal.removeEventListener("abort", release);
          if (activations.get(token)?.catalog === catalog)
            activations.delete(token);
        };
        activation = { catalog, release };
        activations.set(token, activation);
        signal.addEventListener("abort", release, { once: true });
      }
      if (!activation) return { ok: false, error: "expired-snapshot" };
      const current = activation;
      // A cancelled page request revokes the remaining snapshot too. The open
      // signal remains attached until completion/close, not just the first page.
      signal.addEventListener("abort", current.release, { once: true });
      try {
        let page: Value;
        if (operation === "open") {
          reads++;
          try {
            page = await current.catalog.open();
          } finally {
            reads--;
          }
        } else {
          page = current.catalog.next(cursor as string);
        }
        if (retired || signal.aborted || activations.get(token) !== current)
          return { ok: false, error: "unavailable" };
        const result = page as Record<string, Value>;
        if (result.cursor === null) current.release();
        return { ok: true, ...result };
      } catch {
        current.release();
        return {
          ok: false,
          error: retired || signal.aborted ? "unavailable" : "expired-snapshot",
        };
      } finally {
        if (operation !== "open")
          signal.removeEventListener("abort", current.release);
      }
    },
    deactivate,
  };
}
