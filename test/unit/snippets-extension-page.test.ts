// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  mountSnippetsPage,
  type SnippetsBridge,
} from "../../extensions/snippets/page";
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function setup() {
  let activity!: (value: boolean) => void;
  let visibility!: (value: boolean) => void;
  let language!: Parameters<SnippetsBridge["onLanguage"]>[0];
  let focus!: Parameters<SnippetsBridge["onFocusIntent"]>[0];
  const request = vi.fn<SnippetsBridge["request"]>(async (value) => {
    const operation = (value as { operation: string }).operation;
    return operation === "open"
      ? {
          ok: true,
          total: 1,
          cursor: null,
          rows: [
            { name: "Literal", body: "  echo 'hello'\r\n", execute: true },
          ],
        }
      : { ok: true };
  });
  const page = mountSnippetsPage(document, {
    request,
    onAppearance: () => () => {},
    onActivity(listener) {
      activity = listener;
      listener(false);
      return () => {};
    },
    onVisibility(listener) {
      visibility = listener;
      listener(false);
      return () => {};
    },
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
    onFocusIntent(listener) {
      focus = listener;
      return () => {};
    },
  });
  dispose = page.dispose;
  const search = document.querySelector<HTMLInputElement>("input")!;
  return { activity, visibility, language, focus, request, search, page };
}
it("loads only on logical activation, preserves search and restores the initiating preview control", async () => {
  const h = setup();
  h.activity(true);
  h.visibility(true);
  h.focus("search");
  expect(document.activeElement).toBe(h.search);
  await settle();
  const preview = document.querySelector<HTMLButtonElement>(
    ".snippet-preview-open",
  )!;
  preview.click();
  expect(h.request).toHaveBeenLastCalledWith({
    operation: "terminal.semanticInput.v1",
    text: "  echo 'hello'\r\n",
    title: "Literal",
    intent: "run",
    preview: true,
  });
  h.visibility(false);
  h.visibility(true);
  h.focus("restore");
  expect(document.activeElement).toBe(preview);
  expect(
    h.request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "open",
    ),
  ).toHaveLength(1);
  h.language("pt-BR");
  expect(document.querySelector(".snippet-preview-open")).toBe(preview);
  expect(document.activeElement).toBe(preview);
  h.search.value = "Literal";
  h.search.dispatchEvent(new Event("input"));
  h.activity(false);
  h.visibility(false);
  h.activity(true);
  h.visibility(true);
  await settle();
  expect(h.search.value).toBe("Literal");
  expect(
    h.request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "open",
    ),
  ).toHaveLength(2);
});
it("refuses stale/hidden controls and falls back to search when the preview row was replaced", async () => {
  const h = setup();
  h.activity(true);
  h.visibility(true);
  await settle();
  const preview = document.querySelector<HTMLButtonElement>(
    ".snippet-preview-open",
  )!;
  preview.click();
  h.search.value = "no match";
  h.search.dispatchEvent(new Event("input"));
  h.focus("restore");
  expect(document.activeElement).toBe(h.search);
  const count = h.request.mock.calls.length;
  preview.click();
  expect(h.request).toHaveBeenCalledTimes(count);
  h.search.value = "";
  h.search.dispatchEvent(new Event("input"));
  const row = document.querySelector<HTMLButtonElement>(".snippet-activate")!;
  h.visibility(false);
  row.click();
  expect(h.request).toHaveBeenCalledTimes(count);
  h.visibility(true);
  row.click();
  expect(h.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      preview: false,
      intent: "run",
      text: "  echo 'hello'\r\n",
    }),
  );
  h.page.dispose();
  h.page.dispose();
  row.click();
  expect(document.querySelector(".snippets-view")).toBeNull();
});
it("does not start a deferred read after immediate deactivation", async () => {
  const h = setup();
  h.activity(true);
  h.activity(false);
  await settle();
  expect(h.request).not.toHaveBeenCalled();
});

it("cancels a pending activation and suppresses its late response", async () => {
  const h = setup();
  let finish!: (value: unknown) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  h.activity(true);
  h.visibility(true);
  await settle();
  h.activity(false);
  h.visibility(false);
  expect(h.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ operation: "close" }),
  );
  finish({
    ok: true,
    rows: [{ name: "stale", body: "bad", execute: false }],
    total: 1,
    cursor: null,
  });
  await settle();
  expect(document.querySelector(".snippet-activate")).toBeNull();
});
