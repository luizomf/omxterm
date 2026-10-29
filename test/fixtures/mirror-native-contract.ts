import assert from "node:assert/strict";

export const MIRROR_RESULT = "__MIRROR_PRODUCTION__";
export const MIRROR_CHECKS = [
  "installed-enabled-dormant",
  "three-live-ptys-fixed-pair-native-handoff",
  "encoded-keyboard-exact-once-and-source-switch",
  "hidden-chrome-core-stop",
  "paste-stops-before-local-delivery",
  "backend-loss-revokes-and-retires-with-pty-continuity",
] as const;
export const MIRROR_EXPECTED_FENCES = [
  ["a|", "a|", "|"],
  ["a|b|", "a|b|", "||"],
  ["a|b||", "a|b|c|", "|||"],
  ["a|b||paste-locald|", "a|b|c||", "||||"],
  ["a|b||paste-locald|e|", "a|b|c|||", "|||||"],
] as const;
export type MirrorReceipt = {
  failed: boolean;
  checks: string[];
  approvals: number;
  semanticStopBeforeWrite: boolean;
  quit: "joined" | "unsettled";
  ptys: { pid: number; exited: boolean }[];
  backends: { pid: number; closed: boolean }[];
  fences: { label: string; expected: string[]; received: string[] }[];
};
export function assertMirrorReceipt(
  value: unknown,
): asserts value is MirrorReceipt {
  assert.ok(value && typeof value === "object");
  const receipt = value as MirrorReceipt;
  assert.equal(receipt.failed, false);
  assert.deepEqual(receipt.checks, MIRROR_CHECKS);
  assert.equal(receipt.approvals, 1);
  assert.equal(receipt.semanticStopBeforeWrite, true);
  assert.equal(receipt.quit, "joined");
  assert.equal(receipt.ptys.length, 3);
  assert.equal(new Set(receipt.ptys.map((p) => p.pid)).size, 3);
  assert.ok(
    receipt.ptys.every(
      (p) => Number.isSafeInteger(p.pid) && p.pid > 0 && p.exited,
    ),
  );
  assert.equal(receipt.backends.length, 1);
  assert.ok(
    receipt.backends.every(
      (p) => Number.isSafeInteger(p.pid) && p.pid > 0 && p.closed,
    ),
  );
  assert.deepEqual(
    receipt.fences.map((f) => f.label),
    ["first-source", "second-source", "stopped", "paste", "retired"],
  );
  receipt.fences.forEach((fence, index) => {
    assert.deepEqual(fence.expected, MIRROR_EXPECTED_FENCES[index]);
    assert.deepEqual(fence.received, fence.expected);
  });
}
