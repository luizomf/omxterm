import { describe, expect, it, vi } from "vitest";
import {
  createTerminalWindowTitleController,
  MAX_TERMINAL_TITLE_CODE_POINTS,
  sanitizedTerminalTitle,
} from "../../src/main/terminal-window-title";

const BIDI_CONTROL_CODE_POINTS = [
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
  0x2067, 0x2068, 0x2069,
] as const;

function createWindow(focused = false) {
  let isFocused = focused;
  const focusListeners = new Set<() => void>();
  return {
    window: {
      isFocused: () => isFocused,
      setTitle: vi.fn(),
      on: vi.fn((_event: "focus", listener: () => void) =>
        focusListeners.add(listener),
      ),
      removeListener: vi.fn((_event: "focus", listener: () => void) =>
        focusListeners.delete(listener),
      ),
    },
    focus() {
      isFocused = true;
      for (const listener of focusListeners) listener();
    },
    unfocus() {
      isFocused = false;
    },
  };
}

function createControllerHarness(focused = false) {
  const fixture = createWindow(focused);
  const dock = vi.fn(() => vi.fn());
  const rejected = vi.fn();
  const sessionTitles = vi.fn();
  const chromeTitle = vi.fn();
  const attention = vi.fn();
  const notify = vi.fn();
  const clearNotification = vi.fn();
  const controller = createTerminalWindowTitleController(fixture.window, {
    fallbackSessionTitle: "example-shell",
    requestAttention: dock,
    sendSessionTitle: sessionTitles,
    onRejected: rejected,
    onWindowTitle: chromeTitle,
    sendSessionAttention: attention,
    notify,
    clearNotification,
    bellText: () => "Rang the bell.",
  });
  return {
    ...fixture,
    dock,
    rejected,
    sessionTitles,
    chromeTitle,
    attention,
    notify,
    clearNotification,
    controller,
  };
}

