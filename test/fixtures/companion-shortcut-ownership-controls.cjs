// Test only: inject in-memory OS/filesystem adapters; never post native input.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function fixture({
  releaseFails = false,
  deliveryFails = false,
  receiptFails = false,
  phaseFails = false,
  mapping = {
    F6: { code: 72, keysym: 0xffc3 },
    F7: { code: 73, keysym: 0xffc4 },
  },
  extraModifier,
} = {}) {
  const files = new Map(),
    calls = [],
    phases = [];
  let actual = "prior";
  const keys = {
    Control_L: false,
    Control_R: false,
    Shift_L: false,
    Shift_R: false,
    Alt_L: false,
    Alt_R: false,
    Super_L: false,
    Super_R: false,
    F6: false,
    F7: false,
    Escape: false,
    x: false,
  };
  const observer = {
    events: [],
    created: [],
    phase(value) {
      phases.push(value);
      if (phaseFails && value === "idle") throw Error("phase reset failed");
    },
  };
  const fakeFs = {
    writeFileSync(p, text, options) {
      if (options?.flag === "wx" && files.has(p)) throw Error("EEXIST");
      if (receiptFails && /shortcut-\d+-/.test(p))
        throw Error("receipt write failed");
      files.set(p, text);
    },
    unlinkSync(p) {
      assert.ok(files.delete(p));
    },
  };
  const execFileSync = (exe, args) => {
    calls.push({ exe, args });
    if (exe === "/usr/bin/python3")
      return JSON.stringify({ keys, functionKeys: mapping });
    assert.equal(exe, "/usr/bin/xdotool");
    const [op, injected] = args;
    const key = { 72: "F6", 73: "F7" }[injected] || injected;
    if (releaseFails && key === "F6" && op === "keyup")
      throw Error("simulated release failure");
    keys[key] = op === "keydown";
    if (op === "keydown")
      observer.events.push({
        key,
        type: "keyDown",
        repeat: false,
        control: keys.Control_L,
        shift: keys.Shift_L,
        alt: extraModifier === "alt",
        meta: extraModifier === "meta",
      });
    if (key === "x" && op === "keydown") actual += "x";
    return "";
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "companion-shortcut-input.cjs"),
      "utf8",
    ),
    {
      module,
      queueMicrotask,
      require(name) {
        if (name === "node:fs") return fakeFs;
        if (name === "node:child_process") return { execFileSync };
        return require(name);
      },
    },
  );
  const transcript = module.exports.createTranscript(() => actual);
  const input = module.exports.createInput({
    evidence: "/in-memory",
    observer,
    core: { id: 1 },
    transcript,
    readInput: () => actual,
    until: async (check) => {
      if (deliveryFails || !check()) throw Error("simulated delivery timeout");
    },
  });
  return {
    input,
    files,
    calls,
    keys,
    phases,
    transcript,
    append: (bytes) => {
      actual += bytes;
    },
  };
}
test("actual input fence cannot accept a delayed append as its next baseline", async () => {
  const f = fixture();
  f.append("leak");
  await assert.rejects(
    f.input.fence("delayed"),
    /continuous expected raw transcript/,
  );
  assert.equal(f.transcript.expected(), "prior");
  assert.equal(f.calls.filter((c) => c.exe.endsWith("xdotool")).length, 0);
});
test("delivery, cleanup and receipt errors all survive with phase reset attempted", async () => {
  const f = fixture({
    deliveryFails: true,
    receiptFails: true,
    phaseFails: true,
  });
  await assert.rejects(f.input.tap("F6", "test"), (error) => {
    const text = error.errors.map(String).join("\n");
    assert.match(text, /simulated delivery timeout/);
    assert.match(text, /phase reset failed/);
    assert.match(text, /receipt write failed/);
    return true;
  });
  assert.equal(f.phases.at(-1), "idle");
  assert.ok(Object.values(f.keys).every((v) => !v));
});
test("phase cleanup failure does not prevent receipt persistence", async () => {
  const f = fixture({ phaseFails: true });
  await assert.rejects(f.input.tap("F6", "test"));
  assert.ok([...f.files.keys()].some((p) => /shortcut-\d+-/.test(p)));
});
for (const [key, code] of [
  ["F6", "72"],
  ["F7", "73"],
])
  test(`literal numeric ${key} argv and all owned keys released on successful tap`, async () => {
    const f = fixture();
    await f.input.tap(key, "test");
    assert.ok(Object.values(f.keys).every((v) => !v));
    assert.equal(f.files.has(f.input.marker), false);
    assert.deepEqual(
      f.calls
        .filter((c) => c.exe.endsWith("xdotool"))
        .map((c) => Array.from(c.args)),
      [
        ["keydown", "Control_L"],
        ["keydown", "Shift_L"],
        ["keydown", code],
        ["keyup", code],
        ["keyup", "Shift_L"],
        ["keyup", "Control_L"],
      ],
    );
  });
