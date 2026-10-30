// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import {
  createTabsHarness,
  selectedStates,
  dragTabTo,
} from "../fixtures/terminal-tabs-harness";
import { deferred, base, saved } from "../fixtures/settings-dialog-dom";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function harness(canFocus = () => true) {
  const extensionRequest = vi.fn(async () => ({ ok: true }));
  let open!: (descriptor: HostedContentDescriptor) => void;
  let retire!: (id: string) => void;
  let fail!: () => void;
  const bridge: HostedContentBridge = {
    onOpen: (listener) => {
      open = listener;
      return vi.fn();
    },
    onRetired: (listener) => {
      retire = listener;
      return vi.fn();
    },
    onFailure: (listener) => {
      fail = listener;
      return vi.fn();
    },
    present: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
  const notifyEmpty = vi.fn();
  const sshPane = vi.fn();
  const h = createTabsHarness({
    tabsOptions: {
      canFocus,
      sshPane,
      extensions: { request: extensionRequest },
      notifyEmpty,
      hostedContent: bridge,
      settings: {
        snapshot: async () => base,
        change: async () => saved(base),
        saveText: async () => saved(base),
        changeKeybind: vi.fn(),
        captureShortcut: () => () => {},
        onOpen: () => () => {},
      },
    },
  });
  owners.push(h.tabs);
  return {
    ...h,
    extensionRequest,
    notifyEmpty,
    sshPane,
    bridge,
    open: (id = "view-a") => open({ id, title: id }),
    retire,
    fail: () => fail(),
  };
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

it.each(["source", "changed-selection", "modal"])(
  "composes SSH handoff and retained Close from %s",
  async (mode) => {
    let blocked = false;
    const h = harness(() => !blocked);
    await h.tabs.ready;
    h.open("ssh-view");
    await settle();
    if (mode === "changed-selection")
      h.tabs.handleCommand({ action: "previous" });
    if (mode === "modal") blocked = true;
    h.tabs.handleCommand({
      action: "open-ssh",
      token: "launch-token",
      sourceView: "ssh-view",
      title: "SSH · alias",
    });
    await settle();
    expect(h.createAdapter).toHaveBeenLastCalledWith(undefined, "launch-token");
    expect(h.sshPane).toHaveBeenCalledWith("launch-token", true);
    const pane = h.mount.mock.calls[1]![0];
    expect(pane.hidden).toBe(mode !== "source");
    expect(pane.closest<HTMLElement>(".terminal-tab")!.hidden).toBe(
      mode !== "source",
    );
    expect(h.surfaces[1]!.focus.mock.calls.length > 0).toBe(mode === "source");
    h.adapters[1]!.handlers!.onExit({
      exitCode: 23,
      signal: 0,
      retained: true,
    });
    const notice = pane.querySelector<HTMLElement>(".terminal-exit-notice")!;
    expect(notice.textContent).toContain("23");
    expect(h.surfaces[1]!.dispose).not.toHaveBeenCalled();
    notice.querySelector("button")!.click();
    expect(h.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(pane.isConnected).toBe(false);
  },
);

it("denies modal action admission and keeps late hosted publication behind the same owner", async () => {
  let blocked = false;
  const h = harness(() => !blocked);
  await h.tabs.ready;
  const owner = h.tabs.captureActionTarget();
  blocked = true;
  h.tabs.handleCommand({
    action: "open-extension",
    token: "00000000-0000-0000-0000-000000000001",
  });
  expect(h.extensionRequest).toHaveBeenCalledWith(
    expect.objectContaining({ operation: "open", accepted: false }),
  );
  h.open("late");
  await settle();
  expect(selectedStates(h.strip)).toEqual(["1:true", "late:false"]);
  expect(owner.isCurrent()).toBe(true);
  expect(h.tabs.isTerminalSelected()).toBe(true); // Selection was not stolen.
  blocked = false;
  h.tabs.handleCommand({ action: "next" });
  await settle();
  expect(selectedStates(h.strip)).toEqual(["1:false", "late:true"]);
});
it.each(["terminal", "settings", "hosted", "modal"])(
  "admits the Snippets compatibility command only on an unblocked terminal: %s",
  async (mode) => {
    let blocked = false;
    const h = harness(() => !blocked);
    await h.tabs.ready;
    if (mode === "settings") h.tabs.openSettings();
    if (mode === "hosted") h.open();
    await settle();
    if (mode === "modal") blocked = true;
    h.tabs.handleCommand({
      action: "toggle-snippets-extension",
      token: "00000000-0000-0000-0000-000000000001",
    });
    expect(h.extensionRequest).toHaveBeenCalledWith({
      operation: "open",
      token: "00000000-0000-0000-0000-000000000001",
      accepted: mode === "terminal",
    });
    h.tabs.handleCommand({ action: "snippets-management" });
    expect(h.tabs.isSettingsSelected()).toBe(
      mode === "terminal" || mode === "settings",
    );
    expect(h.surfaces[0]!.inject).not.toHaveBeenCalled();
  },
);

it("opens only on main descriptors in the ordered list, with no PTY or clipboard forwarding", async () => {
  const h = harness();
  await h.tabs.ready;
  expect(h.bridge.present).not.toHaveBeenCalled();
  h.open();
  await settle();
  expect(selectedStates(h.strip)).toEqual(["1:false", "view-a:true"]);
  expect(h.tabs.isSettingsSelected()).toBe(false);
  expect(h.tabs.isTerminalSelected()).toBe(false);
  expect(h.notifySelection).toHaveBeenLastCalledWith(null, []);
  const target = h.tabs.captureActionTarget();
  h.tabs.clipboardAction("paste");
  h.tabs.injectText("not a shell command");
  h.tabs.handleCommand({ action: "split", direction: "right" });
  expect(h.createAdapter).toHaveBeenCalledOnce();
  expect(h.surfaces[0]!.paste).not.toHaveBeenCalled();
  expect(h.surfaces[0]!.inject).not.toHaveBeenCalled();
  dragTabTo(h.strip, 1, 0);
  expect(target.isCurrent()).toBe(true);
  h.tabs.handleCommand({ action: "next" });
  await settle();
  expect(target.isCurrent()).toBe(false);
  h.tabs.handleCommand({ action: "previous" });
  await settle();
  h.tabs.handleCommand({ action: "close" });
  await settle();
  expect(h.bridge.close).toHaveBeenCalledWith("view-a");
  expect(h.adapters[0]!.close).not.toHaveBeenCalled();
});

it("retains a Close Enter gesture across the terminal focus handoff", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  const close = document.querySelector<HTMLButtonElement>(
    ".hosted-content-tab button",
  )!;
  close.focus();
  const key = (type: string, repeat = false) =>
    new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      repeat,
      bubbles: true,
      cancelable: true,
    });
  close.dispatchEvent(key("keydown"));
  close.click();
  await settle();
  expect(h.tabs.isTerminalSelected()).toBe(true);
  const repeat = key("keydown", true);
  document.body.dispatchEvent(repeat);
  expect(repeat.defaultPrevented).toBe(true);
  const release = key("keyup");
  document.body.dispatchEvent(release);
  expect(release.defaultPrevented).toBe(true);
  const fresh = key("keydown");
  document.body.dispatchEvent(fresh);
  expect(fresh.defaultPrevented).toBe(false);
});

