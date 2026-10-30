import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  createResttySessionDiagnostic,
  observeResttyProcess,
} from "../fixtures/restty-session-diagnostic";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function stat(start = "123", state = "S") {
  // comm can contain both spaces and closing parentheses.
  return `42 (private ) command) ${[state, "7", ...Array<string>(17).fill("0"), start].join(" ")}`;
}
function linux() {
  vi.stubGlobal("process", { ...process, platform: "linux" });
}

it("retains birth ticks and reads only numeric proc metadata at capture", () => {
  linux();
  vi.mocked(readFileSync).mockReturnValue(stat());
  const probe = createResttySessionDiagnostic(42);
  expect(readFileSync).toHaveBeenCalledTimes(1);
  const deliver = vi.fn();
  probe.close(deliver);
  expect(deliver).toHaveBeenCalledOnce();
  expect(readFileSync).toHaveBeenCalledTimes(1);
  vi.mocked(readFileSync).mockReturnValue(stat("123", "Z"));
  expect(probe.snapshot()).toEqual({
    pid: 42,
    closeCalls: 1,
    closeReturns: 1,
    closeThrows: 0,
    birth: { status: "observed", startTicks: "123", state: "S", parentPid: 7 },
    current: {
      status: "observed",
      startTicks: "123",
      state: "Z",
      parentPid: 7,
    },
    identity: "same",
  });
  expect(readFileSync).toHaveBeenLastCalledWith("/proc/42/stat", "utf8");
});

it("does not attribute a reused PID to the retained child", () => {
  linux();
  vi.mocked(readFileSync).mockReturnValue(stat());
  const probe = createResttySessionDiagnostic(42);
  vi.mocked(readFileSync).mockReturnValue(stat("456"));
  expect(probe.snapshot()).toMatchObject({
    identity: "different",
    closeCalls: 0,
  });
});

it.each([
  ["ENOENT", "absent"],
  ["EACCES", "unreadable"],
  ["EIO", "unreadable"],
])("keeps %s distinct from observed process identity", (code, status) => {
  linux();
  vi.mocked(readFileSync).mockReturnValue(stat());
  const probe = createResttySessionDiagnostic(42);
  vi.mocked(readFileSync).mockImplementation(() => {
    throw Object.assign(new Error("private path"), { code });
  });
  expect(probe.snapshot()).toMatchObject({
    identity: "unknown",
    current: { status },
  });
  expect(JSON.stringify(probe.snapshot())).not.toContain("private path");
});

it("does not infer identity if birth capture failed", () => {
  linux();
  vi.mocked(readFileSync).mockReturnValue("malformed");
  const probe = createResttySessionDiagnostic(42);
  vi.mocked(readFileSync).mockReturnValue(stat());
  expect(probe.snapshot()).toMatchObject({
    birth: { status: "unreadable" },
    identity: "unknown",
  });
});

it("reports unsupported platforms without reading procfs", () => {
  vi.stubGlobal("process", { ...process, platform: "darwin" });
  expect(observeResttyProcess(42)).toEqual({ status: "unsupported" });
  expect(readFileSync).not.toHaveBeenCalled();
});

it("records a throwing close without swallowing or labeling it successful", () => {
  const probe = createResttySessionDiagnostic(42, () => ({
    status: "unsupported",
  }));
  const failure = new Error("close failed");
  expect(() =>
    probe.close(() => {
      throw failure;
    }),
  ).toThrow(failure);
  expect(probe.snapshot()).toMatchObject({
    closeCalls: 1,
    closeReturns: 0,
    closeThrows: 1,
  });
});
