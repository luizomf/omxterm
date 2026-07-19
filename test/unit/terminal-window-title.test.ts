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
  const dock = vi.fn();
  const rejected = vi.fn();
  const sessionTitles = vi.fn();
  const controller = createTerminalWindowTitleController(fixture.window, {
    fallbackSessionTitle: "example-shell",
    requestDockAttention: dock,
    sendSessionTitle: sessionTitles,
    onRejected: rejected,
  });
  return { ...fixture, dock, rejected, sessionTitles, controller };
}

describe("native Terminal Title and bell attention", () => {
  it("enumerates the complete Bidi_Control set supported by the pinned runtime", () => {
    const runtimeSet: number[] = [];
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      if (/\p{Bidi_Control}/u.test(String.fromCodePoint(codePoint)))
        runtimeSet.push(codePoint);
    }
    expect(runtimeSet).toEqual(BIDI_CONTROL_CODE_POINTS);
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

  it("marks every ringing session, selected or not, and reserves the Dock for unfocused windows", () => {
    const harness = createControllerHarness(true);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");
    harness.sessionTitles.mockClear();

    // The selected tab of a focused window is marked too: silent, but visible.
    harness.controller.ringBell("s1");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s1",
      "🔔 example-shell",
    );
    expect(harness.window.setTitle).toHaveBeenLastCalledWith(
      "🔔 example-shell",
    );
    expect(harness.dock).not.toHaveBeenCalled();

    // Typing in the selected tab acknowledges its own bell.
    harness.controller.resetAttention();
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s1",
      "example-shell",
    );
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("example-shell");

    harness.controller.ringBell("s2");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s2",
      "🔔 example-shell",
    );
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("example-shell");
    expect(harness.dock).not.toHaveBeenCalled();

    harness.controller.selectSession("s2");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s2",
      "example-shell",
    );
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("example-shell");
  });

  it("requests Dock attention once for an unfocused window until focus clears it", () => {
    const harness = createControllerHarness(false);
    harness.controller.sessionStarted("s1");
    harness.controller.selectSession("s1");
    harness.controller.requestTitle("s1", "remote job");

    harness.controller.ringBell("s1");
    harness.controller.ringBell("s1");
    expect(harness.dock).toHaveBeenCalledOnce();
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("🔔 remote job");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s1",
      "🔔 remote job",
    );

    harness.focus();
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("remote job");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith("s1", "remote job");

    harness.unfocus();
    harness.controller.ringBell("s1");
    expect(harness.dock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unselected tab's marker through selected-tab interaction and composes over titles", () => {
    const harness = createControllerHarness(false);
    harness.controller.sessionStarted("s1");
    harness.controller.sessionStarted("s2");
    harness.controller.selectSession("s1");
    harness.controller.requestTitle("s2", "🔔legitimate");

    harness.controller.ringBell("s2");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s2",
      "🔔 🔔legitimate",
    );

    // Interaction happens in the selected tab; the other marker stays.
    harness.controller.resetAttention();
    expect(harness.sessionTitles).toHaveBeenLastCalledWith(
      "s2",
      "🔔 🔔legitimate",
    );

    harness.controller.requestTitle("s2", "latest");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith("s2", "🔔 latest");

    harness.focus();
    harness.controller.selectSession("s2");
    expect(harness.sessionTitles).toHaveBeenLastCalledWith("s2", "latest");
    expect(harness.window.setTitle).toHaveBeenLastCalledWith("latest");
  });

  it("keeps title and attention state isolated per owning window", () => {
    const first = createControllerHarness(false);
    const second = createControllerHarness(false);
    first.controller.sessionStarted("s1");
    first.controller.selectSession("s1");
    second.controller.sessionStarted("s1");
    second.controller.selectSession("s1");

    first.controller.requestTitle("s1", "first");
    first.controller.ringBell("s1");
    second.controller.requestTitle("s1", "second");

    expect(first.window.setTitle).toHaveBeenLastCalledWith("🔔 first");
    expect(second.window.setTitle).toHaveBeenLastCalledWith("second");
    expect(first.dock).toHaveBeenCalledOnce();
    expect(second.dock).not.toHaveBeenCalled();
  });
});
