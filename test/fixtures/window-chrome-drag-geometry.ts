import assert from "node:assert/strict";

function record(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
}

function integer(value: unknown): asserts value is number {
  assert.ok(
    Number.isSafeInteger(value),
    "native geometry must contain integers",
  );
}

function snapshot(value: unknown, handle: string) {
  record(value);
  assert.equal(value.hwnd, handle, "native drag must retain the owned HWND");
  assert.ok(
    typeof value.monitor === "string" && /^-?[1-9]\d*$/.test(value.monitor),
    "native drag requires a valid monitor",
  );
  integer(value.dpi);
  assert.ok(value.dpi > 0, "native drag requires a valid DPI");
  // SW_SHOWNORMAL: neither maximized nor minimized. Flags must also be stable.
  assert.equal(value.showCmd, 1, "native drag requires restored placement");
  integer(value.flags);
  assert.ok(
    value.flags >= 0 && value.flags <= 7,
    "invalid native placement flags",
  );
  record(value.outer);
  record(value.client);
  integer(value.outer.x);
  integer(value.outer.y);
  for (const size of [value.outer, value.client]) {
    integer(size.width);
    integer(size.height);
    assert.ok(
      size.width > 0 && size.height > 0,
      "native sizes must be positive",
    );
  }
  return {
    monitor: value.monitor,
    dpi: value.dpi,
    flags: value.flags,
    outer: value.outer,
    client: value.client,
  };
}

// The receipt comes only from the owned, physical-coordinate Win32 drag helper.
// Enclosing DIP bounds can change size with position without a physical resize.
export function assertWindowsDragGeometry(receipt: string, handle: bigint) {
  const evidence: unknown = JSON.parse(receipt);
  record(evidence);
  const before = snapshot(evidence.before, handle.toString());
  const after = snapshot(evidence.after, handle.toString());
  assert.equal(
    after.monitor,
    before.monitor,
    "native drag must stay on monitor",
  );
  assert.equal(after.dpi, before.dpi, "native drag must retain DPI");
  assert.equal(
    after.flags,
    before.flags,
    "native drag must retain placement flags",
  );
  assert.ok(
    after.outer.x !== before.outer.x && after.outer.y !== before.outer.y,
    `native drag must move the physical window on both axes: ${receipt}`,
  );
  assert.equal(after.outer.width, before.outer.width, "physical window width");
  assert.equal(
    after.outer.height,
    before.outer.height,
    "physical window height",
  );
  assert.equal(
    after.client.width,
    before.client.width,
    "physical client width",
  );
  assert.equal(
    after.client.height,
    before.client.height,
    "physical client height",
  );
}
