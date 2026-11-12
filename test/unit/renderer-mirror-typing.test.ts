// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  MirrorCommand,
  MirrorTypingBridge,
} from "../../src/shared/mirror-typing";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import { createCompanionContent } from "../../src/renderer/companion-content";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const paneMarks = () =>
  [...document.querySelectorAll(".terminal-surface")].map(
    (pane) => pane.querySelector(".ui-mark")?.getAttribute("aria-label") ?? "",
  );
const notice = () =>
  document.querySelector<HTMLElement>(".state-notice:not([hidden])")
    ?.textContent ?? "";
async function harness(showTabBar = false) {
  // jsdom has no modal dialogs; the attribute is all the host reads.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  let command!: (value: MirrorCommand) => void;
  const opens = new Set<(value: HostedContentDescriptor) => void>();
  const open = (value: HostedContentDescriptor) =>
    opens.forEach((listener) => listener(value));
  const bridge: MirrorTypingBridge = {
    onCommand: (listener) => {
      command = listener;
      return vi.fn();
    },
    reply: vi.fn(),
    input: vi.fn(),
    stop: vi.fn(),
  };
  const hosted: HostedContentBridge = {
    onOpen: (listener) => {
      opens.add(listener);
      return () => opens.delete(listener);
    },
    onRetired: () => vi.fn(),
    onFailure: () => vi.fn(),
    present: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
  const language = createRendererLanguage();
  // Setup opens as a dialog owned by the window's companion content.
  const companion = createCompanionContent(
    document.createElement("div"),
    undefined,
    hosted,
    {
      language,
      focusTerminal: () => h.tabs.focusSelected(),
      blocked: () => false,
    },
  );
  const h = createTabsHarness({
    tabsOptions: {
      mirrorTyping: bridge,
      hostedContent: hosted,
      hostedPresentation: companion.presentation,
      selectContent: companion.select,
      isDialogShown: companion.dialogShown,
      language,
      showTabBar,
    },
  });
  owners.push(h.tabs, companion);
  await h.tabs.ready;
  h.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
  h.tabs.handleCommand({ action: "split", direction: "right" });
  await settle();
  h.sessionAdapters[1]!.resize({ cols: 120, rows: 40 });
  const reply = () => vi.mocked(bridge.reply).mock.calls.at(-1)![0];
  const capture = () => {
    command({ kind: "capture", context: "context", request: "capture" });
    return reply();
  };
  const setup = async () => {
    const result = capture();
    open({ id: "setup", title: "Mirror", presentation: "dialog" });
    await settle();
    return result;
  };
  const prepare = async (handles: string[], handoff = true) => {
    command({
      kind: "prepare",
      context: "context",
      request: "prepare",
      handles,
      sourceView: "setup",
    });
    if (handoff && reply().ok)
      command({
        kind: "handoff",
        context: "context",
        request: "handoff",
        prepared: "prepare",
      });
    await settle();
  };
  const activate = (prepared = "prepare", shortcut?: string) =>
    command({
      kind: "activate",
      context: "context",
      request: "activate",
      prepared,
      lease: "lease",
      ...(shortcut ? { shortcut } : {}),
    });
  const start = async (shortcut?: string) => {
    const result = await setup();
    await prepare(result.panes!.map((pane) => pane.handle));
    activate("prepare", shortcut);
    expect(reply().ok).toBe(true);
  };
  return {
    ...h,
    bridge,
    hosted,
    command,
    capture,
    setup,
    prepare,
    activate,
    start,
    reply,
    language,
  };
}

it("captures exact original focus, hands off only after native hide, and sends one final-byte envelope", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  expect(snapshot.panes!.map((pane) => pane.required)).toEqual([false, true]);
  let hidden!: (ok: boolean) => void;
  vi.mocked(h.hosted.present).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        hidden = resolve;
      }),
  );
  await h.prepare(snapshot.panes!.map((pane) => pane.handle));
  expect(h.reply()).toEqual({ request: "prepare", ok: true });
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("before")).toBe(false);
  hidden(true);
  await settle();
  expect(h.reply()).toEqual({ request: "handoff", ok: true });
  h.activate();
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("\u001b[A")).toBe(true);
  expect(h.bridge.input).toHaveBeenCalledExactlyOnceWith({
    lease: "lease",
    sequence: 1,
    sourceSessionId: "s2",
    data: "\u001b[A",
  });
  expect(
    h.adapters.every(
      (adapter) => vi.mocked(adapter.write).mock.calls.length === 0,
    ),
  ).toBe(true);
  expect(h.strip.hidden).toBe(true);
  expect(paneMarks()).toEqual([
    expect.stringContaining("to this pane"),
    expect.stringContaining("from this pane"),
  ]);
  expect(notice()).toBe("");
  const focusCount = h.surfaces[1]!.focus.mock.calls.length;
  h.language.set("pt-BR");
  expect(paneMarks()[1]).toContain("deste painel");
  expect(h.surfaces[1]!.focus).toHaveBeenCalledTimes(focusCount);
});

