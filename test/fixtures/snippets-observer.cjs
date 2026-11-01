// Test-only observation of actual node-pty instances and native consent.
// Prototype interception works after main captured node-pty's ESM spawn binding.
const assert = require("node:assert/strict");
const { dialog } = require("electron");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const OUTPUT_LIMIT_CODE_UNITS = 65536;

function observe(options, packageRequire) {
  const { Terminal } = packageRequire("node-pty/lib/terminal.js");
  const original = {
    forward: Terminal.prototype._forwardEvents,
    fork: childProcess.fork,
    open: dialog.showOpenDialog,
    message: dialog.showMessageBox,
  };
  assert.equal(typeof original.forward, "function");
  const ptys = [];
  const children = [];
  let approvals = 0;
  let readinessTraceFailures = 0;
  const subscriptions = [];
  Terminal.prototype._forwardEvents = function (...args) {
    const result = original.forward.apply(this, args);
    const session = this;
    // Windows node-pty fills its PID asynchronously on ConPTY readiness.
    const record = {
      get pid() {
        return session.pid;
      },
      writes: [],
      output: "",
      outputTruncated: false,
      outputLimitCodeUnits: OUTPUT_LIMIT_CODE_UNITS,
      exited: false,
    };
    if (options.windowsCpr) {
      try {
        record.cprTrace =
          require("./snippets-windows-cpr.cjs").createWindowsCprTrace();
      } catch (error) {
        record.cprTraceError = String(error);
      }
    }
    const ptyIndex = ptys.length;
    ptys.push(record);
    const trace = (kind, data) => {
      if (!options.readinessTrace) return;
      try {
        const pid = session.pid;
        options.readinessTrace({
          kind,
          ptyIndex,
          pid: Number.isSafeInteger(pid) ? pid : null,
          ...(data === undefined
            ? {}
            : typeof data === "string"
              ? { data }
              : { data: null, dataType: typeof data }),
        });
      } catch {
        readinessTraceFailures++;
      }
    };
    trace("pty-attached");
    const write = session.write;
    session.write = function (data) {
      record.writes.push(data);
      try {
        record.cprTrace?.write(record.writes.length - 1, data);
      } catch (error) {
        record.cprTraceError ??= String(error);
      }
      trace("pty-write", data);
      return write.call(this, data);
    };
    subscriptions.push(() => {
      session.write = write;
    });
    const data = session.onData((text) => {
      try {
        record.cprTrace?.output(text);
      } catch (error) {
        record.cprTraceError ??= String(error);
      }
      const output = record.output + text;
      if (output.length > OUTPUT_LIMIT_CODE_UNITS)
        record.outputTruncated = true;
      record.output = output.slice(-OUTPUT_LIMIT_CODE_UNITS);
      trace("pty-output", text);
    });
    const exit = session.onExit(() => {
      record.exited = true;
    });
    subscriptions.push(() => {
      data.dispose();
      exit.dispose();
    });
    return result;
  };
  childProcess.fork = (...args) => {
    const bootstrap =
      typeof args[0] === "string" &&
      path.basename(args[0]) === "bootstrap.mjs" &&
      path.basename(path.dirname(args[0])) === "extension-runtime";
    if (bootstrap && options.asar) {
      assert.equal(
        args[0],
        path.join(options.asar, "dist/extension-runtime/bootstrap.mjs"),
      );
      assert.equal(args[2].execPath, options.executable);
    }
    const child = original.fork(...args);
    if (bootstrap) {
      const record = { pid: child.pid, closed: false, exit: null };
      children.push(record);
      child.once("exit", (code, signal) => {
        record.exit = { code, signal };
      });
      child.once("close", () => {
        record.closed = true;
      });
    }
    return child;
  };
  syncBuiltinESMExports();
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [options.archive],
  });
  dialog.showMessageBox = async (_owner, prompt) => {
    assert.equal(prompt.title, "Trust extension code?");
    assert.ok(prompt.detail.includes(options.archiveSha256));
    approvals++;
    return { response: 1, checkboxChecked: false };
  };
  return {
    ptys,
    children,
    approvalCount: () => approvals,
    readinessTraceFailures: () => readinessTraceFailures,
    restore() {
      Terminal.prototype._forwardEvents = original.forward;
      childProcess.fork = original.fork;
      syncBuiltinESMExports();
      dialog.showOpenDialog = original.open;
      dialog.showMessageBox = original.message;
      for (const dispose of subscriptions.splice(0)) dispose();
    },
  };
}
module.exports = { observe };
