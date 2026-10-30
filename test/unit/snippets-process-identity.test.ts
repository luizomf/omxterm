import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
const source = readFileSync(
  "test/fixtures/snippets-process-identity.cjs",
  "utf8",
);
function harness(platform = "darwin") {
  const execute = vi.fn(() => "Fri Oct 30 10:00:00 2026 S+\n");
  const read = vi.fn();
  const module = {
    exports: {} as {
      identity(pid: number): unknown;
      alive(record: { pid: number; start: string }): boolean;
    },
  };
  runInNewContext(source, {
    module,
    process: { platform, env: {} },
    require(name: string) {
      if (name === "node:child_process") return { execFileSync: execute };
      assert.equal(name, "node:fs");
      return { readFileSync: read };
    },
  });
  return { ...module.exports, execute, read };
}
it("preserves Linux start-tick identity and missing-process semantics", () => {
  const h = harness("linux");
  const fields = ["S", ...Array<string>(18).fill("0"), "98765"];
  h.read.mockReturnValue(`123 (shell (name)) ${fields.join(" ")}`);
  expect(h.identity(123)).toEqual({ pid: 123, start: "98765", state: "S" });
  expect(h.read).toHaveBeenCalledWith("/proc/123/stat", "utf8");
  h.read.mockImplementation(() => {
    throw { code: "ESRCH" };
  });
  expect(h.identity(123)).toBeNull();
  expect(h.execute).not.toHaveBeenCalled();
});
it("uses bounded macOS ps start identity, not procfs or PID-only existence", () => {
  const h = harness();
  expect(h.identity(123)).toEqual({
    pid: 123,
    start: "Fri Oct 30 10:00:00 2026",
    state: "S+",
  });
  expect(h.execute).toHaveBeenCalledWith(
    "/bin/ps",
    ["-p", "123", "-o", "lstart=,stat="],
    expect.objectContaining({ timeout: 5000, env: { LC_ALL: "C" } }),
  );
  expect(h.alive({ pid: 123, start: "Fri Oct 30 10:00:01 2026" })).toBe(false);
  h.execute.mockReturnValue("Fri Oct 30 10:00:00 2026 Z+\n");
  expect(h.alive({ pid: 123, start: "Fri Oct 30 10:00:00 2026" })).toBe(false);
  expect(h.read).not.toHaveBeenCalled();
});
it("distinguishes actual absence from inspection failure and malformed output", () => {
  const h = harness();
  h.execute.mockImplementation(() => {
    throw { status: 1, stdout: "", stderr: "" };
  });
  expect(h.identity(123)).toBeNull();
  h.execute.mockImplementation(() => {
    throw { status: 1, stdout: "", stderr: "denied" };
  });
  expect(() => h.identity(123)).toThrow();
  h.execute.mockReturnValue("unreadable");
  expect(() => h.identity(123)).toThrow("Cannot parse");
  expect(() => h.identity(-1)).toThrow("Invalid PID");
});