it("retains failed epoch ownership with an actionable core notice", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  h.fail();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "Close the window",
  );
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
  expect(h.notifyEmpty).not.toHaveBeenCalled();
});

it("awaits hide before DOM focus and ignores a stale selection continuation", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
  h.surfaces[0]!.focus.mockClear();
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  h.tabs.handleCommand({ action: "previous" });
  window.dispatchEvent(new Event("resize"));
  frame!(0);
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBeNull();
  h.tabs.focusSelected();
  expect(h.surfaces[0]!.focus).not.toHaveBeenCalled();
  h.open("view-b");
  await settle();
  hide.resolve(true);
  await settle();
  expect(h.surfaces[0]!.focus).not.toHaveBeenCalled();
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBe("view-b");
});

it.each(["accept", "refuse", "reject"])(
  "refuses hidden-terminal actions until hide commits (%s)",
  async (outcome) => {
    const h = harness();
    await h.tabs.ready;
    h.open();
    await settle();
    const hide = deferred<boolean>();
    vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
    h.tabs.handleCommand({ action: "previous" });
    const attempt = () => {
      h.tabs.injectText("synthetic dropped-path");
      h.tabs.find();
      h.tabs.clipboardAction("paste");
      expect(h.tabs.captureSnippetTarget()).toBeUndefined();
      expect(h.tabs.isTerminalSelected()).toBe(false);
      expect(h.surfaces[0]!.inject).not.toHaveBeenCalled();
      expect(h.surfaces[0]!.find).not.toHaveBeenCalled();
      expect(h.surfaces[0]!.paste).not.toHaveBeenCalled();
    };
    attempt();
    if (outcome === "reject") hide.reject(new Error("synthetic hide"));
    else hide.resolve(outcome === "accept");
    await settle();
    if (outcome !== "accept") {
      attempt();
      // Explicit successful selection may recover; refused input is never replayed.
      h.tabs.handleCommand({ action: "select", position: 1 });
      await settle();
    }
    expect(h.tabs.isTerminalSelected()).toBe(true);
    expect(h.tabs.captureSnippetTarget()).toBeDefined();
    expect(h.surfaces[0]!.inject).not.toHaveBeenCalled();
    h.tabs.injectText("fresh input");
    h.tabs.find();
    h.tabs.clipboardAction("paste");
    expect(h.surfaces[0]!.inject).toHaveBeenCalledWith("fresh input");
    expect(h.surfaces[0]!.find).toHaveBeenCalledOnce();
    expect(h.surfaces[0]!.paste).toHaveBeenCalledOnce();
  },
);

