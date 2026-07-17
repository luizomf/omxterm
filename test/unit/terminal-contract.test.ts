import { describe, expect, it } from "vitest";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  MAX_TERMINAL_PAYLOAD_BYTES,
  splitTerminalPayload,
} from "../../src/shared/terminal-contract";

describe("terminal IPC payload contract", () => {
  it("splits output into byte-bounded chunks without losing Unicode data", () => {
    const payload = "🙂".repeat(MAX_TERMINAL_PAYLOAD_BYTES / 2);
    const chunks = splitTerminalPayload(payload);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(payload);
    expect(chunks.every(isBoundedTerminalPayload)).toBe(true);
  });

  it("accepts only strict, finite terminal dimensions", () => {
    expect(isTerminalSize({ cols: 80, rows: 24 })).toBe(true);
    expect(isTerminalSize({ cols: 0, rows: 24 })).toBe(false);
    expect(isTerminalSize({ cols: 80.5, rows: 24 })).toBe(false);
    expect(isTerminalSize({ cols: 80, rows: 24, extra: true })).toBe(false);
  });
});
