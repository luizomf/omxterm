// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  mountRestorationPage,
  type RestorationBridge,
} from "../../extensions/restoration/page";
import { stateDocument } from "../../extensions/restoration/document";
import { savedLayout } from "../fixtures/restoration-layout";
const revision = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});
type Request = {
  operation: string;
  expectedRevision?: string;
  value?: unknown;
  layout?: unknown;
};
async function setup(
  initial: unknown = stateDocument(revision(1), savedLayout()),
  capabilities = [
    "terminal.captureLayout.v1",
    "terminal.openLayout.v1",
    "links.open.v1",
  ],
) {
  let visibility!: (visible: boolean) => void;
  let current = initial;
  let intercept: ((value: Request) => Promise<unknown> | undefined) | undefined;
  const captured = savedLayout();
  captured.savedAt = "2026-07-02T10:00:00.000Z";
  const request = vi.fn<RestorationBridge["request"]>(async (input) => {
    const value = input as Request;
    const result = intercept?.(value);
    if (result) return result;
    if (value.operation === "host.capabilities") return { capabilities };
    if (value.operation === "read") return current;
    if (value.operation === "terminal.captureLayout.v1") return captured;
    if (value.operation === "replace")
      return stateDocument(revision(2), value.value);
    return { ok: true, status: "accepted", fallbacks: 1 };
  });
  let language!: (language: "en-US" | "pt-BR") => void;
  const page = mountRestorationPage(document, {
    request,
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return vi.fn();
    },
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return vi.fn();
    },
  });
  dispose = page.dispose;
  await page.ready;
  const button = (name: string) =>
    document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
  const calls = (operation: string) =>
    request.mock.calls
      .map(([value]) => value as Request)
      .filter((value) => value.operation === operation);
  return {
    request,
    captured,
    page,
    button,
    calls,
    visibility,
    language: (value: "en-US" | "pt-BR") => language(value),
    read(value: unknown) {
      current = value;
    },
    intercept(handler: NonNullable<typeof intercept>) {
      intercept = handler;
    },
  };
}
function key(button: HTMLElement, type: "keydown" | "keyup", repeat = false) {
  button.dispatchEvent(
    new KeyboardEvent(type, {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      repeat,
    }),
  );
}
const text = () => document.body.textContent ?? "";
const shown = (button: HTMLButtonElement) => !button.hidden;

