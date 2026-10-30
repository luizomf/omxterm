// macOS fixture-only input. No product imports; OS receipt is not Chromium receipt.
const assert = require("node:assert/strict");
const { createHash, randomInt } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function verifyQuartzTool(manifest) {
  assert.ok(
    typeof manifest === "string" && path.isAbsolute(manifest),
    "Absolute Quartz tool manifest required",
  );
  const tool = JSON.parse(fs.readFileSync(manifest, "utf8"));
  assert.ok(
    typeof tool.executable === "string" && path.isAbsolute(tool.executable),
  );
  const hash = (file) =>
    createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(
    tool.sourceSha256,
    hash(path.join(__dirname, "snippets-quartz.swift")),
    "Quartz source binding",
  );
  assert.equal(
    tool.binarySha256,
    hash(tool.executable),
    "Quartz binary binding",
  );
  fs.accessSync(tool.executable, fs.constants.X_OK);
  assert.ok(
    !fs.existsSync(tool.executable + ".unsettled.json"),
    "Quartz input ownership unresolved; inspect retained marker and guest key state before another native launch",
  );
  return tool;
}

async function openQuartzInput(
  { manifest, root, evidence = root },
  runtime = childProcess,
) {
  const tool = verifyQuartzTool(manifest);
  const token = randomInt(1, 2 ** 47);
  const pid = process.pid;
  const guard = tool.executable + ".unsettled.json";
  const stop = path.join(root, "quartz-observer-stop");
  fs.writeFileSync(guard, JSON.stringify({ pid, token, root }), {
    flag: "wx",
    mode: 0o600,
  });
  const rows = [];
  const log = (row) =>
    fs.appendFileSync(
      path.join(evidence, "quartz-lifecycle.jsonl"),
      JSON.stringify(row) + "\n",
    );
  let child,
    outcome,
    failure,
    pending = "",
    closing = false,
    closePromise;
  let gesture,
    mayBeDown = false;
  const markFailure = (error) => {
    failure ??= error;
  };
  const accept = (row) => {
    rows.push(row);
    if (
      [
        "error",
        "tap-disabled",
        "observer-deadline",
        "cleanup-release",
      ].includes(row.kind)
    )
      markFailure(new Error("Quartz observer continuity failed: " + row.kind));
    if (row.kind === "observer-stopped" && !closing)
      markFailure(new Error("Quartz observer stopped before close"));
  };
  const state = () => rows.findLast((row) => row.state)?.state;
  const healthy = () => {
    if (failure) throw failure;
    if (outcome && !closing) throw new Error("Quartz observer exited early");
  };
  const until = async (check, label, cleanup = false) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (!cleanup) healthy();
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Timed out: Quartz " + label);
  };
  const post = (operation) => {
    log({ kind: "submission", operation, token, pid });
    runtime.execFileSync(
      tool.executable,
      ["post", String(token), String(pid), operation],
      {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    log({ kind: "submission-return", operation }); // Never an event receipt.
  };
  const tapIndex = (start, type, repeat) =>
    rows.findIndex(
      (row, i) =>
        i >= start &&
        row.kind === "tap" &&
        row.token === token &&
        row.targetPID === pid &&
        row.type === type &&
        (repeat === undefined || row.repeat === repeat),
    );
  const observedState = (start, down) =>
    rows.slice(start).some((row) => row.state?.sessionDown === down);
  const operation = (fn) => async () => {
    healthy();
    assert.ok(!closing, "Quartz input already closed");
    try {
      return await fn();
    } catch (error) {
      markFailure(error);
      throw error;
    }
  };
  const input = {
    down: operation(async () => {
      assert.equal(gesture, undefined, "Previous Quartz gesture still active");
      assert.equal(
        state()?.sessionDown,
        false,
        "Quartz baseline session key must be up",
      );
      gesture = { start: rows.length };
      mayBeDown = true; // Record intent before a possibly failing post.
      post("down");
      await until(() => {
        const down = tapIndex(gesture.start, "keyDown", 0);
        return (
          down >= 0 &&
          observedState(down, true) &&
          state()?.sessionDown === true
        );
      }, "targeted down and held session state");
      gesture.held = rows.length;
    }),
    repeat: operation(async () => {
      assert.ok(gesture?.held, "Quartz repeat requires observed held state");
      assert.equal(state()?.sessionDown, true);
      const start = rows.length;
      post("repeat");
      await until(
        () =>
          tapIndex(start, "keyDown", 1) >= 0 && state()?.sessionDown === true,
        "targeted repeat",
      );
    }),
    up: operation(async () => {
      assert.ok(gesture?.held, "Quartz release requires observed held state");
      assert.equal(
        state()?.sessionDown,
        true,
        "Quartz held state lost before release",
      );
      const start = rows.length; // Prior gesture's release cannot satisfy this one.
      post("up");
      await until(() => {
        const up = tapIndex(start, "keyUp");
        return (
          up >= 0 && observedState(up, false) && state()?.sessionDown === false
        );
      }, "targeted release and session key up");
      log({
        kind: "gesture-released",
        start: gesture.start,
        releaseStart: start,
        token,
        pid,
      });
      gesture = undefined;
      mayBeDown = false;
    }),
    close() {
      return (closePromise ??= (async () => {
        closing = true;
        if (mayBeDown) {
          markFailure(
            new Error(
              "Quartz gesture unsettled; cleanup release is not scenario success",
            ),
          );
          log({ kind: "cleanup-release" });
          try {
            post("up");
          } catch (error) {
            markFailure(error);
          }
        }
        if (child) {
          fs.writeFileSync(stop, "stop\n");
          try {
            await until(() => outcome, "observer close join", true);
          } catch (error) {
            markFailure(error);
          }
          if (!outcome || outcome.code !== 0 || outcome.signal !== null)
            markFailure(new Error("Quartz observer did not join normally"));
          const stopped = rows.findLast(
            (row) => row.kind === "observer-stopped",
          );
          if (
            !stopped ||
            stopped.failed !== false ||
            stopped.state?.sessionDown !== false ||
            stopped.state?.hidDown !== false
          )
            markFailure(
              new Error("Quartz final observer/key state unavailable or down"),
            );
          if (pending.length)
            markFailure(new Error("Truncated Quartz observer record"));
        }
        try {
          const output = runtime.execFileSync(tool.executable, ["status"], {
            encoding: "utf8",
            timeout: 5000,
          });
          const status = output
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          const access = status.find((row) => row.kind === "access");
          assert.equal(access?.listen, true, "Quartz final listen access");
          assert.equal(access?.post, true, "Quartz final post access");
          const final = status.find((row) => row.kind === "state");
          log({ kind: "final-state", observation: final, access });
          assert.equal(final?.state?.sessionDown, false);
          assert.equal(final?.state?.hidDown, false);
        } catch (error) {
          markFailure(error);
        }
        if (failure) throw failure; // Durable external marker refuses subsequent scopes.
        fs.unlinkSync(guard);
      })());
    },
  };
  try {
    child = runtime.spawn(
      tool.executable,
      ["observe", String(token), String(pid), stop],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child.on("error", markFailure);
    child.on("close", (code, signal) => {
      outcome = { code, signal };
      if (!closing) markFailure(new Error("Quartz observer exited early"));
    });
    child.stdout.on("data", (chunk) => {
      try {
        fs.appendFileSync(path.join(evidence, "quartz.jsonl"), chunk);
        pending += chunk.toString();
        assert.ok(pending.length < 65536, "Oversized Quartz record");
        let index;
        while ((index = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 1);
          accept(JSON.parse(line));
        }
      } catch (error) {
        markFailure(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      try {
        fs.appendFileSync(path.join(evidence, "quartz.stderr"), chunk);
      } catch (error) {
        markFailure(error);
      }
    });
    await until(
      () =>
        rows.some(
          (row) =>
            row.kind === "ready" &&
            row.token === token &&
            row.targetPID === pid,
        ),
      "observer ready",
    );
    assert.equal(state()?.sessionDown, false);
    assert.equal(state()?.hidDown, false);
    return input;
  } catch (error) {
    markFailure(error);
    try {
      await input.close();
    } catch {
      /* Original failure retained; marker remains. */
    }
    throw error;
  }
}
module.exports = { openQuartzInput, verifyQuartzTool };
