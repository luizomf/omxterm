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
async function harness() {
  let command!: (value: MirrorCommand) => void;
  let open!: (value: HostedContentDescriptor) => void;
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
      open = listener;
      return vi.fn();
    },
    onRetired: () => vi.fn(),
    onFailure: () => vi.fn(),
    present: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
  const language = createRendererLanguage();
  const h = createTabsHarness({
    tabsOptions: {
      mirrorTyping: bridge,
      hostedContent: hosted,
      language,
      showTabBar: false,
    },
  });
  owners.push(h.tabs);
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
    open({ id: "setup", title: "Mirror" });
    await settle();
    return result;
  };
  const prepare = async (handles: string[]) => {
    command({
      kind: "prepare",
      context: "context",
      request: "prepare",
      handles,
      sourceView: "setup",
    });
    await settle();
  };
  const activate = (prepared = "prepare") =>
    command({
      kind: "activate",
      context: "context",
      request: "activate",
      prepared,
      lease: "lease",
    });
  const start = async () => {
    const result = await setup();
    await prepare(result.panes!.map((pane) => pane.handle));
    activate();
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
  expect(h.reply().request).toBe("capture");
  expect(h.mountedSurfaceOptions[1]!.routeKeyInput!("before")).toBe(false);
  hidden(true);
  await settle();
  expect(h.reply()).toEqual({ request: "prepare", ok: true });
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
  const row = document.querySelector<HTMLElement>(".mirror-typing-status")!;
  expect(row.hidden).toBe(false);
  expect(row.textContent).toContain("2 panes");
  expect(document.querySelectorAll(".mirror-typing-marker")).toHaveLength(2);
  const focusCount = h.surfaces[1]!.focus.mock.calls.length;
  h.language.set("pt-BR");
  expect(row.textContent).toContain("Parar");
  expect(h.surfaces[1]!.focus).toHaveBeenCalledTimes(focusCount);
});

it("semantic gestures synchronously stop once, then leave ordinary local delivery available", async () => {
  const h = await harness();
  await h.start();
  const source = h.mountedSurfaceOptions[1]!;
  source.onSemanticInput!();
  source.onSemanticInput!();
  expect(h.bridge.stop).toHaveBeenCalledExactlyOnceWith(
    "context",
    "semantic-input",
  );
  expect(source.routeKeyInput!("local")).toBe(false);
  expect(
    document.querySelector(".mirror-typing-status")!.textContent,
  ).toContain("one pane");
  h.activate();
  expect(h.reply().ok).toBe(false);
});

it.each(["blur", "overlay", "switch", "death", "cancel"])(
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
    if (reason === "cancel")
      document
        .querySelector<HTMLButtonElement>(".mirror-typing-status button")!
        .click();
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
  expect(h.reply()).toEqual({ request: "dead", ok: false });
  h.tabs.handleCommand({ action: "previous" });
  await settle();
  expect(h.capture().ok).toBe(false);
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

it("consumes Start/Stop repeats and release, but not a fresh terminal press", async () => {
  const h = await harness();
  await h.start();
  const release = new KeyboardEvent("keyup", {
    key: "Enter",
    code: "Enter",
    cancelable: true,
  });
  window.dispatchEvent(release);
  expect(release.defaultPrevented).toBe(true);
  const button = document.querySelector<HTMLButtonElement>(
    ".mirror-typing-status button",
  )!;
  button.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    }),
  );
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
  expect(h.bridge.stop).toHaveBeenCalledOnce();
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
  expect(h.reply()).toEqual({ request: "prepare", ok: false });
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
  expect(
    document.querySelector(".mirror-typing-marker")!.textContent,
  ).toContain("source");
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