test("Control+Escape posts no Shift and releases both owned keys", async () => {
  const f = fixture();
  await f.input.tap("Escape", "test-escape", true, ["Control_L"]);
  assert.ok(Object.values(f.keys).every((v) => !v));
  assert.deepEqual(
    f.calls
      .filter((c) => c.exe.endsWith("xdotool"))
      .map((c) => Array.from(c.args)),
    [
      ["keydown", "Control_L"],
      ["keydown", "Escape"],
      ["keyup", "Escape"],
      ["keyup", "Control_L"],
    ],
  );
});
test("delivery failure remains failure but settled OS keys remove marker", async () => {
  const f = fixture({ deliveryFails: true });
  await assert.rejects(f.input.tap("F6", "test"));
  assert.ok(Object.values(f.keys).every((v) => !v));
  assert.equal(f.files.has(f.input.marker), false);
  const receipt = JSON.parse([...f.files.values()][0]);
  assert.ok(receipt.failures.length);
});
test("failed OS release retains marker, finally releases other owned modifiers", async () => {
  const f = fixture({ releaseFails: true });
  await assert.rejects(f.input.tap("F6", "test"));
  assert.equal(f.keys.F6, true);
  assert.equal(f.keys.Shift_L, false);
  assert.equal(f.keys.Control_L, false);
  assert.equal(f.files.has(f.input.marker), true);
});
for (const [key, code, keysym] of [
  ["F6", 71, 0xffc3],
  ["F7", 74, 0xffc4],
  ["F6", 72, 0xffe9],
  ["F7", 73, 0xffe9],
])
  test(`refuses incorrect assigned ${key} mapping ${code}/${keysym} before input`, async () => {
    const mapping = {
      F6: { code: 72, keysym: 0xffc3 },
      F7: { code: 73, keysym: 0xffc4 },
    };
    mapping[key] = { code, keysym };
    const f = fixture({ mapping });
    await assert.rejects(f.input.tap(key, "wrong-mapping"), /X11/);
    assert.equal(f.calls.filter((c) => c.exe.endsWith("xdotool")).length, 0);
    assert.equal(f.files.size, 0);
  });
for (const extraModifier of ["alt", "meta"])
  test(`rejects unrequested ${extraModifier} at native tap and held delivery with owned cleanup`, async () => {
    for (const held of [false, true]) {
      const f = fixture({ extraModifier });
      let settled = false;
      const operation = held
        ? f.input.heldClose({
            key: "F6",
            label: "wrong-modifier",
            child: { id: 2 },
            settled: async () => {
              settled = true;
            },
          })
        : f.input.tap("F6", "wrong-modifier");
      await assert.rejects(operation, /unrequested/);
      assert.equal(settled, false);
      assert.ok(Object.values(f.keys).every((v) => !v));
      assert.equal(f.files.has(f.input.marker), false);
      const posted = f.calls.filter((c) => c.exe.endsWith("xdotool"));
      assert.ok(
        posted.every(
          (c) =>
            ![
              "Alt_L",
              "Alt_R",
              "Super_L",
              "Super_R",
              "F6",
              "F7",
              "--clearmodifiers",
            ].some((key) => c.args.includes(key)),
        ),
      );
    }
  });
test("preexisting key state refuses without sending input", async () => {
  const f = fixture();
  f.keys.Control_L = true;
  await assert.rejects(f.input.tap("F6", "test"));
  assert.equal(f.calls.filter((c) => c.exe.endsWith("xdotool")).length, 0);
});
test("existing unresolved marker refuses without sending input", async () => {
  const f = fixture();
  f.files.set(f.input.marker, "earlier unresolved owner");
  await assert.rejects(f.input.tap("F6", "test"));
  assert.equal(f.calls.filter((c) => c.exe.endsWith("xdotool")).length, 0);
  assert.equal(f.files.get(f.input.marker), "earlier unresolved owner");
});