it("repeats the mark on the visible tab and clears every mark on an ordinary stop", async () => {
  const h = await harness(true);
  // A second tab shows the strip; setup itself never adds a tab.
  h.tabs.handleCommand({ action: "new" });
  await settle();
  h.tabs.handleCommand({ action: "previous" });
  await settle();
  await h.start();
  expect(h.strip.querySelectorAll("button")).toHaveLength(2);
  const terminalTab = h.strip.querySelector("button")!;
  const mark = terminalTab.querySelector("[role=img]")!;
  expect(mark.getAttribute("title")).toBe("Mirroring typing from this pane.");
  expect(paneMarks()[1]).toBe(
    "Mirroring typing from this pane. Click to stop.",
  );
  // Opening the Command Palette is a modal entry: it stops mirroring.
  h.tabs.setBlocked(true);
  expect(h.bridge.stop).toHaveBeenCalledExactlyOnceWith(
    "context",
    "unavailable",
  );
  expect(paneMarks()).toEqual(["", "", ""]);
  expect(h.strip.querySelector("[role=img]")).toBeNull();
  expect(notice()).toBe("");
});

it("waits for focus to come back after the setup view hides, then focuses the original pane", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  await h.prepare(snapshot.panes!.map((pane) => pane.handle));
  expect(h.reply()).toEqual({ request: "prepare", ok: true });
  expect(h.bridge.stop).not.toHaveBeenCalled();
  const focusCount = h.surfaces[1]!.focus.mock.calls.length;
  vi.mocked(document.hasFocus).mockReturnValue(true);
  window.dispatchEvent(new Event("focus"));
  expect(h.reply()).toEqual({ request: "handoff", ok: true });
  expect(h.surfaces[1]!.focus.mock.calls.length).toBeGreaterThan(focusCount);
  h.activate();
  expect(h.reply().ok).toBe(true);
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("x")).toBe(true);
  expect(h.bridge.input).toHaveBeenCalledOnce();
});

it("cancels a Start waiting for focus on blur, and a later focus does not arm it", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  await h.prepare(snapshot.panes!.map((pane) => pane.handle));
  window.dispatchEvent(new Event("blur"));
  expect(h.reply()).toEqual({ request: "handoff", ok: false });
  expect(h.bridge.stop).toHaveBeenCalledWith("context", "unavailable");
  vi.mocked(document.hasFocus).mockReturnValue(true);
  window.dispatchEvent(new Event("focus"));
  expect(h.reply()).toEqual({ request: "handoff", ok: false });
  h.activate();
  expect(h.reply().ok).toBe(false);
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("x")).toBe(false);
});

it("refuses Start when focus never comes back after the setup view hides", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  vi.useFakeTimers();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  await h.prepare(snapshot.panes!.map((pane) => pane.handle));
  vi.advanceTimersByTime(5000);
  expect(h.reply()).toEqual({ request: "handoff", ok: false });
  expect(h.bridge.stop).toHaveBeenCalledWith("context", "unavailable");
  vi.mocked(document.hasFocus).mockReturnValue(true);
  window.dispatchEvent(new Event("focus"));
  expect(h.reply()).toEqual({ request: "handoff", ok: false });
  h.activate();
  expect(h.reply().ok).toBe(false);
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("x")).toBe(false);
});

it("owns cancellable Preparing before store admission and rejects leave-and-return", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  await h.prepare(
    snapshot.panes!.map((pane) => pane.handle),
    false,
  );
  expect(paneMarks()).toEqual(["", ""]);
  h.tabs.handleCommand({ action: "previous" });
  h.tabs.handleCommand({ action: "next" });
  await settle();
  expect(h.bridge.stop).toHaveBeenCalledWith("context", "unavailable");
  h.command({
    kind: "handoff",
    context: "context",
    request: "late-handoff",
    prepared: "prepare",
  });
  expect(h.reply()).toEqual({ request: "late-handoff", ok: false });
  h.activate();
  expect(h.reply().ok).toBe(false);
});

