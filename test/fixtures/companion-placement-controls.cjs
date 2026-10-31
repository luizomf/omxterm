// Headless contract and literal-input failure controls. No Electron/X11 launch.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  GROUPS,
  projectedBounds,
  assertMove,
  assertSaved,
  assertComplete,
} = require("./companion-placement-contract.cjs");
const snapshot = (x) => ({
  slot: { x, y: 60, width: 260, height: 600 },
  bounds: { x, y: 60, width: 260, height: 600 },
  size: [1100, 760],
  zoom: 1,
  identity: {
    childId: 4,
    childFocused: true,
    coreFocused: false,
    fieldFocused: true,
    sameField: true,
    value: "draft",
    start: 1,
    end: 3,
    sameSurface: true,
  },
});
test("x-only oracle accepts either direction", () => {
  assertMove(snapshot(820), snapshot(10));
  assertMove(snapshot(10), snapshot(820));
});
for (const key of [
  "childId",
  "childFocused",
  "fieldFocused",
  "sameField",
  "value",
  "start",
  "end",
  "sameSurface",
]) {
  test("x-only rejects changed " + key, () => {
    const after = snapshot(10);
    after.identity[key] = "changed";
    assert.throws(() => assertMove(snapshot(820), after));
  });
}
test("x-only rejects stale native x, width-only and window resize", () => {
  const after = snapshot(10);
  after.bounds.x = 820;
  assert.throws(() => assertMove(snapshot(820), after));
  assert.throws(() => assertMove(snapshot(10), snapshot(10)));
  after.bounds.x = 10;
  after.size[0]++;
  assert.throws(() => assertMove(snapshot(820), after));
});
test("zoom oracle clips chrome and content with independent rounding", () => {
  assert.deepEqual(
    projectedBounds(
      { x: 1.1, y: 10, width: 100, height: 100 },
      1.25,
      [110, 120],
    ),
    { x: 2, y: 34, width: 108, height: 86 },
  );
});
test("Settings preserves unrelated fields and writes exact side", () => {
  const before = { version: 1, window: { blur: false }, language: "en-US" };
  const after = {
    ...before,
    window: { ...before.window, auxiliaryPanelSide: "left" },
  };
  assertSaved(before, after, "left");
  assert.throws(() => assertSaved(before, after, "right"));
  assert.throws(() =>
    assertSaved(before, { ...after, language: "pt-BR" }, "left"),
  );
  assert.throws(() =>
    assertSaved(
      before,
      { ...after, window: { ...after.window, width: 280 } },
      "left",
    ),
  );
});
test("complete receipt requires every named group, in order", () => {
  const rows = GROUPS.map((group) => ({ group, passed: true }));
  assertComplete(rows);
  assert.throws(() => assertComplete(rows.slice(1)));
  assert.throws(() => assertComplete([...rows].reverse()));
  assert.throws(() =>
    assertComplete(rows.map((r) => ({ ...r, passed: false }))),
  );
});
function inputHarness(failOperation) {
  let mask = 0,
    held = false,
    marker = false;
  const calls = [];
  const module = { exports: {} };
  const source = fs.readFileSync(
    require.resolve("./companion-placement-input.cjs"),
    "utf8",
  );
  vm.runInNewContext(source, {
    module,
    process: {
      platform: "linux",
      env: {
        DISPLAY: ":99",
        XAUTHORITY: "/private/auth",
        SECRET: "not inherited",
      },
    },
    require(name) {
      if (name === "node:fs")
        return {
          existsSync: () => marker,
          writeFileSync: () => {
            marker = true;
          },
          unlinkSync: () => {
            marker = false;
          },
        };
      if (name === "node:child_process")
        return {
          execFileSync(exe, args, options) {
            assert.equal(options.env.DISPLAY, ":99");
            assert.equal(options.env.XAUTHORITY, "/private/auth");
            assert.equal(options.env.SECRET, undefined);
            assert.equal(options.timeout, 3000);
            if (exe === "/usr/bin/python3") {
              assert.equal(args[0], "-I");
              assert.match(args[2], /XQueryPointer/);
              return JSON.stringify({ mask, xHeld: held, x: 100, y: 200 });
            }
            assert.equal(exe, "/usr/bin/xdotool");
            calls.push([...args]);
            if (args[0] === failOperation)
              throw Error("injected " + failOperation);
            if (args[0] === "mousedown") mask = 256;
            if (args[0] === "mouseup") mask = 0;
            if (args[0] === "keydown") held = true;
            if (args[0] === "keyup") held = false;
            return "";
          },
        };
      return require(name);
    },
  });
  return {
    owner: module.exports.inputOwner("/evidence"),
    calls,
    marker: () => marker,
  };
}
test("XTEST literal argv, observed press/release, marker settlement", () => {
  const h = inputHarness();
  const receipt = h.owner.clickAndType({ x: 123, y: 456 });
  assert.equal(receipt.after.mask, 0);
  assert.equal(receipt.after.xHeld, false);
  assert.deepEqual(h.calls, [
    ["mousemove", "--sync", "123", "456"],
    ["mousedown", "1"],
    ["mouseup", "1"],
    ["keydown", "x"],
    ["keyup", "x"],
    ["mouseup", "1"],
  ]);
  assert.equal(h.marker(), false);
});
test("failed key injection still releases the pointer and remains a failure", () => {
  const h = inputHarness("keydown");
  assert.throws(() => h.owner.clickAndType({ x: 1, y: 2 }), /injected keydown/);
  assert.equal(h.calls.at(-1)[0], "mouseup");
  assert.equal(h.marker(), false);
});
test("failed key release independently releases pointer and retains marker", () => {
  const h = inputHarness("keyup");
  assert.throws(() => h.owner.clickAndType({ x: 1, y: 2 }), /marker retained/);
  assert.equal(h.calls.at(-1)[0], "mouseup");
  assert.equal(h.marker(), true);
});
test("failed physical button release cannot pass", () => {
  const h = inputHarness("mouseup");
  assert.throws(() => h.owner.clickAndType({ x: 1, y: 2 }), /marker retained/);
  assert.equal(h.marker(), true);
});
test("mode admission is source-only and mutually exclusive before test launch", () => {
  const source = fs.readFileSync(
    "test/integration/ssh-packaged.test.ts",
    "utf8",
  );
  const start = source.indexOf("const source = process.env.");
  const end = source.indexOf("const enabled =", start);
  assert.ok(start > 0 && end > start);
  const check = (env) =>
    vm.runInNewContext(source.slice(start, end), {
      process: { env },
      prefix: "OMXTERM_SSH_PACKAGED_",
      assert,
    });
  check({});
  check({
    OMXTERM_SSH_PACKAGED_SOURCE: "/source",
    OMXTERM_SSH_PACKAGED_PLACEMENT: "1",
  });
  assert.throws(() => check({ OMXTERM_SSH_PACKAGED_PLACEMENT: "1" }));
  assert.throws(() => check({ OMXTERM_SSH_PACKAGED_PLACEMENT: "yes" }));
  for (const name of ["COMBINED", "CATALOG", "CATALOG_SHA256", "APPEARANCE"])
    assert.throws(() =>
      check({
        OMXTERM_SSH_PACKAGED_SOURCE: "/source",
        OMXTERM_SSH_PACKAGED_PLACEMENT: "1",
        ["OMXTERM_SSH_PACKAGED_" + name]: "1",
      }),
    );
});
