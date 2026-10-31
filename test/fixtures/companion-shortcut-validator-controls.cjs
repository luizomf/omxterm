const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  assertHeldReceipt,
  assertFence,
  assertFresh,
  observe,
} = require("./companion-shortcut-input.cjs");
const up = () => ({
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
});
function valid() {
  return {
    initialId: 2,
    coreId: 1,
    key: "F6",
    inputBefore: "old",
    inputAfter: "old",
    newViews: 0,
    destroyed: true,
    osBefore: up(),
    osHeld: { ...up(), Control_L: true, Shift_L: true, F6: true },
    osModifiersUp: { ...up(), F6: true },
    osAfter: up(),
    events: [
      {
        id: 2,
        key: "F6",
        type: "keyDown",
        repeat: false,
        control: true,
        shift: true,
        alt: false,
        meta: false,
        phase: "held",
        prevented: true,
      },
      {
        id: 1,
        key: "F6",
        type: "keyDown",
        repeat: true,
        control: true,
        shift: true,
        alt: false,
        meta: false,
        phase: "held",
        prevented: true,
      },
      {
        id: 1,
        key: "F6",
        type: "keyDown",
        repeat: true,
        control: false,
        shift: false,
        alt: false,
        meta: false,
        phase: "modifiers-up",
        prevented: true,
      },
    ],
  };
}
test("accepts independent OS release without fabricating Chromium keyUp", () =>
  assertHeldReceipt(valid()));
test("Control+Escape uses unshifted chord and rejects dismissal-only hide", () => {
  const r = valid();
  r.key = "Escape";
  r.shiftExpected = false;
  r.osHeld.F6 = false;
  r.osHeld.Escape = true;
  r.osHeld.Shift_L = false;
  r.osModifiersUp.F6 = false;
  r.osModifiersUp.Escape = true;
  for (const e of r.events) {
    e.key = "Escape";
    e.shift = false;
  }
  assertHeldReceipt(r);
  assert.throws(() => assertHeldReceipt({ ...r, destroyed: false }));
  const wrongModifier = structuredClone(r);
  wrongModifier.events[0].control = false;
  assert.throws(() => assertHeldReceipt(wrongModifier));
});
test("accepts consumed Chromium keyUp when actually present", () => {
  const r = valid();
  r.events.push({ id: 1, key: "F6", type: "keyUp", prevented: true });
  assertHeldReceipt(r);
});
const faults = {
  "missing initial": (r) => r.events.shift(),
  "wrong initial owner": (r) => {
    r.events[0].id = 9;
  },
  "initial repeated": (r) => {
    r.events[0].repeat = true;
  },
  "missing real core repeat": (r) => r.events.splice(1, 1),
  "repeat stayed in child": (r) => {
    r.events[1].id = 2;
  },
  "missing modifier-free repeat": (r) => r.events.pop(),
  "repeat leaked": (r) => {
    r.events[1].prevented = false;
  },
  "keyUp leaked": (r) =>
    r.events.push({ id: 1, key: "F6", type: "keyUp", prevented: false }),
  "unrelated modifier initially held": (r) => {
    r.osBefore.Alt_R = true;
  },
  "missing OS release field": (r) => {
    delete r.osAfter.F6;
  },
  "OS never held": (r) => {
    r.osHeld.F6 = false;
  },
  "modifier remained held": (r) => {
    r.osModifiersUp.Control_L = true;
  },
  "base released too early": (r) => {
    r.osModifiersUp.F6 = false;
  },
  "OS base still down": (r) => {
    r.osAfter.F6 = true;
  },
  "OS modifier still down": (r) => {
    r.osAfter.Shift_L = true;
  },
  "PTY leak": (r) => {
    r.inputAfter += "\u001b";
  },
  "held reopened child": (r) => {
    r.newViews = 1;
  },
  "child not destroyed": (r) => {
    r.destroyed = false;
  },
};
for (const [name, mutate] of Object.entries(faults))
  test("rejects " + name, () => {
    const r = valid();
    mutate(r);
    assert.throws(() => assertHeldReceipt(r));
  });
for (const modifier of ["alt", "meta"])
  for (const index of [0, 1, 2])
    test(`rejects unrequested ${modifier} on held event ${index}`, () => {
      const r = valid();
      r.events[index][modifier] = true;
      assert.throws(() => assertHeldReceipt(r), /unrequested/);
    });
test("exact PTY ordered fence, including unavailable chord control", () => {
  assertFence("old", "oldx");
  assertFence("old", "old\u001b[18;6~x", "\u001b[18;6~x");
  for (const actual of ["old", "oldxx", "old\u001bx", "oldx\u001b"])
    assert.throws(() => assertFence("old", actual));
});
test("fresh same chord must reopen once, with new identity and no bytes", () => {
  const r = {
    oldId: 2,
    newId: 3,
    newViews: 1,
    inputBefore: "old",
    inputAfter: "old",
    ready: true,
  };
  assertFresh(r);
  for (const patch of [
    { newViews: 0 },
    { newViews: 2 },
    { newId: 2 },
    { ready: false },
    { inputAfter: "oldx" },
  ])
    assert.throws(() => assertFresh({ ...r, ...patch }));
});
test("observer attaches new children, captures final prevention and disposes listeners", async () => {
  const app = new EventEmitter();
  const core = new EventEmitter();
  core.id = 1;
  const first = new EventEmitter();
  first.id = 2;
  const obs = observe({ app, core, hosted: () => [first] });
  const next = new EventEmitter();
  next.id = 3;
  app.emit("web-contents-created", {}, next);
  obs.phase("held");
  const event = { defaultPrevented: false };
  next.emit("before-input-event", event, {
    type: "keyDown",
    key: "F6",
    code: "F6",
    control: true,
    shift: true,
    isAutoRepeat: true,
  });
  event.defaultPrevented = true;
  await Promise.resolve();
  assert.equal(obs.events[0].id, 3);
  assert.equal(obs.events[0].prevented, true);
  assert.equal(obs.created.length, 1);
  obs.stop();
  assert.equal(app.listenerCount("web-contents-created"), 0);
  for (const wc of [core, first, next])
    assert.equal(wc.listenerCount("before-input-event"), 0);
});
