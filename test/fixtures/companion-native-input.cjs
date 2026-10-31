// Linux assigned-display XTEST only. No physical keyboard claim.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
function keyHeld(key) {
  assert.ok(key === "Escape" || key === "Enter");
  const state = execFileSync(
    "/usr/bin/python3",
    [
      "-I",
      "-c",
      `import ctypes, sys
x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XKeysymToKeycode.restype = ctypes.c_ubyte
x.XQueryKeymap.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
if not d: raise SystemExit('Cannot open X display')
code = x.XKeysymToKeycode(d, int(sys.argv[1]))
keys = (ctypes.c_ubyte * 32)()
status = x.XQueryKeymap(d, keys)
x.XCloseDisplay(d)
if status != 1: raise SystemExit('XQueryKeymap failed')
if not code: raise SystemExit('Keycode unavailable')
print('held' if keys[code // 8] & (1 << (code % 8)) else 'up')`,
      String(key === "Escape" ? 0xff1b : 0xff0d),
    ],
    { encoding: "utf8", timeout: 3000 },
  ).trim();
  assert.ok(state === "held" || state === "up", "XQueryKeymap receipt");
  return state === "held";
}
function assertGesture(events, key, target) {
  assert.ok(
    events.some(
      (e) =>
        e.target === target &&
        e.key === key &&
        e.type === "keyDown" &&
        !e.repeat,
    ),
    "initial native input admitted at intended owner",
  );
  assert.ok(
    events.some(
      (e) =>
        e.target === "core" &&
        e.key === key &&
        e.type === "keyDown" &&
        e.repeat,
    ),
    "held repeat reached core",
  );
  // Child Escape is consumed in main. Header Enter is consumed by renderer
  // capture (stopImmediatePropagation), so its oracle is the exact raw-client
  // fence below, not main's defaultPrevented flag.
  if (target === "child")
    assert.ok(
      events
        .filter(
          (e) =>
            e.target === "core" &&
            e.key === key &&
            (e.repeat || e.type === "keyUp"),
        )
        .every((e) => e.prevented),
      "no delivered repeat/release escapes isolation",
    );
}
function assertInputReceipt(before, actual, key) {
  assert.equal(
    actual,
    before + (key === "Enter" ? "\r" : "\u001b") + "x",
    "exact held-gesture isolation and fresh control",
  );
}
async function heldGesture({
  core,
  child,
  key,
  target,
  until,
  settled,
  readInput,
  evidence,
  label,
}) {
  const events = [];
  const observe = (target) => (event, input) => {
    const record = {
      target,
      type: input.type,
      key: input.key,
      repeat: input.isAutoRepeat,
      prevented: false,
    };
    events.push(record);
    queueMicrotask(() => {
      record.prevented = event.defaultPrevented;
    });
  };
  const onCore = observe("core"),
    onChild = observe("child");
  core.on("before-input-event", onCore);
  child.on("before-input-event", onChild);
  const marker = path.join(evidence, "input-ownership.json");
  const osKey = key === "Enter" ? "Return" : "Escape";
  const send = (...args) =>
    execFileSync("/usr/bin/xdotool", args, { timeout: 3000 });
  const before = readInput();
  assert.equal(fs.existsSync(marker), false, "unresolved native key ownership");
  try {
    assert.equal(keyHeld(key), false, "key initially released");
    fs.writeFileSync(marker, JSON.stringify({ label, key }));
    try {
      send("keydown", osKey);
      assert.equal(keyHeld(key), true, "OS key held");
      await settled();
      await until(
        () =>
          events.some((e) => e.target === "core" && e.key === key && e.repeat),
        "native repeat after focus transfer",
      );
    } finally {
      send("keyup", osKey);
      assert.equal(keyHeld(key), false, "OS release observed");
      fs.unlinkSync(marker);
    }
    assertGesture(events, key, target);
    // Same-key fresh control plus ordered printable fence reaches the raw client.
    // Unlike a timer, exact bytes detect leaked repeats AND swallowed fresh input.
    send("key", osKey);
    send("key", "x");
    const expected = before + (key === "Enter" ? "\r" : "\u001b") + "x";
    await until(
      () => readInput().length >= expected.length,
      "fresh native key and raw-client fence",
    );
    assertInputReceipt(before, readInput(), key);
  } finally {
    core.removeListener("before-input-event", onCore);
    child.removeListener("before-input-event", onChild);
    fs.writeFileSync(
      path.join(evidence, `${label}-keys.json`),
      JSON.stringify({ events, input: readInput(), before }, null, 2),
    );
  }
}
module.exports = { heldGesture, assertGesture, assertInputReceipt };
