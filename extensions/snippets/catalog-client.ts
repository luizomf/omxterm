import {
  isTerminalSnippetsResponse,
  MAX_SNIPPET_COUNT,
  type TerminalSnippet,
  type TerminalSnippetsResponse,
} from "../../src/shared/terminal-snippets.js";

type Backend = { request(value: unknown): Promise<unknown> };
type Page = {
  ok: true;
  rows: readonly TerminalSnippet[];
  total: number;
  cursor: string | null;
  error?: string;
};

function parsePage(value: unknown): Page {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid catalog page");
  const page = value as Record<string, unknown>;
  if (
    page.ok !== true ||
    Object.keys(page).some(
      (key) => !["ok", "rows", "total", "cursor", "error"].includes(key),
    ) ||
    !Number.isInteger(page.total) ||
    (page.total as number) < 0 ||
    (page.total as number) > MAX_SNIPPET_COUNT ||
    (page.cursor !== null &&
      (typeof page.cursor !== "string" ||
        !/^[a-zA-Z0-9_-]{16,128}$/.test(page.cursor))) ||
    !isTerminalSnippetsResponse({ snippets: page.rows, error: page.error }) ||
    (page.rows as unknown[]).length > 256
  )
    throw new Error("Invalid catalog page");
  return page as Page;
}

/** Assemble one activation atomically; the view owns when to publish its result. */
export function createSnippetCatalogClient(
  backend: Backend,
  createToken: () => string = () => globalThis.crypto.randomUUID(),
) {
  let disposed = false;
  let active: { cancel(): void } | undefined;

  function cancel() {
    active?.cancel();
    active = undefined;
  }

  return {
    async load(): Promise<TerminalSnippetsResponse> {
      cancel();
      if (disposed) throw new Error("Catalog client disposed");
      const activation = createToken();
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(activation))
        throw new Error("Invalid catalog activation");
      let closed = false;
      let cancelled = false;
      let rejectCancellation!: (error: Error) => void;
      const cancellation = new Promise<never>((_, reject) => {
        rejectCancellation = reject;
      });
      function close() {
        if (closed) return;
        closed = true;
        // Cleanup is best effort, never retried and never replaces the read result.
        try {
          void backend
            .request({ operation: "close", activation })
            .catch(() => {});
        } catch {
          // Injected transports may also throw synchronously.
        }
      }
      const current = {
        cancel() {
          cancelled = true;
          close();
          rejectCancellation(new Error("Catalog load cancelled"));
        },
      };
      active = current;
      async function request(value: unknown) {
        const result = await Promise.race([
          backend.request(value),
          cancellation,
        ]);
        if (cancelled || active !== current)
          throw new Error("Catalog load cancelled");
        return parsePage(result);
      }
      try {
        let page = await request({ operation: "open", activation });
        const total = page.total;
        const error = page.error;
        const snippets: TerminalSnippet[] = [];
        const cursors = new Set<string>();
        for (;;) {
          if (cancelled || active !== current)
            throw new Error("Catalog load cancelled");
          if (
            page.total !== total ||
            page.error !== error ||
            snippets.length + page.rows.length > total ||
            (error !== undefined && (total !== 0 || page.cursor !== null))
          )
            throw new Error("Inconsistent catalog page");
          snippets.push(...page.rows.map((row) => ({ ...row })));
          if (page.cursor === null) {
            if (snippets.length !== total)
              throw new Error("Incomplete catalog snapshot");
            return { snippets, ...(error === undefined ? {} : { error }) };
          }
          if (
            !page.rows.length ||
            snippets.length >= total ||
            cursors.has(page.cursor)
          )
            throw new Error("Inconsistent catalog cursor");
          cursors.add(page.cursor);
          page = await request({
            operation: "next",
            activation,
            cursor: page.cursor,
          });
        }
      } finally {
        close();
        if (active === current) active = undefined;
      }
    },
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
