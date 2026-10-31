// Independent fixture oracles; no application imports or native execution.
const assert = require("node:assert/strict");
const GROUPS = [
  "settings",
  "x-only-right",
  "x-only-left",
  "resize",
  "zoom",
  "overlay",
  "shared-retention",
];
function projectedBounds(rect, zoom, size) {
  const x = Math.ceil(Math.max(0, rect.x * zoom));
  const y = Math.ceil(Math.max(34, rect.y * zoom));
  return {
    x,
    y,
    width: Math.max(
      0,
      Math.floor(Math.min(size[0], (rect.x + rect.width) * zoom)) - x,
    ),
    height: Math.max(
      0,
      Math.floor(Math.min(size[1], (rect.y + rect.height) * zoom)) - y,
    ),
  };
}
function assertMove(before, after) {
  assert.deepEqual(
    before.bounds,
    projectedBounds(before.slot, before.zoom, before.size),
    "baseline native allocation",
  );
  assert.equal(after.zoom, before.zoom, "unchanged zoom for x-only move");
  assert.equal(before.identity.sameField, true);
  assert.equal(before.identity.sameSurface, true);
  assert.notEqual(after.slot.x, before.slot.x, "position changed");
  for (const key of ["y", "width", "height"])
    assert.equal(after.slot[key], before.slot[key], "x-only slot " + key);
  assert.deepEqual(after.size, before.size, "unchanged content size");
  assert.deepEqual(
    after.bounds,
    projectedBounds(after.slot, after.zoom, after.size),
    "actual native allocation follows DOM",
  );
  assert.deepEqual(
    after.identity,
    before.identity,
    "same native view, DOM field, draft, caret, focus and Surface",
  );
  assert.equal(
    after.identity.childFocused,
    true,
    "child focused before corrective input",
  );
  assert.equal(after.identity.coreFocused, false);
  assert.equal(after.identity.fieldFocused, true);
}
function assertSaved(before, after, side) {
  assert.equal(after.window.auxiliaryPanelSide, side);
  const withoutSide = (value) => {
    const copy = JSON.parse(JSON.stringify(value));
    delete copy.window.auxiliaryPanelSide;
    return copy;
  };
  assert.deepEqual(
    withoutSide(after),
    withoutSide(before),
    "only side persisted",
  );
}
function assertComplete(results) {
  assert.deepEqual(
    results.map((r) => r.group),
    GROUPS,
  );
  assert.ok(results.every((r) => r.passed === true));
}
module.exports = {
  GROUPS,
  projectedBounds,
  assertMove,
  assertSaved,
  assertComplete,
};
