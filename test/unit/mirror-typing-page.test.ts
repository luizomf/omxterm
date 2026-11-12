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
  let language!: (value: "en-US" | "pt-BR") => void;
  const page = mountMirrorTypingPage(document, {
    onAppearance: () => () => {},
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
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
    language: (value: "en-US" | "pt-BR") => language(value),
    unsubscribe,
    button: (action: string) =>
      document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!,
    inputs: () => [...document.querySelectorAll<HTMLInputElement>("input")],
    notice: () => document.querySelector<HTMLElement>('[role="status"]')!,
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
it("selects all candidates, locks the current pane, uses literal labels and requires two panes", async () => {
  const f = await fixture();
  expect(f.calls("start")).toHaveLength(0);
  expect(f.inputs().map((input) => input.checked)).toEqual([true, true, true]);
  expect(f.inputs().map((input) => input.disabled)).toEqual([
    true,
    false,
    false,
  ]);
  expect(document.querySelector("img")).toBeNull();
  expect(document.body.textContent).toContain(
    "Pane 1 · <img src=x onerror=alert(1)>Current pane",
  );
  expect(f.notice().hidden).toBe(true);
  expect(f.button("refresh").hidden).toBe(true);
  expect(document.activeElement).toBe(f.button("start"));
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
  // A started setup is spent: only Refresh can bring a new one.
  await vi.waitFor(() => expect(f.button("refresh").hidden).toBe(false));
  expect(f.button("start").disabled).toBe(true);
  expect(f.notice().hidden).toBe(true);
});
it("Refresh replaces a spent setup and uses only the fresh token", async () => {
  const f = await fixture();
  f.button("start").click();
  await vi.waitFor(() => expect(f.button("refresh").hidden).toBe(false));
  f.answer(snapshot("replacement-token"));
  f.button("refresh").click();
  await vi.waitFor(() => expect(f.button("start").disabled).toBe(false));
  expect(f.inputs().every((input) => input.checked)).toBe(true);
  f.button("start").click();
  expect(f.calls("start")[1]).toMatchObject({
    setupToken: "replacement-token",
  });
});
it("refreshes retained views on visibility without automatic Start", async () => {
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
  f.visibility(false);
  let finish!: (value: unknown) => void;
  f.intercept((input) =>
    input.action === "describe"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : undefined,
  );
  f.visibility(true);
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
it("ignores a release or repeat whose press began elsewhere", async () => {
  // The Enter that ran the palette action is pressed in another view; only
  // its repeats and release can land on the focused Start.
  const f = await fixture();
  const start = f.button("start");
  expect(document.activeElement).toBe(start);
  const press = (type: "keydown" | "keyup", repeat = false) =>
    start.dispatchEvent(
      new KeyboardEvent(type, {
        key: "Enter",
        repeat,
        bubbles: true,
        cancelable: true,
      }),
    );
  press("keydown", true);
  press("keyup");
  expect(f.calls("start")).toHaveLength(0);
});
it.each(["blur", "hide"])("cancels held Start on %s", async (reason) => {
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
  start.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(f.calls("start")).toHaveLength(0);
});
it("does not disclose host errors or retry a lost Start and requires fresh authority", async () => {
  const f = await fixture();
  f.intercept((input) =>
    input.action === "start"
      ? Promise.reject(new Error("/private/example"))
      : undefined,
  );
  f.button("start").click();
  await vi.waitFor(() =>
    expect(f.notice().textContent).toContain("Mirroring may have started"),
  );
  expect(document.body.textContent).not.toContain("/private/example");
  expect(f.calls("start")).toHaveLength(1);
  expect(f.button("start").disabled).toBe(true);
  f.answer({ ok: false, error: "/private/example" });
  f.button("refresh").click();
  await vi.waitFor(() =>
    expect(f.notice().textContent).toBe(
      "Open Mirror Typing from a tab with two or more panes.",
    ),
  );
  expect(document.body.textContent).not.toContain("/private/example");
  expect(f.inputs()).toHaveLength(0);
  expect(f.button("refresh").hidden).toBe(false);
});
it("reports a refused Start without retrying it", async () => {
  const f = await fixture();
  f.intercept((input) =>
    input.action === "start"
      ? Promise.resolve({ ok: false, error: "stale" })
      : undefined,
  );
  f.button("start").click();
  await vi.waitFor(() =>
    expect(f.notice().textContent).toContain("Mirroring didn't start"),
  );
  expect(f.calls("start")).toHaveLength(1);
  expect(f.button("start").disabled).toBe(true);
});
it("follows the interface language without losing the selection", async () => {
  const f = await fixture();
  f.inputs()[2]!.click();
  f.language("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(f.button("start").textContent).toBe("Começar a espelhar");
  expect(document.body.textContent).toContain("Painel 2 · Shell");
  expect(document.body.textContent).toContain("Painel atual");
  expect(f.inputs().map((input) => input.checked)).toEqual([true, true, false]);
  f.language("en-US");
  expect(f.button("start").textContent).toBe("Start mirroring");
});
it("shows Learn more only when the host can open the docs link", async () => {
  const f = await fixture([operation, "links.open.v1"]);
  const link = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Learn more",
  )!;
  expect(link.hidden).toBe(false);
  link.click();
  expect(f.request).toHaveBeenCalledWith({
    operation: "links.open.v1",
    link: "docs",
  });
  f.page.dispose();
  await fixture();
  expect(
    [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Learn more",
    )!.hidden,
  ).toBe(true);
});
it("refuses malformed candidates and unavailable capability without inventing authority", async () => {
  const f = await fixture([]);
  expect(f.calls("describe")).toHaveLength(0);
  expect(f.button("start").disabled).toBe(true);
  expect(f.notice().textContent).toBe(
    "This OMXTerm version doesn't support Mirror Typing.",
  );
  expect(f.button("refresh").hidden).toBe(true);
  f.page.dispose();
  const g = await fixture();
  const invalid = snapshot();
  invalid.panes[1]!.handle = invalid.panes[0]!.handle;
  g.answer(invalid);
  g.visibility(false);
  g.visibility(true);
  await vi.waitFor(() =>
    expect(g.notice().textContent).toContain("two or more panes"),
  );
  expect(g.button("start").disabled).toBe(true);
  g.page.dispose();
  g.visibility(true);
  expect(g.unsubscribe).toHaveBeenCalledOnce();
  expect(document.body.children).toHaveLength(0);
});