it("reads the saved layout without opening it and shows only a summary", async () => {
  const f = await setup();
  expect(
    f.request.mock.calls.map(([value]) => (value as Request).operation),
  ).toEqual(["host.capabilities", "read"]);
  expect(text()).toContain("1 tab · 3 panes");
  expect(text()).not.toContain("/synthetic/reported");
  expect(shown(f.button("open"))).toBe(true);
  expect(f.button("open").className).toContain("page-button-primary");
  expect(f.button("save").textContent).toBe("Replace with this window");
  expect(f.button("save").className).toContain("page-button-quiet");
  expect(shown(f.button("retry"))).toBe(false);
  expect(f.calls("terminal.openLayout.v1")).toHaveLength(0);
});
it("offers only Save when nothing is saved", async () => {
  const f = await setup(stateDocument("absent", null));
  expect(text()).toContain("Nothing saved yet");
  expect(shown(f.button("open"))).toBe(false);
  expect(shown(f.button("forget"))).toBe(false);
  expect(f.button("save").textContent).toBe("Save this window");
  expect(f.button("save").className).toContain("page-button-primary");
});
it("says when the shell never reported a folder", async () => {
  const layout = savedLayout();
  layout.tabs[0]!.panes = layout.tabs[0]!.panes.map(() => ({
    kind: "home" as const,
  }));
  await setup(stateDocument(revision(1), layout));
  expect(text()).toContain("didn't report its folder");
  dispose?.();
  await setup();
  expect(text()).not.toContain("didn't report its folder");
});
it("captures the live window, then replaces only against the displayed revision", async () => {
  const f = await setup();
  f.button("save").click();
  f.button("save").click();
  expect(f.calls("terminal.captureLayout.v1")).toHaveLength(1);
  await vi.waitFor(() => expect(f.calls("replace")).toHaveLength(1));
  expect(f.calls("replace")[0]).toEqual({
    operation: "replace",
    expectedRevision: revision(1),
    value: f.captured,
  });
  await vi.waitFor(() => expect(f.button("forget").disabled).toBe(false));
  f.button("forget").click();
  await vi.waitFor(() => expect(f.calls("replace")).toHaveLength(2));
  expect(f.calls("replace")[1]).toEqual({
    operation: "replace",
    expectedRevision: revision(2),
    value: null,
  });
});
it("shows the newer layout after a conflict and saves against it next time", async () => {
  const f = await setup();
  f.intercept((value) =>
    value.operation === "replace"
      ? Promise.resolve({ ok: false, error: "conflict" })
      : undefined,
  );
  f.read(stateDocument(revision(3), savedLayout()));
  f.button("save").click();
  await vi.waitFor(() =>
    expect(text()).toContain("Another window changed the saved layout"),
  );
  await vi.waitFor(() => expect(f.button("save").disabled).toBe(false));
  expect(f.calls("replace")).toHaveLength(1);
  expect(f.calls("read")).toHaveLength(2);
  f.intercept(() => undefined);
  f.button("save").click();
  await vi.waitFor(() => expect(f.calls("replace")).toHaveLength(2));
  expect(f.calls("replace")[1]!.expectedRevision).toBe(revision(3));
});
it("reports a lost write receipt and reads again instead of resubmitting", async () => {
  const f = await setup();
  f.intercept((value) =>
    value.operation === "replace"
      ? Promise.reject(new Error("transport"))
      : undefined,
  );
  f.button("forget").click();
  await vi.waitFor(() =>
    expect(text()).toContain("Couldn't confirm the change"),
  );
  await vi.waitFor(() => expect(f.calls("read")).toHaveLength(2));
  expect(f.calls("replace")).toHaveLength(1);
});
it("lets an invalid layout be replaced or forgotten, and offers Try again when nothing can be read", async () => {
  const f = await setup(stateDocument(revision(1), { unrelated: true }));
  expect(text()).toContain("can't be used");
  expect(shown(f.button("open"))).toBe(false);
  expect(f.button("save").textContent).toBe("Replace with this window");
  expect(shown(f.button("forget"))).toBe(true);
  dispose?.();
  const g = await setup({ ok: false, error: "invalid-state" });
  expect(text()).toContain("Couldn't read the saved layout");
  expect(shown(g.button("save"))).toBe(false);
  expect(shown(g.button("forget"))).toBe(false);
  g.read(stateDocument(revision(4), savedLayout()));
  g.button("retry").click();
  await vi.waitFor(() => expect(text()).toContain("1 tab · 3 panes"));
  expect(shown(g.button("retry"))).toBe(false);
});
it("reads again when the page is shown, so another window's save appears", async () => {
  const f = await setup();
  f.visibility(false);
  f.read(stateDocument("absent", null));
  f.visibility(true);
  await vi.waitFor(() => expect(text()).toContain("Nothing saved yet"));
});
it.each(["hide", "dispose"])(
  "does not write a captured layout after source %s",
  async (reason) => {
    const f = await setup();
    let finish!: (value: unknown) => void;
    f.intercept((value) =>
      value.operation === "terminal.captureLayout.v1"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : undefined,
    );
    f.button("save").click();
    expect(f.button("save").disabled).toBe(true);
    if (reason === "hide") f.visibility(false);
    else f.page.dispose();
    finish(f.captured);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.calls("replace")).toHaveLength(0);
  },
);
it("opens exactly the loaded snapshot after Enter release, never on keydown or repeat", async () => {
  const loaded = savedLayout();
  const f = await setup(stateDocument(revision(1), loaded));
  const open = f.button("open");
  key(open, "keydown");
  key(open, "keydown", true);
  expect(f.calls("terminal.openLayout.v1")).toHaveLength(0);
  loaded.savedAt = "2026-07-03T00:00:00.000Z";
  key(open, "keyup");
  open.click();
  expect(f.calls("terminal.openLayout.v1")).toEqual([
    { operation: "terminal.openLayout.v1", layout: savedLayout() },
  ]);
  expect(f.calls("terminal.captureLayout.v1")).toHaveLength(0);
});
it("says how many missing folders fell back to home", async () => {
  const f = await setup();
  f.button("open").click();
  await vi.waitFor(() =>
    expect(text()).toContain(
      "1 folder no longer exists, so that pane started in your home folder.",
    ),
  );
});
it.each(["blur", "button-blur", "hide", "lost-release"])(
  "cancels held Open on %s",
  async (reason) => {
    const f = await setup();
    vi.useFakeTimers();
    const open = f.button("open");
    key(open, "keydown");
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "button-blur") open.dispatchEvent(new Event("blur"));
    if (reason === "hide") f.visibility(false);
    if (reason === "lost-release") vi.advanceTimersByTime(30_000);
    key(open, "keyup");
    expect(f.calls("terminal.openLayout.v1")).toHaveLength(0);
  },
);
it("dispatches pointer Open immediately and treats a malformed acceptance as unknown", async () => {
  const f = await setup();
  f.intercept((value) =>
    value.operation === "terminal.openLayout.v1"
      ? Promise.resolve({})
      : undefined,
  );
  f.button("open").click();
  expect(f.calls("terminal.openLayout.v1")).toHaveLength(1);
  await vi.waitFor(() =>
    expect(text()).toContain("A new window may already be open"),
  );
  expect(f.calls("terminal.openLayout.v1")).toHaveLength(1);
});
it("hides Save and Open on a host without the layout capabilities", async () => {
  const f = await setup(undefined, []);
  expect(text()).toContain("can't save or open layouts");
  expect(shown(f.button("open"))).toBe(false);
  expect(shown(f.button("save"))).toBe(false);
  expect(document.querySelector(".ui-link")?.hasAttribute("hidden")).toBe(true);
});
it("opens the guide through the declared docs link", async () => {
  const f = await setup();
  document.querySelector<HTMLButtonElement>(".ui-link")!.click();
  expect(f.calls("links.open.v1")).toEqual([
    { operation: "links.open.v1", link: "docs" },
  ]);
});
it("follows the interface language", async () => {
  const f = await setup();
  f.language("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(text()).toContain("1 aba · 3 painéis");
  expect(f.button("open").textContent).toBe("Abrir em uma nova janela");
  expect(f.button("save").textContent).toBe("Substituir por esta janela");
});
it("focuses the main action once the saved layout is read", async () => {
  const f = await setup();
  expect(document.activeElement).toBe(f.button("open"));
  dispose?.();
  const g = await setup(stateDocument("absent", null));
  expect(document.activeElement).toBe(g.button("save"));
});
it("says the windows come back at startup on a host that reopens them", async () => {
  await setup(undefined, [
    "terminal.captureLayout.v1",
    "terminal.openLayout.v1",
    "terminal.reopenLayout.v1",
  ]);
  expect(text()).toContain("come back when OMXTerm starts");
});