it("clicking any pane's mark stops mirroring quietly and keeps terminal focus", async () => {
  const h = await harness();
  await h.start();
  h.language.set("pt-BR");
  expect(paneMarks()[0]).toBe(
    "Espelhando a digitação para este painel. Clique para parar.",
  );
  const member = document
    .querySelectorAll(".terminal-surface")[0]!
    .querySelector<HTMLButtonElement>("button.ui-mark")!;
  const press = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  member.dispatchEvent(press);
  expect(press.defaultPrevented).toBe(true);
  const focusCount = h.surfaces[1]!.focus.mock.calls.length;
  member.click();
  expect(h.bridge.stop).toHaveBeenCalledExactlyOnceWith("context", "stopped");
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("x")).toBe(false);
  expect(paneMarks()).toEqual(["", ""]);
  expect(notice()).toBe("");
  expect(h.surfaces[1]!.focus.mock.calls.length).toBeGreaterThan(focusCount);
});

it("semantic gestures synchronously stop once, then leave ordinary local delivery available", async () => {
  const h = await harness();
  await h.start();
  vi.useFakeTimers();
  const source = h.mountedSurfaceOptions[1]!;
  source.onSemanticInput!();
  source.onSemanticInput!();
  expect(h.bridge.stop).toHaveBeenCalledExactlyOnceWith(
    "context",
    "semantic-input",
  );
  expect(source.routeKeyInput!("local")).toBe(false);
  expect(paneMarks()).toEqual(["", ""]);
  expect(notice()).toContain("one pane");
  h.activate();
  expect(h.reply().ok).toBe(false);
  vi.advanceTimersByTime(4000);
  expect(notice()).toBe("");
});

it.each(["blur", "overlay", "switch", "death", "preview"])(
  "fences a held prepare against %s and rejects late activation",
  async (reason) => {
    const h = await harness();
    const snapshot = await h.setup();
    let hidden!: (ok: boolean) => void;
    vi.mocked(h.hosted.present).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          hidden = resolve;
        }),
    );
    await h.prepare(snapshot.panes!.map((pane) => pane.handle));
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "overlay") h.tabs.setBlocked(true);
    if (reason === "switch") h.tabs.handleCommand({ action: "next" });
    if (reason === "death")
      h.adapters[0]!.handlers!.onExit({
        exitCode: 0,
        signal: 0,
        retained: true,
      });
    if (reason === "preview") h.tabs.openOverlay(() => {});
    const focusBeforeHide = h.surfaces[1]!.focus.mock.calls.length;
    hidden(true);
    await settle();
    if (reason !== "switch")
      expect(h.surfaces[1]!.focus).toHaveBeenCalledTimes(focusBeforeHide);
    h.activate();
    expect(h.reply().ok).toBe(false);
    expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("late")).toBe(false);
    expect(h.bridge.input).not.toHaveBeenCalled();
  },
);

it("retains original context for describe and refuses an ended original even with live siblings", async () => {
  const h = await harness();
  h.tabs.handleCommand({ action: "split", direction: "down" });
  await settle();
  const original = await h.setup();
  h.command({ kind: "describe", context: "context", request: "refresh" });
  expect(h.reply().panes!.map((pane) => pane.sessionId)).toEqual(
    original.panes!.map((pane) => pane.sessionId),
  );
  expect(h.reply().panes![0]!.handle).not.toBe(original.panes![0]!.handle);
  h.adapters[2]!.handlers!.onExit({ exitCode: 0, signal: 0, retained: true });
  h.command({ kind: "describe", context: "context", request: "dead" });
  expect(h.reply()).toEqual({
    request: "dead",
    ok: false,
    error: "focus-live-pane",
  });
  h.tabs.handleCommand({ action: "previous" });
  await settle();
  expect(h.capture().ok).toBe(false);
});

it("shows a localized, dismissible partial-delivery notice and clears the marks", async () => {
  const h = await harness();
  await h.start();
  vi.useFakeTimers();
  h.command({ kind: "stop", context: "context", reason: "write-failed" });
  expect(paneMarks()).toEqual(["", ""]);
  expect(notice()).toContain("some panes may have missed");
  h.language.set("pt-BR");
  expect(notice()).toContain("alguns painéis podem não ter recebido");
  vi.advanceTimersByTime(60000);
  const dismiss = document.querySelector<HTMLButtonElement>(
    ".state-notice button",
  )!;
  expect(dismiss.getAttribute("aria-label")).toBe("Fechar");
  dismiss.click();
  expect(notice()).toBe("");
});

