// Assigned Linux X11 only. Unlike child.sendInputEvent, these clicks use native
// screen hit testing. No physical keyboard or pointer claim.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const QUERY = `import ctypes,json
x=ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes=[ctypes.c_char_p]; x.XOpenDisplay.restype=ctypes.c_void_p
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p]; x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XQueryPointer.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint)]
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong]; x.XKeysymToKeycode.restype=ctypes.c_ubyte
x.XQueryKeymap.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
x.XCloseDisplay.argtypes=[ctypes.c_void_p]
d=x.XOpenDisplay(None)
if not d: raise SystemExit('No assigned display')
try:
 root=ctypes.c_ulong(); child=ctypes.c_ulong(); rx=ctypes.c_int(); ry=ctypes.c_int(); wx=ctypes.c_int(); wy=ctypes.c_int(); mask=ctypes.c_uint()
 if not x.XQueryPointer(d,x.XDefaultRootWindow(d),ctypes.byref(root),ctypes.byref(child),ctypes.byref(rx),ctypes.byref(ry),ctypes.byref(wx),ctypes.byref(wy),ctypes.byref(mask)): raise SystemExit('XQueryPointer failed')
 keys=(ctypes.c_ubyte*32)(); code=x.XKeysymToKeycode(d,0x78)
 if not code or x.XQueryKeymap(d,keys)!=1: raise SystemExit('XQueryKeymap failed')
 print(json.dumps({'mask':mask.value,'xHeld':bool(keys[code//8] & (1<<(code%8))),'x':rx.value,'y':ry.value}))
finally: x.XCloseDisplay(d)
`;
function inputOwner(evidence) {
  assert.equal(process.platform, "linux");
  assert.ok(
    process.env.DISPLAY && process.env.XAUTHORITY,
    "assigned X11 lane required",
  );
  const marker = path.join(evidence, "placement-input-ownership.json");
  const env = {
    DISPLAY: process.env.DISPLAY,
    XAUTHORITY: process.env.XAUTHORITY,
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
  };
  const run = (exe, args) =>
    execFileSync(exe, args, {
      env,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const send = (...args) => run("/usr/bin/xdotool", args);
  const state = () => JSON.parse(run("/usr/bin/python3", ["-I", "-c", QUERY]));
  const released = (s) => {
    assert.equal(s.mask, 0, "OS pointer buttons and modifiers released");
    assert.equal(s.xHeld, false, "OS x key released");
  };
  return {
    clickAndType(point) {
      assert.ok(Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y));
      assert.equal(
        fs.existsSync(marker),
        false,
        "unresolved placement input ownership",
      );
      const before = state();
      released(before);
      fs.writeFileSync(
        marker,
        JSON.stringify({ button: 1, keys: ["x"], display: env.DISPLAY }),
        { flag: "wx" },
      );
      let after;
      try {
        send("mousemove", "--sync", String(point.x), String(point.y));
        send("mousedown", "1");
        assert.ok(state().mask & 256, "OS button 1 held");
        send("mouseup", "1");
        send("keydown", "x");
        assert.equal(state().xHeld, true);
      } finally {
        // Independent releases: a failed key release must not strand a button.
        const errors = [];
        for (const args of [
          ["keyup", "x"],
          ["mouseup", "1"],
        ]) {
          try {
            send(...args);
          } catch (error) {
            errors.push(error);
          }
        }
        try {
          after = state();
          released(after);
        } catch (error) {
          errors.push(error);
        }
        if (errors.length)
          throw new AggregateError(
            errors,
            "Owned native input release failed; marker retained",
          );
        fs.unlinkSync(marker);
      }
      return { before, after, point };
    },
    assertReleased() {
      const value = state();
      released(value);
      return value;
    },
  };
}
module.exports = { inputOwner };
