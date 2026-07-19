import { describe, expect, it } from "vitest";
import {
  isBoundedTerminalPayload,
  isTerminalSessionExit,
  isTerminalSessionId,
  isTerminalSessionInput,
  isTerminalSessionReference,
  isTerminalSessionResize,
  isTerminalSize,
  MAX_TERMINAL_PAYLOAD_BYTES,
  splitTerminalPayload,
  requiresProtectedPaste,
} from "../../src/shared/terminal-contract";

describe("terminal IPC payload contract", () => {
  it("splits output into byte-bounded chunks without losing Unicode data", () => {
    const payload = "🙂".repeat(MAX_TERMINAL_PAYLOAD_BYTES / 2);
    const chunks = splitTerminalPayload(payload);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(payload);
    expect(chunks.every(isBoundedTerminalPayload)).toBe(true);
  });

  it("protects every Unicode Cc code point and every logical line separator", () => {
    const controls = [
      ...Array.from({ length: 32 }, (_, code) => String.fromCodePoint(code)),
      ...Array.from({ length: 33 }, (_, offset) =>
        String.fromCodePoint(0x7f + offset),
      ),
    ];
    expect(
      controls.every((control) => requiresProtectedPaste(`a${control}b`)),
    ).toBe(true);
    expect(requiresProtectedPaste("one\u2028two")).toBe(true);
    expect(requiresProtectedPaste("one\u2029two")).toBe(true);
    expect(requiresProtectedPaste("one line 🙂\u200d")).toBe(false);
  });

  it("accepts only strict, finite terminal dimensions", () => {
    expect(isTerminalSize({ cols: 80, rows: 24 })).toBe(true);
    expect(isTerminalSize({ cols: 0, rows: 24 })).toBe(false);
    expect(isTerminalSize({ cols: 80.5, rows: 24 })).toBe(false);
    expect(isTerminalSize({ cols: 80, rows: 24, extra: true })).toBe(false);
  });

  it("accepts only main-allocated Live Terminal Session id shapes", () => {
    for (const accepted of ["s1", "s9", "s42", "s999999999"])
      expect(isTerminalSessionId(accepted)).toBe(true);
    for (const rejected of [
      "",
      "s0",
      "s01",
      "s1x",
      "1",
      "S1",
      "session-1",
      " s1",
      "s1 ",
      "s1234567890",
      1,
      null,
      undefined,
      { sessionId: "s1" },
    ])
      expect(isTerminalSessionId(rejected)).toBe(false);
  });

  it("validates strict session-scoped IPC envelopes", () => {
    expect(isTerminalSessionInput({ sessionId: "s1", data: "x" })).toBe(true);
    expect(isTerminalSessionInput({ sessionId: "s1", data: "" })).toBe(false);
    expect(
      isTerminalSessionInput({
        sessionId: "s1",
        data: "x".repeat(MAX_TERMINAL_PAYLOAD_BYTES + 1),
      }),
    ).toBe(false);
    expect(isTerminalSessionInput({ sessionId: "s0", data: "x" })).toBe(false);
    expect(
      isTerminalSessionInput({ sessionId: "s1", data: "x", extra: true }),
    ).toBe(false);
    expect(isTerminalSessionInput("x")).toBe(false);

    expect(
      isTerminalSessionResize({ sessionId: "s1", cols: 80, rows: 24 }),
    ).toBe(true);
    expect(
      isTerminalSessionResize({ sessionId: "s1", cols: 0, rows: 24 }),
    ).toBe(false);
    expect(
      isTerminalSessionResize({
        sessionId: "s1",
        size: { cols: 80, rows: 24 },
      }),
    ).toBe(false);
    expect(isTerminalSessionResize({ cols: 80, rows: 24 })).toBe(false);

    expect(isTerminalSessionReference({ sessionId: "s2" })).toBe(true);
    expect(isTerminalSessionReference({})).toBe(false);
    expect(isTerminalSessionReference({ sessionId: "s2", extra: 1 })).toBe(
      false,
    );
    expect(isTerminalSessionReference("s2")).toBe(false);

    expect(
      isTerminalSessionExit({ sessionId: "s1", exitCode: 0, signal: 15 }),
    ).toBe(true);
    expect(
      isTerminalSessionExit({ sessionId: "s1", exitCode: "0", signal: 0 }),
    ).toBe(false);
    expect(isTerminalSessionExit({ exitCode: 0, signal: 0 })).toBe(false);
  });
});