it("keeps active blur dormant, stops on new unselected split, and never enrolls it", async () => {
  const h = await harness();
  await h.start();
  window.dispatchEvent(new Event("blur"));
  vi.mocked(document.hasFocus).mockReturnValue(false);
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("background")).toBe(true);
  expect(h.bridge.input).not.toHaveBeenCalled();
  expect(h.bridge.stop).not.toHaveBeenCalled();
  vi.mocked(document.hasFocus).mockReturnValue(true);
  h.tabs.handleCommand({ action: "split", direction: "down" });
  await settle();
  expect(h.bridge.stop).toHaveBeenCalledWith("context", "unavailable");
  expect(h.mountedSurfaceOptions[2]!.routeKeyInput!("new")).toBe(false);
});

it("consumes Start repeats and release, but not a fresh terminal press", async () => {
  const h = await harness();
  await h.start();
  const release = new KeyboardEvent("keyup", {
    key: "Enter",
    code: "Enter",
    cancelable: true,
  });
  window.dispatchEvent(release);
  expect(release.defaultPrevented).toBe(true);
  const repeat = new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    repeat: true,
    cancelable: true,
  });
  window.dispatchEvent(repeat);
  expect(repeat.defaultPrevented).toBe(true);
  const fresh = new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    cancelable: true,
  });
  window.dispatchEvent(fresh);
  expect(fresh.defaultPrevented).toBe(false);
  expect(h.bridge.stop).not.toHaveBeenCalled();
});

it.each(["foreign", "duplicate", "missing-original", "stale-refresh"])(
  "refuses %s membership without hiding setup",
  async (mode) => {
    const h = await harness();
    const snapshot = await h.setup();
    const handles = snapshot.panes!.map((pane) => pane.handle);
    if (mode === "foreign") handles[0] = "foreign";
    if (mode === "duplicate") handles[0] = handles[1]!;
    if (mode === "missing-original") handles.pop();
    if (mode === "stale-refresh")
      h.command({ kind: "describe", context: "context", request: "refresh" });
    vi.mocked(h.hosted.present).mockClear();
    await h.prepare(handles);
    expect(h.reply()).toEqual({ request: "prepare", ok: false });
    expect(h.hosted.present).not.toHaveBeenCalled();
    expect(h.bridge.input).not.toHaveBeenCalled();
  },
);

it("times out failed native hide without arming, and fences the exact ready request", async () => {
  const h = await harness();
  const snapshot = await h.setup();
  vi.useFakeTimers();
  vi.mocked(h.hosted.present).mockResolvedValueOnce(false);
  await h.prepare(snapshot.panes!.map((pane) => pane.handle));
  vi.advanceTimersByTime(5000);
  expect(h.reply()).toEqual({ request: "handoff", ok: false });
  h.activate();
  expect(h.reply().ok).toBe(false);
  vi.useRealTimers();
});

it("allows selected-member focus, but a stale activation cannot replace the active lease", async () => {
  const h = await harness();
  await h.start();
  h.mountedSurfaceOptions[0]!.onContextMenu!();
  expect(h.mountedSurfaceOptions[0]!.routeKeyInput!("member")).toBe(true);
  expect(h.bridge.input).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceSessionId: "s1" }),
  );
  expect(paneMarks()[0]).toContain("from this pane");
  expect(paneMarks()[1]).toContain("to this pane");
  h.activate("wrong-prepare");
  expect(h.reply().ok).toBe(false);
  expect(h.mountedSurfaceOptions[0]!.routeKeyInput!("local")).toBe(false);
});

it("main stop does not echo and retired setup cannot describe again", async () => {
  const h = await harness();
  await h.start();
  h.command({ kind: "stop", context: "context", reason: "stopped" });
  expect(h.bridge.stop).not.toHaveBeenCalled();
  h.command({ kind: "retire", context: "context" });
  h.command({ kind: "describe", context: "context", request: "retired" });
  expect(h.reply().ok).toBe(false);
});

it("names the toggle's binding in each mark's tooltip and accessible name", async () => {
  const h = await harness();
  await h.start("Ctrl+Shift+M");
  const mark = document.querySelectorAll<HTMLElement>(".ui-mark")[1]!;
  expect(mark.getAttribute("aria-label")).toBe(
    "Mirroring typing from this pane. Click or press Ctrl+Shift+M to stop.",
  );
  expect(mark.dataset.tip).toBe(mark.getAttribute("aria-label"));
  h.language.set("pt-BR");
  expect(paneMarks()[1]).toContain(
    "Clique ou pressione Ctrl+Shift+M para parar.",
  );
});
