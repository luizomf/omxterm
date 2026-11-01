// Private first-Insert diagnostic. No terminal input or production behavior.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const classification = "first-insert-memory-not-qualification";

function memoryInput({ value, platform, evidence, captures }) {
  if (value === undefined) return undefined;
  assert.match(value, /^[a-f0-9]{32}$/);
  assert.equal(platform, "win32");
  assert.ok(typeof evidence === "string" && path.win32.isAbsolute(evidence));
  assert.ok(
    captures.every((flag) => flag === undefined),
    "diagnostics cannot be mixed",
  );
  return value;
}

// Check the producer's synchronous event groups, not a cross-process clock or
// an OS-input model. A dump may end with a pending timer or include later input.
function validateProducerOrder(events) {
  const drafts = new Set(
    ["  SNIPPETS_INSERT  ", "SNIPPETS_RUN"].map((text) =>
      Buffer.from(text).toString("hex"),
    ),
  );
  let stage = "idle";
  let line = "";
  let pending = null;
  let fired = null;
  for (const event of events.slice(4)) {
    switch (event.kind) {
      case "stdin":
        assert.equal(stage, "idle");
        assert.equal(event.lineBefore, line);
        stage = "cancel";
        break;
      case "timer-cancel":
        assert.equal(stage, "cancel");
        assert.equal(event.pending, pending !== null);
        pending = null;
        stage = "processed";
        break;
      case "processed":
        assert.equal(stage, "processed");
        assert.ok(Buffer.from(event.lineAfter, "base64").length <= 4096);
        line = event.lineAfter;
        stage = drafts.has(Buffer.from(line, "base64").toString("hex"))
          ? "schedule"
          : "idle";
        break;
      case "probe-error": {
        assert.equal(stage, "processed");
        assert.equal(typeof event.lineAfter, "string");
        const length = Buffer.from(event.lineAfter, "base64").length;
        assert.ok(
          event.reason === "unexpected-line"
            ? length > 0 && length <= 4096
            : event.reason === "line-bound" && length === 4097,
        );
        stage = "failed";
        break;
      }
      case "timer-schedule":
        assert.equal(stage, "schedule");
        assert.ok(drafts.has(event.draft));
        assert.equal(event.draft, Buffer.from(line, "base64").toString("hex"));
        pending = event.draft;
        stage = "idle";
        break;
      case "timer-fire":
        assert.equal(stage, "idle");
        assert.notEqual(pending, null);
        assert.equal(event.line, line);
        assert.equal(
          event.matches,
          Buffer.from(line, "base64").toString("hex") === pending,
        );
        fired = pending;
        pending = null;
        stage = event.matches ? "invoke" : "idle";
        break;
      case "receipt-write-invoked":
        assert.equal(stage, "invoke");
        assert.ok(drafts.has(event.draft));
        assert.equal(event.draft, fired);
        stage = "return";
        break;
      case "receipt-write-returned":
        assert.equal(stage, "return");
        assert.ok(drafts.has(event.draft));
        assert.equal(event.draft, fired);
        stage = "idle";
        break;
      case "dump-boundary":
        assert.ok(
          stage === "idle" || stage === "failed",
          "incomplete synchronous producer group",
        );
        break;
      default:
        assert.fail("Unexpected producer event");
    }
  }
}