describe("native Terminal Title and bell attention", () => {
  it("keeps localized graphical title while background OSC/BEL and focus preserve unseen bells", () => {
    const h = createControllerHarness();
    h.controller.sessionStarted("s1");
    h.controller.selectSession("s1");
    h.controller.selectSettings("Settings");
    h.controller.ringBell("s1");
    h.controller.requestTitle("s1", "synthetic background");
    h.focus();
    expect(h.window.setTitle).toHaveBeenLastCalledWith("Settings");
    expect(h.sessionTitles).toHaveBeenLastCalledWith(
      "s1",
      "synthetic background",
    );
    h.controller.selectSettings("Configurações");
    h.controller.syncSessionTitle("s1");
    expect(h.window.setTitle).toHaveBeenLastCalledWith("Configurações");
    // Settings hides the session, so its attention stays pending.
    expect(h.attention.mock.calls).toEqual([["s1", true]]);
    h.controller.selectSession("s1");
    expect(h.attention.mock.calls).toEqual([
      ["s1", true],
      ["s1", false],
    ]);
    expect(h.window.setTitle).toHaveBeenLastCalledWith("synthetic background");
    h.controller.selectSettings("Settings");
    h.controller.selectSession(null);
    expect(h.window.setTitle).toHaveBeenLastCalledWith("OMXTerm");
    h.controller.dispose();
  });
  it("publishes exactly the native sanitized selected title and fallback to app-drawn chrome", () => {
    const harness = createControllerHarness();
    harness.controller.sessionStarted("s1");
    harness.controller.selectSession("s1");
    harness.controller.requestTitle("s1", "before\n\u202eafter");
    expect(harness.chromeTitle).toHaveBeenLastCalledWith("beforeafter");
    harness.controller.ringBell("s1");
    // Attention is a State Mark now; the title itself stays the program's.
    expect(harness.chromeTitle).toHaveBeenLastCalledWith("beforeafter");
    harness.controller.resetAttention();
    harness.controller.requestTitle("s1", "x".repeat(257));
    expect(harness.chromeTitle).toHaveBeenLastCalledWith("example-shell");
    harness.controller.sessionEnded("s1");
    expect(harness.chromeTitle).toHaveBeenLastCalledWith("OMXTerm");
    expect(harness.chromeTitle.mock.calls).toEqual(
      harness.window.setTitle.mock.calls,
    );
    harness.controller.dispose();
    harness.chromeTitle.mockClear();
    harness.controller.requestTitle("s1", "late");
    expect(harness.chromeTitle).not.toHaveBeenCalled();
  });

  it("removes all C0, C1, DEL, and Bidi_Control characters", () => {
    const controls = [
      ...Array.from({ length: 0x20 }, (_, value) => value),
      0x7f,
      ...Array.from({ length: 0x20 }, (_, value) => value + 0x80),
      ...BIDI_CONTROL_CODE_POINTS,
    ]
      .map((codePoint) => String.fromCodePoint(codePoint))
      .join("");

    expect(sanitizedTerminalTitle(`before${controls}after`)).toBe(
      "beforeafter",
    );
  });

  it("counts original Unicode code points before sanitization", () => {
    const accepted = "🙂".repeat(MAX_TERMINAL_TITLE_CODE_POINTS);
    const rejected = `${accepted}‮`;

    expect([...accepted]).toHaveLength(256);
    expect(sanitizedTerminalTitle(accepted)).toBe(accepted);
    expect(sanitizedTerminalTitle(rejected)).toBeUndefined();
    expect(sanitizedTerminalTitle(`${accepted}🙂`)).toBeUndefined();
  });

  it("preserves Private Use glyphs while rejecting other invalid Unicode categories", () => {
    const nerdFontFolder = " projects";

    expect(sanitizedTerminalTitle(nerdFontFolder)).toBe(nerdFontFolder);
    expect(sanitizedTerminalTitle("valid͸")).toBeUndefined();
    expect(sanitizedTerminalTitle("valid\ud800")).toBeUndefined();
    expect(sanitizedTerminalTitle("valid​")).toBeUndefined();
    expect(sanitizedTerminalTitle("valid ")).toBeUndefined();
  });

  it("mirrors the selected session on the window and falls back per session and per window", () => {
    const harness = createControllerHarness(true);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");

    harness.controller.requestTitle("s1", "first title");
    harness.controller.requestTitle("s2", "second title");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("first title");

    harness.controller.selectSession("s2");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("second title");

    harness.controller.requestTitle("s2", "");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("example-shell");

    harness.controller.sessionEnded("s2");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("OMXTerm");
    expect(harness.sessionTitles.mock.calls).toEqual([
      ["s1", "example-shell"],
      ["s2", "example-shell"],
      ["s1", "first title"],
      ["s2", "second title"],
      ["s2", "example-shell"],
    ]);
  });

  it("keeps the shell fallback selected when each session starts", () => {
    const harness = createControllerHarness(true);
    harness.controller.sessionStarted("s1", "powershell.exe");
    harness.controller.sessionStarted("s2", "bash.exe");
    harness.controller.selectSession("s1");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("powershell.exe");

    harness.controller.selectSession("s2");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("bash.exe");
    expect(harness.sessionTitles.mock.calls).toEqual([
      ["s1", "powershell.exe"],
      ["s2", "bash.exe"],
    ]);
  });

  it("keeps one session's hostile title from ever reaching another session or the window", () => {
    const harness = createControllerHarness(true);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");
    harness.controller.requestTitle("s1", "safe");

    harness.controller.requestTitle("s2", "CANARY\u2028");
    harness.controller.requestTitle("s2", `CANARY${"x".repeat(256)}`);
    harness.controller.requestTitle("s2", "CANARY​");
    harness.controller.requestTitle("s9", "unknown session CANARY");

    expect(harness.window.setTitle).toHaveBeenLastCalledWith("safe");
    expect(JSON.stringify(harness.window.setTitle.mock.calls)).not.toContain(
      "CANARY",
    );
    expect(JSON.stringify(harness.sessionTitles.mock.calls)).not.toContain(
      "CANARY",
    );
    expect(harness.rejected.mock.calls).toEqual([
      ["invalid-characters"],
      ["too-long"],
      ["invalid-characters"],
    ]);
    expect(JSON.stringify(harness.rejected.mock.calls)).not.toContain("CANARY");
  });

  it("marks every attention, selected or not, and reserves native attention for what is out of sight", () => {
    const harness = createControllerHarness(true);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");

    // The focused pane of a focused window is marked too, but nothing native.
    harness.controller.ringBell("s1");
    expect(harness.attention.mock.calls).toEqual([["s1", true]]);
    expect(harness.dock).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();

    // Typing in the selected pane acknowledges its own attention.
    harness.controller.resetAttention();
    expect(harness.attention).toHaveBeenLastCalledWith("s1", false);

    // Another pane of the selected tab is on screen: marked, no notification.
    harness.controller.ringBell("s2", true);
    expect(harness.attention).toHaveBeenLastCalledWith("s2", true);
    expect(harness.notify).not.toHaveBeenCalled();
    harness.controller.resetAttention();
    expect(harness.attention).toHaveBeenLastCalledWith("s2", true);

    // A background tab gets a notification, titled by its session.
    harness.controller.requestTitle("s2", "agent");
    harness.controller.notify("s2", { title: "", body: "Done" });
    expect(harness.notify).toHaveBeenLastCalledWith("s2", {
      title: "agent",
      body: "Done",
    });
    harness.controller.notify("s2", { title: "Claude Code", body: "Waiting" });
    expect(harness.notify).toHaveBeenLastCalledWith("s2", {
      title: "Claude Code",
      body: "Waiting",
    });
    expect(harness.dock).not.toHaveBeenCalled();

    harness.controller.selectSession("s2");
    expect(harness.attention).toHaveBeenLastCalledWith("s2", false);
    expect(harness.clearNotification).toHaveBeenLastCalledWith("s2");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("agent");
  });

  it("keeps startup bells to the mark until the window is first focused", () => {
    const harness = createControllerHarness(false);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");

    // tmux replays pending bells on attach, before the window has focus.
    harness.controller.ringBell("s1");
    harness.controller.ringBell("s2");
    expect(harness.attention).toHaveBeenCalledWith("s2", true);
    expect(harness.dock).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();

    // A program's own notification still gets through.
    harness.controller.notify("s2", { title: "", body: "Done" });
    expect(harness.notify).toHaveBeenCalledOnce();
    expect(harness.dock).toHaveBeenCalledOnce();
    harness.dock.mockClear();
    harness.notify.mockClear();

    // After the user has had the window, a background bell notifies again.
    harness.focus();
    harness.controller.ringBell("s2", false);
    expect(harness.notify).toHaveBeenCalledOnce();
    harness.unfocus();
    harness.controller.ringBell("s1");
    expect(harness.dock).toHaveBeenCalledOnce();
  });

  it("requests native attention once for an unfocused window until focus clears it", () => {
    const harness = createControllerHarness(false);
    harness.focus();
    harness.unfocus();
    harness.controller.sessionStarted("s1");
    harness.controller.selectSession("s1");
    harness.controller.requestTitle("s1", "remote job");

    harness.controller.ringBell("s1");
    harness.controller.ringBell("s1");
    expect(harness.dock).toHaveBeenCalledOnce();
    expect(harness.attention.mock.calls).toEqual([["s1", true]]);
    // An unfocused window notifies even for its selected pane.
    expect(harness.notify).toHaveBeenLastCalledWith("s1", {
      title: "remote job",
      body: "Rang the bell.",
    });

    harness.focus();
    expect(harness.attention).toHaveBeenLastCalledWith("s1", false);
    expect(harness.clearNotification).toHaveBeenCalledExactlyOnceWith("s1");

    harness.unfocus();
    harness.controller.ringBell("s1");
    expect(harness.dock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unselected pane's attention through selected-pane interaction", () => {
    const harness = createControllerHarness(false);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");

    harness.controller.ringBell("s2");
    // Interaction happens in the selected pane; the other mark stays.
    harness.controller.resetAttention();
    expect(harness.attention.mock.calls).toEqual([["s2", true]]);

    harness.focus();
    harness.controller.selectSession("s2");
    expect(harness.attention).toHaveBeenLastCalledWith("s2", false);

    // An ended session takes its notification with it.
    harness.controller.ringBell("s1");
    harness.controller.sessionEnded("s1");
    expect(harness.clearNotification).toHaveBeenLastCalledWith("s1");
  });

  it("ignores late title and bell events after its Terminal Window closes", () => {
    const harness = createControllerHarness(false);
    harness.controller.sessionStarted("s1");
    harness.controller.selectSession("s1");
    harness.sessionTitles.mockClear();
    harness.window.setTitle.mockClear();

    harness.controller.dispose();
    harness.controller.requestTitle("s1", "late private title");
    harness.controller.ringBell("s1");
    harness.focus();

    expect(harness.sessionTitles).not.toHaveBeenCalled();
    expect(harness.window.setTitle).not.toHaveBeenCalled();
    expect(harness.dock).not.toHaveBeenCalled();
  });
});
