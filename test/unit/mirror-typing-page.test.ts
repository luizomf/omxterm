// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  mountMirrorTypingPage,
  type MirrorTypingBridge,
} from "../../extensions/mirror-typing/page";
const operation = "terminal.mirrorTyping.v1";
const snapshot = (token = "opaque-token") => ({
  ok: true,
  setupToken: token,
  panes: [
    {
      handle: "opaque-a",
      ordinal: 1,
      title: "<img src=x onerror=alert(1)>",
      required: true,
    },
    { handle: "opaque-b", ordinal: 2, title: "Shell", required: false },
    { handle: "opaque-c", ordinal: 3, title: "Shell", required: false },
  ],
});
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});
async function fixture(capabilities = [operation]) {
  let visibility!: (visible: boolean) => void;
  let answer: unknown = snapshot();
  let intercept:
    | ((value: Record<string, unknown>) => Promise<unknown> | undefined)
    | undefined;
  const request = vi.fn<MirrorTypingBridge["request"]>(async (value) => {
    const input = value as Record<string, unknown>;
    const result = intercept?.(input);
    if (result) return result;
    if (input.operation === "host.capabilities") return { capabilities };
    if (input.action === "describe") return answer;
    return { ok: true, status: "active" };
  });
  const unsubscribe = vi.fn();
  const page = mountMirrorTypingPage(document, {
    request,
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return unsubscribe;
    },
  });
  dispose = page.dispose;
  await page.ready;
  return {
    page,
    request,
    visibility,
    unsubscribe,
    button: (action: string) =>
      document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!,
    inputs: () => [...document.querySelectorAll<HTMLInputElement>("input")],
    calls: (action: string) =>
      request.mock.calls
        .map(([value]) => value as Record<string, unknown>)
        .filter((value) => value.action === action),
    answer(value: unknown) {
      answer = value;
    },
    intercept(handler: NonNullable<typeof intercept>) {
      intercept = handler;
    },
  };
}
it("selects all candidates, locks original focus, uses literal labels and requires two panes", async () => {
  const f = await fixture();
  expect(f.calls("start")).toHaveLength(0);
  expect(f.inputs().map((input) => input.checked)).toEqual([true, true, true]);
  expect(f.inputs().map((input) => input.disabled)).toEqual([
    true,
    false,
    false,
  ]);
  expect(document.querySelector("img")).toBeNull();
  expect(document.body.textContent).toContain("<img src=x onerror=alert(1)>");
  f.inputs()[2]!.click();
  f.inputs()[1]!.click();
  expect(f.button("start").disabled).toBe(true);
  f.inputs()[1]!.click();
  f.button("start").click();
  f.button("start").click();
  expect(f.calls("start")).toEqual([
    {
      operation,
      action: "start",
      setupToken: "opaque-token",
      handles: ["opaque-a", "opaque-b"],
    },
  ]);
  await vi.waitFor(() => expect(f.button("refresh").disabled).toBe(false));
  expect(f.button("start").disabled).toBe(true);
  expect(document.body.textContent).toContain("visible Stop");
});
it("explicit Refresh replaces choices and uses only the fresh token", async () => {
  const f = await fixture();
  f.inputs()[2]!.click();
  f.answer(snapshot("replacement-token"));
  f.button("refresh").click();
  expect(f.button("start").disabled).toBe(true);
  await vi.waitFor(() => expect(f.button("start").disabled).toBe(false));
  expect(f.inputs().every((input) => input.checked)).toBe(true);
  f.button("start").click();
  expect(f.calls("start")[0]).toMatchObject({
    setupToken: "replacement-token",
  });
});
it("refreshes retained views on visibility without navigation or automatic Start", async () => {
  const f = await fixture();
  f.button("start").click();
  f.visibility(false);
  f.answer(snapshot("return-token"));
  f.visibility(true);
  await vi.waitFor(() => expect(f.calls("describe")).toHaveLength(2));
  await vi.waitFor(() => expect(f.button("start").disabled).toBe(false));
  expect(f.calls("start")).toHaveLength(1);
  f.button("start").click();
  expect(f.calls("start")[1]).toMatchObject({ setupToken: "return-token" });
});
it("discards a describe reply after hide and refreshes once after return", async () => {
  const f = await fixture();
  let finish!: (value: unknown) => void;
  f.intercept((input) =>
    input.action === "describe"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : undefined,
  );
  f.button("refresh").click();
  f.visibility(false);
  f.visibility(true);
  f.intercept(() => undefined);
  f.answer(snapshot("latest-token"));
  finish(snapshot("stale-token"));
  await vi.waitFor(() => expect(f.button("start").disabled).toBe(false));
  f.button("start").click();
  expect(f.calls("start")[0]).toMatchObject({ setupToken: "latest-token" });
});
it.each(["Enter", " "])(
  "owns %j activation through release and suppresses duplicate clicks",
  async (key) => {
    const f = await fixture();
    const start = f.button("start");
    for (const repeat of [false, true])
      start.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          repeat,
          bubbles: true,
          cancelable: true,
        }),
      );
    start.click();
    expect(f.calls("start")).toHaveLength(0);
    start.dispatchEvent(
      new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }),
    );
    start.click();
    expect(f.calls("start")).toHaveLength(1);
  },
);
it.each(["blur", "hide", "refresh"])(
  "cancels held Start on %s",
  async (reason) => {
    const f = await fixture();
    const start = f.button("start");
    start.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "hide") f.visibility(false);
    if (reason === "refresh") f.button("refresh").click();
    start.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(f.calls("start")).toHaveLength(0);
  },
);
it("does not disclose host errors or retry a lost Start and requires fresh authority", async () => {
  const f = await fixture();
  f.intercept((input) =>
    input.action === "start"
      ? Promise.reject(new Error("/private/example"))
      : undefined,
  );
  f.button("start").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Start result unavailable"),
  );
  expect(document.body.textContent).not.toContain("/private/example");
  expect(f.calls("start")).toHaveLength(1);
  expect(f.button("start").disabled).toBe(true);
  f.answer({ ok: false, error: "/private/example" });
  f.button("refresh").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Targets unavailable"),
  );
  expect(document.body.textContent).not.toContain("/private/example");
  expect(f.inputs()).toHaveLength(0);
});
it("refuses malformed candidates and unavailable capability without inventing authority", async () => {
  const f = await fixture([]);
  expect(f.calls("describe")).toHaveLength(0);
  expect(f.button("start").disabled).toBe(true);
  f.page.dispose();
  const g = await fixture();
  const invalid = snapshot();
  invalid.panes[1]!.handle = invalid.panes[0]!.handle;
  g.answer(invalid);
  g.button("refresh").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Targets unavailable"),
  );
  expect(g.button("start").disabled).toBe(true);
  g.page.dispose();
  g.visibility(true);
  expect(g.unsubscribe).toHaveBeenCalledOnce();
  expect(document.body.children).toHaveLength(0);
});