function validateDump(dump, outcomeText, pid, nonce) {
  assert.equal(dump.classification, classification);
  assert.equal(dump.nonce, nonce);
  assert.equal(dump.pid, pid);
  assert.equal(dump.delayMs, 60000);
  assert.equal(dump.overflow, false, "memory capture overflow");
  assert.equal(dump.error, null, "early or unavailable outcome");
  assert.equal(
    dump.outcomeText,
    outcomeText,
    "dump must read exact completed observation",
  );
  const events = dump.events;
  assert.ok(
    Array.isArray(events) && events.length >= 5 && events.length <= 256,
  );
  assert.equal(events[0].kind, "start");
  assert.equal(events.at(-1).kind, "dump-boundary");
  assert.ok(Buffer.byteLength(JSON.stringify(events)) <= 263000);
  const allowed = new Set([
    "start",
    "raw-request-returned",
    "ready-write-returned",
    "listener-attached",
    "stdin",
    "timer-cancel",
    "processed",
    "timer-schedule",
    "timer-fire",
    "receipt-write-invoked",
    "receipt-write-returned",
    "probe-error",
    "dump-boundary",
  ]);
  let inputBytes = 0;
  let previous = -1n;
  for (const [index, event] of events.entries()) {
    assert.ok(allowed.has(event.kind));
    if (event.kind === "raw-request-returned")
      assert.equal(event.requested, true, "raw input was not requested");
    for (const key of ["data", "lineBefore", "lineAfter", "line"]) {
      if (event[key] === undefined) continue;
      assert.equal(typeof event[key], "string");
      const decoded = Buffer.from(event[key], "base64");
      assert.equal(decoded.toString("base64"), event[key]);
      assert.ok(decoded.length <= (key === "data" ? 65536 : 4097));
    }
    if (event.kind === "stdin") {
      assert.equal(typeof event.data, "string");
      assert.equal(typeof event.lineBefore, "string");
      inputBytes += Buffer.from(event.data, "base64").length;
      assert.ok(inputBytes <= 65536);
    }
    if (event.kind === "processed")
      assert.equal(typeof event.lineAfter, "string");
    if (event.kind === "timer-cancel")
      assert.equal(typeof event.pending, "boolean");
    if (event.kind === "timer-schedule") assert.equal(event.delayMs, 150);
    if (event.kind === "timer-fire") {
      assert.equal(typeof event.matches, "boolean");
      assert.equal(typeof event.line, "string");
    }
    assert.equal(event.sequence, index + 1);
    assert.match(event.ns, /^\d+$/);
    const ns = BigInt(event.ns);
    assert.ok(ns >= previous);
    previous = ns;
  }
  const kinds = events.map((event) => event.kind);
  for (const kind of [
    "start",
    "raw-request-returned",
    "ready-write-returned",
    "listener-attached",
    "dump-boundary",
  ])
    assert.equal(kinds.filter((value) => value === kind).length, 1);
  assert.deepEqual(kinds.slice(0, 4), [
    "start",
    "raw-request-returned",
    "ready-write-returned",
    "listener-attached",
  ]);
  validateProducerOrder(events);
  // setTimeout is not an exact clock. The source fixes its 60-second delay;
  // exclusive outcome-file arbitration, not a nanosecond threshold, refuses
  // an early dump. Retain measured child times without inventing precision.
  return {
    events: events.length,
    callbacks: kinds.filter((kind) => kind === "stdin").length,
  };
}

// The original receipt wait lives in observe(), unchanged. All file operations
// below begin only after it returns or throws. No shared cross-process clock is
// assumed: child inclusion of this exact unique outcome is the causal barrier.
async function observeFirstInsert({
  observe,
  snapshot,
  evidence,
  pid,
  nonce,
  waitMs = 65000,
}) {
  let initial;
  try {
    await observe();
    initial = { kind: "receipt", error: null };
  } catch (error) {
    const text = String(error);
    initial = {
      kind:
        text === "Error: Timed out: controlled probe observed first Insert"
          ? "timeout"
          : "error",
      error: text,
    };
  }
  const outcome = { classification, nonce, pid, initial };
  const outcomeText = JSON.stringify(outcome);
  const result = {
    ...outcome,
    beforeCollection: null,
    collection: { complete: false },
  };
  try {
    result.beforeCollection = snapshot();
    await fs.writeFile(
      path.join(evidence, "memory-observation.json"),
      outcomeText,
      { flag: "wx" },
    );
    const deadline = Date.now() + waitMs;
    let dump;
    while (Date.now() < deadline) {
      try {
        const file = path.join(evidence, "memory-child.json");
        const stat = await fs.lstat(file);
        assert.ok(
          stat.isFile() && !stat.isSymbolicLink() && stat.size <= 280000,
          "invalid dump file",
        );
        dump = JSON.parse(await fs.readFile(file, "utf8"));
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(dump, "memory dump missing before collection deadline");
    const summary = validateDump(dump, outcomeText, pid, nonce);
    result.collection = { complete: true, ...summary };
  } catch (error) {
    result.collection.error = String(error);
  }
  await fs.writeFile(
    path.join(evidence, "memory-result.json"),
    JSON.stringify(result),
    { flag: "wx" },
  );
  return result;
}
module.exports = { memoryInput, validateDump, observeFirstInsert };
