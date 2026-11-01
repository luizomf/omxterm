// Fixture-only Windows session input. State queries run in separate processes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function openWindowsInput(options, runtime = childProcess) {
  const { executable, script, marker, handle, owner } = options;
  assert.ok(path.win32.isAbsolute(executable));
  assert.ok(path.win32.isAbsolute(script));
  assert.ok(path.isAbsolute(marker));
  assert.match(handle, /^[1-9][0-9]*$/);
  assert.ok(Number.isSafeInteger(owner) && owner > 0);
  const observations = [];
  let marked = false;
  let mayBeDown = false;
  let failure;
  let closed = false;
  const call = (operation) => {
    const text = runtime.execFileSync(
      executable,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        script,
        "-Handle",
        handle,
        "-Owner",
        String(owner),
        "-Operation",
        operation,
      ],
      { encoding: "utf8", timeout: 5000, windowsHide: true },
    );
    const result = JSON.parse(text);
    assert.equal(result.operation, operation);
    assert.equal(result.handle, handle);
    assert.equal(result.owner, owner);
    assert.equal(result.foreground, true, "owned foreground required");
    assert.equal(typeof result.down, "boolean");
    if (operation !== "state") assert.equal(result.sent, 1);
    observations.push(result);
    if (marked)
      fs.writeFileSync(
        marker,
        JSON.stringify({ handle, owner, observations }) + "\n",
      );
    return result;
  };
  const state = (down) =>
    assert.equal(call("state").down, down, "independent Enter state");
  const operation = (run) => () => {
    assert.equal(closed, false, "input already closed");
    if (failure) throw failure;
    try {
      run();
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  return {
    get observations() {
      return observations.slice();
    },
    down: operation(() => {
      assert.equal(mayBeDown, false);
      state(false);
      if (!marked) {
        fs.writeFileSync(
          marker,
          JSON.stringify({ handle, owner, observations }) + "\n",
          {
            flag: "wx",
          },
        );
        marked = true;
      }
      mayBeDown = true; // A failed post cannot establish that no key was sent.
      call("down");
      state(true);
    }),
    repeat: operation(() => {
      assert.equal(mayBeDown, true);
      state(true);
      call("repeat");
    }),
    up: operation(() => {
      assert.equal(mayBeDown, true);
      state(true);
      call("up");
      state(false);
      mayBeDown = false;
    }),
    close({ scenarioFailed = false } = {}) {
      if (closed) {
        if (failure) throw failure;
        return;
      }
      closed = true;
      if (mayBeDown) {
        failure ??= new Error("Windows Enter gesture unsettled");
        try {
          call("up"); // Cleanup is never a successful gesture receipt.
          state(false);
        } catch (error) {
          if (error !== failure)
            failure = new AggregateError(
              [failure, error],
              "Windows input and cleanup failed",
            );
        }
      } else {
        try {
          state(false);
        } catch (error) {
          failure ??= error;
        }
      }
      if (marked && scenarioFailed) {
        try {
          fs.writeFileSync(
            marker,
            JSON.stringify({
              handle,
              owner,
              observations,
              scenarioFailed: true,
            }) + "\n",
          );
        } catch (error) {
          if (failure)
            throw new AggregateError(
              [failure, error],
              "Windows input and receipt persistence failed",
            );
          throw error;
        }
      }
      if (failure) throw failure; // Retain the marker after any uncertainty.
      if (marked && !scenarioFailed) fs.unlinkSync(marker);
    },
  };
}
module.exports = { openWindowsInput };
