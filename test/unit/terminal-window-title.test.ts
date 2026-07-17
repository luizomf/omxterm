import { describe, expect, it, vi } from "vitest";
import {
  createTerminalWindowTitleController,
  DEFAULT_TERMINAL_TITLE,
  MAX_TERMINAL_TITLE_CODE_POINTS,
  safeTerminalBaseTitle,
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
  };
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

    expect(safeTerminalBaseTitle(`before${controls}after`)).toBe("beforeafter");
  });

  it("counts original Unicode code points before sanitization", () => {
    const accepted = "🙂".repeat(MAX_TERMINAL_TITLE_CODE_POINTS);
    const rejected = `${accepted}\u202e`;

    expect([...accepted]).toHaveLength(256);
    expect(safeTerminalBaseTitle(accepted)).toBe(accepted);
    expect(safeTerminalBaseTitle(rejected)).toBe(DEFAULT_TERMINAL_TITLE);
    expect(safeTerminalBaseTitle(`${accepted}🙂`)).toBe(DEFAULT_TERMINAL_TITLE);
  });

  it("falls back without exposing empty, non-printable, invalid, or oversized canary payloads", () => {
    const fixture = createWindow();
    const dock = vi.fn();
    const rejected = vi.fn();
    const controller = createTerminalWindowTitleController(
      fixture.window,
      dock,
      rejected,
    );

    controller.requestTitle("valid");
    controller.requestTitle("");
    controller.requestTitle("CANARY\u200b");
    controller.requestTitle("CANARY\u2028");
    controller.requestTitle("CANARY\ud800");
    controller.requestTitle(`CANARY${"x".repeat(256)}`);

    expect(fixture.window.setTitle.mock.calls).toEqual([
      ["OMXTerm"],
      ["valid"],
      ["OMXTerm"],
      ["OMXTerm"],
      ["OMXTerm"],
      ["OMXTerm"],
      ["OMXTerm"],
    ]);
    expect(JSON.stringify(fixture.window.setTitle.mock.calls)).not.toContain(
      "CANARY",
    );
    expect(rejected.mock.calls).toEqual([
      ["invalid-characters"],
      ["invalid-characters"],
      ["invalid-characters"],
      ["too-long"],
    ]);
    expect(JSON.stringify(rejected.mock.calls)).not.toContain("CANARY");
  });

  it("preserves Private Use glyphs while rejecting other invalid Unicode categories", () => {
    const nerdFontFolder = "\uf07b projects";

    expect(safeTerminalBaseTitle(nerdFontFolder)).toBe(nerdFontFolder);
    expect(safeTerminalBaseTitle("valid\u0378")).toBe(DEFAULT_TERMINAL_TITLE);
    expect(safeTerminalBaseTitle("valid\ud800")).toBe(DEFAULT_TERMINAL_TITLE);
    expect(safeTerminalBaseTitle("valid\u200b")).toBe(DEFAULT_TERMINAL_TITLE);
    expect(safeTerminalBaseTitle("valid\u2028")).toBe(DEFAULT_TERMINAL_TITLE);
  });

  it("keeps focused BEL silent and deduplicates unfocused Dock attention", () => {
    const focusedFixture = createWindow(true);
    const focusedDock = vi.fn();
    const focused = createTerminalWindowTitleController(
      focusedFixture.window,
      focusedDock,
    );
    focused.ringBell();
    expect(focusedFixture.window.setTitle).toHaveBeenLastCalledWith("OMXTerm");
    expect(focusedDock).not.toHaveBeenCalled();

    const fixture = createWindow(false);
    const dock = vi.fn();
    const controller = createTerminalWindowTitleController(
      fixture.window,
      dock,
    );
    controller.ringBell();
    controller.ringBell();

    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("🔔OMXTerm");
    expect(dock).toHaveBeenCalledOnce();
  });

  it("composes the app marker over the latest base title until reset", () => {
    const fixture = createWindow(false);
    const dock = vi.fn();
    const controller = createTerminalWindowTitleController(
      fixture.window,
      dock,
    );

    controller.requestTitle("🔔legitimate");
    controller.ringBell();
    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("🔔🔔legitimate");
    controller.requestTitle("latest");
    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("🔔latest");
    controller.requestTitle("");
    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("🔔OMXTerm");
    controller.resetAttention();
    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("OMXTerm");

    controller.ringBell();
    expect(dock).toHaveBeenCalledTimes(2);
    fixture.focus();
    expect(fixture.window.setTitle).toHaveBeenLastCalledWith("OMXTerm");
  });

  it("keeps title and attention state isolated per owning window", () => {
    const first = createWindow(false);
    const second = createWindow(false);
    const firstController = createTerminalWindowTitleController(
      first.window,
      vi.fn(),
    );
    const secondController = createTerminalWindowTitleController(
      second.window,
      vi.fn(),
    );

    firstController.requestTitle("first");
    firstController.ringBell();
    secondController.requestTitle("second");

    expect(first.window.setTitle).toHaveBeenLastCalledWith("🔔first");
    expect(second.window.setTitle).toHaveBeenLastCalledWith("second");
  });
});
