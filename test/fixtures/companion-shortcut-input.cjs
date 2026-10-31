// Linux assigned X11/XTEST only; synthetic raw-client qualification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const KEYS = {
  Control_L: 0xffe3,
  Control_R: 0xffe4,
  Shift_L: 0xffe1,
  Shift_R: 0xffe2,
  Alt_L: 0xffe9,
  Alt_R: 0xffea,
  Super_L: 0xffeb,
  Super_R: 0xffec,
  F6: 0xffc3,
  F7: 0xffc4,
  Escape: 0xff1b,
  x: 0x78,
};
// Numeric injection bypasses libxdo's named function-key modifier mapping.
// state() verifies these codes and their unmodified symbols on the assigned display.
const FUNCTION_KEYCODES = { F6: 72, F7: 73 };
const PYTHON = `import ctypes,json,sys
x=ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes=[ctypes.c_char_p]; x.XOpenDisplay.restype=ctypes.c_void_p
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong]; x.XKeysymToKeycode.restype=ctypes.c_ubyte
x.XQueryKeymap.argtypes=[ctypes.c_void_p,ctypes.c_void_p]; x.XCloseDisplay.argtypes=[ctypes.c_void_p]
x.XkbKeycodeToKeysym.argtypes=[ctypes.c_void_p,ctypes.c_ubyte,ctypes.c_int,ctypes.c_int]; x.XkbKeycodeToKeysym.restype=ctypes.c_ulong
d=x.XOpenDisplay(None)
if not d: raise SystemExit('No assigned X display')
try:
 keys=(ctypes.c_ubyte*32)()
 if x.XQueryKeymap(d,keys)!=1: raise SystemExit('XQueryKeymap failed')
 result={}
 functionKeys={}
 for name,sym in json.loads(sys.argv[1]).items():
  code=x.XKeysymToKeycode(d,sym)
  if not code: raise SystemExit('Missing keycode '+name)
  result[name]=bool(keys[code//8] & (1<<(code%8)))
  if name in ('F6','F7'): functionKeys[name]={'code':code,'keysym':x.XkbKeycodeToKeysym(d,code,0,0)}
 print(json.dumps({'keys':result,'functionKeys':functionKeys}))
finally: x.XCloseDisplay(d)
`;
function state() {
  const result = JSON.parse(
    execFileSync(
      "/usr/bin/python3",
      ["-I", "-c", PYTHON, JSON.stringify(KEYS)],
      { encoding: "utf8", timeout: 3000 },
    ),
  );
  for (const [key, code] of Object.entries(FUNCTION_KEYCODES)) {
    assert.equal(
      result.functionKeys?.[key]?.code,
      code,
      `${key} assigned X11 keycode`,
    );
    assert.equal(
      result.functionKeys?.[key]?.keysym,
      KEYS[key],
      `${key} unmodified X11 keysym`,
    );
  }
  return result.keys;
}
function send(operation, key) {
  assert.ok(["keydown", "keyup"].includes(operation));
  assert.ok(Object.hasOwn(KEYS, key));
  execFileSync(
    "/usr/bin/xdotool",
    [operation, String(FUNCTION_KEYCODES[key] ?? key)],
    { timeout: 3000 },
  );
}
const down = (e) => e.type === "keyDown" || e.type === "rawKeyDown";
function assertChord(event, control, shift) {
  assert.equal(event.control, control, "native chord Control matches request");
  assert.equal(event.shift, shift, "native chord Shift matches request");
  assert.equal(event.alt, false, "native chord has no unrequested Alt");
  assert.equal(event.meta, false, "native chord has no unrequested Meta");
}
function assertHeldReceipt(r) {
  const shifted = r.shiftExpected !== false;
  assert.ok(
    r.events.some(
      (e) =>
        e.id === r.initialId &&
        e.key === r.key &&
        down(e) &&
        !e.repeat &&
        e.control &&
        e.shift === shifted &&
        e.prevented,
    ),
    "initial native chord consumed by intended owner",
  );
  assert.ok(
    r.events.some(
      (e) =>
        e.id === r.coreId &&
        e.key === r.key &&
        down(e) &&
        e.repeat &&
        e.control &&
        e.shift === shifted &&
        e.phase === "held",
    ),
    "actual core repeat after child destruction",
  );
  assert.ok(
    r.events.some(
      (e) =>
        e.id === r.coreId &&
        e.key === r.key &&
        down(e) &&
        e.repeat &&
        !e.control &&
        !e.shift &&
        e.phase === "modifiers-up",
    ),
    "actual core repeat remains isolated after modifiers released",
  );
  const base = r.events.filter(
    (e) => e.key === r.key && (down(e) || e.type === "keyUp"),
  );
  for (const event of base.filter(down)) {
    assert.equal(event.alt, false, "held base event has no unrequested Alt");
    assert.equal(event.meta, false, "held base event has no unrequested Meta");
  }
  assert.ok(
    base.every((e) => e.prevented),
    "every delivered base down/repeat/up prevented",
  );
  assert.ok(
    Object.keys(KEYS).every((key) => r.osBefore[key] === false),
    "all observed keys/modifiers initially released",
  );
  assert.equal(r.osHeld[r.key], true);
  assert.equal(r.osHeld.Control_L, true);
  assert.equal(r.osHeld.Shift_L, shifted);
  assert.equal(r.osModifiersUp[r.key], true);
  assert.equal(r.osModifiersUp.Control_L, false);
  assert.equal(r.osModifiersUp.Shift_L, false);
  assert.ok(
    Object.keys(KEYS).every((key) => r.osAfter[key] === false),
    "all observed keys/modifiers independently up",
  );
  assert.equal(
    r.inputAfter,
    r.inputBefore,
    "held chord cannot leak raw PTY bytes",
  );
  assert.equal(r.newViews, 0, "held close cannot reopen a view");
  assert.equal(r.destroyed, true, "selected native child destroyed");
  // No requirement for a Chromium keyUp: OS release is independent evidence.
}
function assertFence(before, after, payload = "x") {
  assert.equal(after, before + payload, "exact ordered raw PTY fence");
}
function assertFresh(r) {
  assert.equal(r.newViews, 1, "fresh chord opens exactly one new native view");
  assert.notEqual(
    r.oldId,
    r.newId,
    "fresh reopen cannot retain retired WebContents",
  );
  assert.equal(
    r.inputAfter,
    r.inputBefore,
    "fresh bound chord never reaches PTY",
  );
  assert.equal(r.ready, true, "fresh tool readiness");
}
function assertCaptureSaved(prompt, result) {
  assert.equal(prompt.text, "Press the new shortcut, or Escape to cancel.");
  assert.equal(prompt.error, false);
  assert.equal(
    result.text,
    "Saved.",
    "this capture must reach the accepted save result, not cancellation",
  );
  assert.equal(result.error, false);
}
// One expected transcript for the whole tail. Only an explicitly delivered
// control/fence may extend it; later observations can never become a baseline.
function createTranscript(readInput) {
  let expected = readInput();
  return {
    expected: () => expected,
    unchanged() {
      assert.equal(readInput(), expected, "continuous expected raw transcript");
    },
    accept(payload) {
      assert.ok(payload.length > 0);
      assertFence(expected, readInput(), payload);
      expected += payload;
    },
  };
}
function finishEvidence(failures, operations, label) {
  for (const operation of operations) {
    try {
      operation();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `${label}: ${failures.map((error) => error?.message ?? String(error)).join("; ")}`,
    );
}
function observe({ app, core, hosted }) {
  const events = [],
    created = [],
    attached = new Map();
  let phase = "idle";
  const attach = (wc) => {
    if (attached.has(wc)) return;
    const id = wc.id;
    const listener = (event, input) => {
      const row = {
        id,
        owner: wc === core ? "core" : "child",
        type: input.type,
        key: input.key,
        code: input.code,
        control: !!input.control,
        shift: !!input.shift,
        alt: !!input.alt,
        meta: !!input.meta,
        repeat: !!input.isAutoRepeat,
        phase,
        prevented: false,
      };
      events.push(row);
      queueMicrotask(() => {
        row.prevented = event.defaultPrevented;
      });
    };
    wc.on("before-input-event", listener);
    attached.set(wc, listener);
  };
  attach(core);
  for (const wc of hosted()) attach(wc);
  const onCreated = (_event, wc) => {
    created.push({ id: wc.id });
    attach(wc);
  };
  app.on("web-contents-created", onCreated);
  return {
    events,
    created,
    phase(value) {
      phase = value;
    },
    stop() {
      finishEvidence(
        [],
        [
          () => {
            phase = "idle";
          },
          () => app.removeListener("web-contents-created", onCreated),
          ...[...attached].map(
            ([wc, listener]) =>
              () =>
                wc.removeListener("before-input-event", listener),
          ),
        ],
        "shortcut observer cleanup",
      );
    },
  };
}
function createInput({
  evidence,
  observer,
  until,
  readInput,
  core,
  transcript,
}) {
  const marker = path.join(evidence, "shortcut-input-ownership.json");
  let sequence = 0;
  async function owned(label, run) {
    assert.match(label, /^[a-z0-9-]+$/);
    const receipt = {
      label,
      sequence: ++sequence,
      events: [],
      osBefore: state(),
      verifiedFunctionKeycodes: { ...FUNCTION_KEYCODES },
    };
    assert.ok(
      Object.values(receipt.osBefore).every((v) => !v),
      "baseline keys released",
    );
    // Exclusive marker survives failed or interrupted release, outside profile.
    const markerInfo = {
      label,
      monitoredKeys: Object.keys(KEYS),
      ownedKeys: [],
    };
    fs.writeFileSync(marker, JSON.stringify(markerInfo), {
      flag: "wx",
      mode: 0o600,
    });
    const ownedKeys = new Set();
    const updateMarker = () => {
      markerInfo.ownedKeys = [...ownedKeys];
      fs.writeFileSync(marker, JSON.stringify(markerInfo));
    };
    const press = (key) => {
      ownedKeys.add(key);
      updateMarker();
      send("keydown", key);
    };
    const release = (key) => {
      send("keyup", key);
      assert.equal(state()[key], false);
      ownedKeys.delete(key);
      updateMarker();
    };
    const start = observer.events.length;
    const failures = [];
    let result;
    try {
      result = await run({ receipt, press, release });
    } catch (error) {
      failures.push(error);
    } finally {
      for (const key of [...ownedKeys].reverse()) {
        try {
          release(key);
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        receipt.osAfter = state();
        assert.ok(Object.values(receipt.osAfter).every((v) => !v));
        assert.equal(ownedKeys.size, 0);
        fs.unlinkSync(marker);
      } catch (error) {
        failures.push(error);
      }
      finishEvidence(
        failures,
        [
          () => observer.phase("idle"),
          () => {
            receipt.events = observer.events.slice(start);
            receipt.failures = failures.map((e) => String(e.stack || e));
            fs.writeFileSync(
              path.join(evidence, `shortcut-${sequence}-${label}.json`),
              JSON.stringify(receipt, null, 2),
            );
          },
        ],
        label,
      );
    }
    return { result, receipt };
  }
  async function tap(
    key,
    label,
    chord = true,
    modifiers = ["Control_L", "Shift_L"],
  ) {
    assert.ok(["F6", "F7", "Escape", "x"].includes(key));
    assert.ok(
      modifiers.join(",") === "Control_L,Shift_L" ||
        modifiers.join(",") === "Control_L",
    );
    const start = observer.events.length;
    return owned(label, async ({ press, release }) => {
      observer.phase(label);
      if (chord) for (const modifier of modifiers) press(modifier);
      press(key);
      release(key);
      if (chord)
        for (const modifier of [...modifiers].reverse()) release(modifier);
      await until(
        () =>
          observer.events
            .slice(start)
            .some(
              (e) =>
                e.key.toLowerCase() === key.toLowerCase() &&
                down(e) &&
                !e.repeat,
            ),
        "actual native tap initial delivery",
      );
      for (const event of observer.events
        .slice(start)
        .filter(
          (e) =>
            e.key.toLowerCase() === key.toLowerCase() && down(e) && !e.repeat,
        ))
        assertChord(event, chord, chord && modifiers.includes("Shift_L"));
    });
  }
  async function fence(label) {
    const before = transcript.expected();
    transcript.unchanged();
    await tap("x", label, false);
    await until(
      () => readInput().length >= before.length + 1,
      "raw printable fence",
    );
    transcript.accept("x");
  }
  async function heldClose({
    key,
    child,
    settled,
    label,
    modifiers = ["Control_L", "Shift_L"],
  }) {
    assert.ok(
      modifiers.join(",") === "Control_L,Shift_L" ||
        modifiers.join(",") === "Control_L",
    );
    const creationStart = observer.created.length;
    const eventStart = observer.events.length;
    const { receipt } = await owned(
      label,
      async ({ receipt, press, release }) => {
        receipt.key = key;
        receipt.initialId = child.id;
        receipt.coreId = core.id;
        receipt.shiftExpected = modifiers.includes("Shift_L");
        transcript.unchanged();
        receipt.inputBefore = transcript.expected();
        observer.phase("held");
        for (const modifier of modifiers) press(modifier);
        press(key);
        receipt.osHeld = state();
        await until(() => {
          const initial = observer.events
            .slice(eventStart)
            .find((e) => e.key === key && down(e) && !e.repeat);
          if (!initial) return false;
          assertChord(initial, true, receipt.shiftExpected);
          return true;
        }, "exact held initial chord");
        await settled();
        await until(
          () =>
            observer.events
              .slice(eventStart)
              .some(
                (e) =>
                  e.phase === "held" &&
                  e.id === core.id &&
                  e.key === key &&
                  e.repeat &&
                  e.control &&
                  e.shift === receipt.shiftExpected,
              ),
          "actual held repeat on core",
        );
        for (const modifier of [...modifiers].reverse()) release(modifier);
        observer.phase("modifiers-up");
        receipt.osModifiersUp = state();
        await until(
          () =>
            observer.events
              .slice(eventStart)
              .some(
                (e) =>
                  e.phase === "modifiers-up" &&
                  e.id === core.id &&
                  e.key === key &&
                  e.repeat &&
                  !e.control &&
                  !e.shift,
              ),
          "actual modifier-free held repeat on core",
        );
        release(key);
        receipt.inputAfter = readInput();
        receipt.newViews = observer.created.length - creationStart;
        receipt.destroyed = child.isDestroyed();
      },
    );
    assertHeldReceipt(receipt);
    await fence(`${label}-fence`);
    // The ordered native/PTY fence lets queued release delivery enter the
    // observer before final validation; absence is not fabricated as keyUp.
    receipt.events = observer.events.slice(eventStart);
    receipt.newViews = observer.created.length - creationStart;
    receipt.fencedInput = readInput();
    assertHeldReceipt(receipt);
    assertFence(receipt.inputBefore, receipt.fencedInput);
    fs.writeFileSync(
      path.join(evidence, `shortcut-${label}-validated.json`),
      JSON.stringify(receipt, null, 2),
    );
    return receipt;
  }
  return { tap, fence, heldClose, marker };
}
module.exports = {
  assertHeldReceipt,
  assertFence,
  assertFresh,
  assertCaptureSaved,
  createTranscript,
  finishEvidence,
  observe,
  createInput,
};