it("holds overlays until hide acknowledgment and restores only the still-current owner", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
  const overlay = vi.fn(() => h.tabs.setBlocked(true));
  h.tabs.openOverlay(overlay);
  h.tabs.focusSelected();
  expect(overlay).not.toHaveBeenCalled();
  hide.resolve(true);
  await settle();
  expect(overlay).toHaveBeenCalledOnce();
  h.tabs.focusSelected();
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBeNull();
  h.retire("view-a");
  await settle();
  h.tabs.setBlocked(false);
  await settle();
  expect(vi.mocked(h.bridge.present).mock.calls.slice(-1)[0]?.[0].id).not.toBe(
    "view-a",
  );
});

it.each([false, "reject"])(
  "fails closed on hide outcome %s",
  async (result) => {
    const h = harness();
    await h.tabs.ready;
    h.open();
    await settle();
    vi.mocked(h.bridge.present).mockImplementationOnce(async () => {
      if (result === "reject") throw new Error("synthetic");
      return false;
    });
    const overlay = vi.fn();
    h.tabs.openOverlay(overlay);
    await settle();
    expect(overlay).not.toHaveBeenCalled();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "could not",
    );
    const count = vi.mocked(h.bridge.present).mock.calls.length;
    h.tabs.focusSelected();
    expect(h.bridge.present).toHaveBeenCalledTimes(count);
  },
);

