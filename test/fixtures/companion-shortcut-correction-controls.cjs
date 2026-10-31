// Executes actual fixture seams with synthetic records/IO only; no native input.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const helper = require("./companion-shortcut-input.cjs");
const scenarioPath = path.join(__dirname, "companion-shortcuts.cjs");

async function recording(source, cancelled) {
  const start = source.indexOf("  async function record(");
  const end = source.indexOf("  async function openFresh(", start);
  assert.ok(start > 0 && end > start);
  let active = false;
  let status = { text: "Saved.", error: false };
  const tool = { action: "toggleFiles", key: "F6" };
  const observer = { events: [] };
  const expected = "Control+Shift+F6";
  const environment = {
    assert,
    tool,
    observer,
    core: { id: 1, focus() {} },
    transcript: helper.createTranscript(() => "prior"),
    assertCaptureSaved: helper.assertCaptureSaved,
    ids: () => [2, 3],
    readInput: () => "prior",
    row: () => "[data-action=toggleFiles]",
    binding: () => expected,
    accelerator: () => expected,
    normalize: (value) => String(value).toLowerCase(),
    assertAvailable: async () => {},
    js: async (script) => {
      if (script.includes("b.focus(); b.click()")) {
        active = true;
        status = {
          text: "Press the new shortcut, or Escape to cancel.",
          error: false,
        };
        return;
      }
      if (script.includes(".settings-status")) return status;
      if (script.includes("is-recording"))
        return script.startsWith("!") ? !active : active;
      if (script.includes("settings-shortcut-value")) return expected;
      throw Error("Unexpected recording JS: " + script);
    },
    until: async (check) =>
      assert.equal(await check(), true, "bounded recording condition"),
    input: {
      tap: async () => {
        active = false;
        status = {
          text: cancelled ? "Recording cancelled." : "Saved.",
          error: false,
        };
        observer.events.push({
          id: 1,
          key: "F6",
          repeat: false,
          type: "keyDown",
          prevented: true,
        });
      },
    },
  };
  const run = new Function(
    ...Object.keys(environment),
    `return (async () => { ${source.slice(start, end)} return record(tool, 'record-active'); })();`,
  );
  return run(...Object.values(environment));
}

test("actual record helper requires a new accepted save, not cancelled unchanged mapping", async () => {
  const source = fs.readFileSync(scenarioPath, "utf8");
  await recording(source, false);
  await assert.rejects(recording(source, true), /accepted save result/);
});

test("continuous transcript rejects delayed leak before the next baseline/fence", () => {
  let actual = "prior";
  const transcript = helper.createTranscript(() => actual);
  transcript.unchanged(); // fresh open or recording returns before raw client append
  actual += "leaked"; // asynchronous append arrives later
  assert.equal(transcript.expected(), "prior"); // never adopt the new observation
  assert.throws(
    () => transcript.unchanged(),
    /continuous expected raw transcript/,
  );
  actual += "x";
  assert.throws(() => transcript.accept("x"), /exact ordered raw PTY fence/);
  assert.equal(transcript.expected(), "prior");
});

test("declared fence/control advances transcript only after exact readback", () => {
  let actual = "prior";
  const transcript = helper.createTranscript(() => actual);
  actual += "x";
  transcript.accept("x");
  actual += "\u001b[18;6~x";
  transcript.accept("\u001b[18;6~x");
  assert.equal(transcript.expected(), actual);
  transcript.unchanged();
});

test("actual scenario aggregates primary, independent listener cleanup and evidence failure", async () => {
  const source = fs.readFileSync(scenarioPath, "utf8");
  const app = new EventEmitter();
  const core = new EventEmitter();
  core.id = 1;
  const child = new EventEmitter();
  child.id = 2;
  const removed = [];
  const originalCoreRemove = core.removeListener.bind(core);
  core.removeListener = (...args) => {
    removed.push("core");
    return originalCoreRemove(...args);
  };
  const originalChildRemove = child.removeListener.bind(child);
  child.removeListener = (...args) => {
    removed.push("child");
    return originalChildRemove(...args);
  };
  app.removeListener = () => {
    throw Error("app listener cleanup failed");
  };
  let evidenceAttempted = false;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    require(name) {
      if (name === "electron")
        return { app, Menu: {}, BrowserWindow: { getAllWindows: () => [{}] } };
      if (name === "./companion-shortcut-input.cjs") return helper;
      if (name === "node:fs")
        return {
          readFileSync: () => "prior",
          writeFileSync: () => {
            evidenceAttempted = true;
            throw Error("scenario evidence failed");
          },
        };
      return require(name);
    },
  });
  // Initial invariant deliberately fails after observation is established.
  await assert.rejects(
    module.exports.runShortcuts({
      core,
      window: {},
      hosted: () => [child],
      options: { root: "/synthetic", evidence: "/synthetic" },
      checks: [],
      children: [],
    }),
    (error) => {
      const text = flatten(error);
      assert.match(text, /1 !== 0/);
      assert.match(text, /app listener cleanup failed/);
      assert.match(text, /scenario evidence failed/);
      return true;
    },
  );
  assert.deepEqual(removed, ["core", "child"]);
  assert.equal(evidenceAttempted, true);
});
function flatten(error) {
  return [String(error), ...(error.errors || []).map(flatten)].join("\n");
}
module.exports = { recording, flatten };
