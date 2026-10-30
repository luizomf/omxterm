// Test-only observation of actual node-pty instances and native consent.
// Prototype interception works after main captured node-pty's ESM spawn binding.
const assert = require("node:assert/strict");
const { dialog } = require("electron");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");

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
  const subscriptions = [];
  Terminal.prototype._forwardEvents = function (...args) {
    const result = original.forward.apply(this, args);
    assert.ok(this.pid > 0);
    const record = { pid: this.pid, writes: [], output: "", exited: false };
    ptys.push(record);
    const session = this;
    const write = session.write;
    session.write = function (data) {
      record.writes.push(data);
      return write.call(this, data);
    };
    subscriptions.push(() => {
      session.write = write;
    });
    const data = session.onData((text) => {
      record.output = (record.output + text).slice(-65536);
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
    if (
      String(args[0]).endsWith("extension-runtime/bootstrap.mjs") &&
      options.asar
    ) {
      assert.equal(
        args[0],
        path.join(options.asar, "dist/extension-runtime/bootstrap.mjs"),
      );
      assert.equal(args[2].execPath, options.executable);
    }
    const child = original.fork(...args);
    if (String(args[0]).endsWith("extension-runtime/bootstrap.mjs")) {
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