it("does not revive a retired view on a late show or overlay acknowledgment", async () => {
  const h = harness();
  await h.tabs.ready;
  const show = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => show.promise);
  h.open();
  const overlay = vi.fn();
  const hide = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
  h.tabs.openOverlay(overlay);
  h.retire("view-a");
  await settle();
  show.resolve(false);
  hide.resolve(true);
  await settle();
  expect(overlay).not.toHaveBeenCalled();
  expect(h.tabs.isTerminalSelected()).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toBe("");
  const revisions = vi
    .mocked(h.bridge.present)
    .mock.calls.map(([p]) => p.revision);
  expect(revisions).toEqual([...new Set(revisions)].sort((a, b) => a - b));
});

it("coalesces resize reports using the real CSS slot without stale focus", async () => {
  const h = harness();
  await h.tabs.ready;
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  h.open();
  await settle();
  const slot = document.querySelector<HTMLElement>(".hosted-content-slot")!;
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
    x: 3.5,
    y: 72,
    width: 800.25,
    height: 500,
  } as DOMRect);
  const before = vi.mocked(h.bridge.present).mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  window.dispatchEvent(new Event("resize"));
  expect(h.bridge.present).toHaveBeenCalledTimes(before);
  frame!(0);
  await settle();
  expect(h.bridge.present).toHaveBeenCalledTimes(before + 1);
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0]).toMatchObject({
    id: "view-a",
    focus: false,
    bounds: { x: 3.5, y: 72, width: 800.25, height: 500 },
  });
  window.dispatchEvent(new Event("resize"));
  h.retire("view-a");
  await settle();
  const after = vi.mocked(h.bridge.present).mock.calls.length;
  frame!(1);
  expect(h.bridge.present).toHaveBeenCalledTimes(after);
});

it("does not let resize overtake an in-flight native selection hide", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const hide = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
  h.open("view-b");
  const count = vi.mocked(h.bridge.present).mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  frame!(0);
  h.tabs.focusSelected();
  expect(h.bridge.present).toHaveBeenCalledTimes(count);
  hide.resolve(true);
  await settle();
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBe("view-b");
});

it("does not restore a different tab opened during an overlay", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  h.tabs.openOverlay(() => h.tabs.setBlocked(true));
  await settle();
  h.open("view-b");
  await settle();
  h.tabs.setBlocked(false);
  h.tabs.focusSelected();
  await settle();
  expect(
    vi.mocked(h.bridge.present).mock.calls.some(([p]) => p.id === "view-b"),
  ).toBe(false);
  h.tabs.handleCommand({ action: "select", position: 3 });
  await settle();
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBe("view-b");
});

it("keeps last graphical ownership until close acknowledgment and reports failures", async () => {
  const h = harness();
  await h.tabs.ready;
  h.open();
  await settle();
  h.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
  await settle();
  expect(h.tabs.isTerminalSelected()).toBe(false);
  const target = h.tabs.captureActionTarget();
  const close = deferred<void>();
  vi.mocked(h.bridge.close).mockReturnValueOnce(close.promise);
  h.tabs.handleCommand({ action: "close" });
  expect(target.isCurrent()).toBe(true);
  close.reject(new Error("synthetic"));
  await settle();
  expect(target.isCurrent()).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not",
  );
  h.retire("view-a");
  expect(target.isCurrent()).toBe(false);
  expect(document.querySelector(".hosted-content-tab")).toBeNull();
  expect(h.notifyEmpty).toHaveBeenCalledOnce();
});

it("retains Settings draft and focus, but activates it only after native hide", async () => {
  const h = harness();
  await h.tabs.ready;
  h.tabs.openSettings();
  await vi.waitFor(() =>
    expect(document.querySelector("textarea")).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
    .click();
  const editor = document.querySelector("textarea")!;
  editor.value = "retained draft";
  editor.focus();
  h.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(h.bridge.present).mockImplementationOnce(() => hide.promise);
  h.tabs.openSettings();
  expect(editor.closest<HTMLElement>(".settings-tab")!.hidden).toBe(true);
  hide.resolve(true);
  await settle();
  expect(document.querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("retained draft");
  expect(document.activeElement).toBe(editor);
});
