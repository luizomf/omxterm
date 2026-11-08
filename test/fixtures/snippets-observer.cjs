// Test-only observation of actual node-pty instances and native consent.
// Prototype interception works after main captured node-pty's ESM spawn binding.
const assert = require("node:assert/strict");
const { dialog } = require("electron");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");
const OUTPUT_LIMIT_CODE_UNITS = 65536;
const BASELINE_SHA256 =
  "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
const UPDATE_SHA256 =
  "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b";

function verifySnippetsTrust(prompt, version, digest, generation, official) {
  assert.equal(prompt.type, "warning");
  assert.equal(prompt.title, "Trust extension code?");
  assert.equal(prompt.message, `Install Snippets ${version}?`);
  assert.equal(
    prompt.detail,
    `This is trusted local code, not a sandbox. It can read/change files, run programs and use the network with your user permissions. Third-party authors are responsible for their extensions. Only install packages you trust. Installation is dormant until you invoke its action.\n\nPackage: omxterm.snippets\nSHA-256: ${digest}\nCurrent generation: ${generation}` +
      (official
        ? "\n\nOfficial means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions."
        : ""),
  );
  assert.ok(Array.isArray(prompt.buttons));
  assert.equal(prompt.buttons.length, 2);
  assert.equal(prompt.buttons[0], "Cancel");
  assert.equal(prompt.buttons[1], "Trust and install");
  assert.equal(prompt.defaultId, 0);
  assert.equal(prompt.cancelId, 0);
}

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
  let publicObservation;
  let publicBinding;
  let baselineSelections = 0;
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
  dialog.showOpenDialog = async () => {
    if (options.publicUpdate) {
      assert.equal(
        publicObservation,
        undefined,
        "public update forbids local fallback",
      );
      assert.equal(baselineSelections++, 0, "one baseline selection");
      assert.equal(options.archiveSha256, BASELINE_SHA256);
    }
    assert.notEqual(
      options.publicCatalog,
      true,
      "public catalog forbids local chooser",
    );
    return { canceled: false, filePaths: [options.archive] };
  };
  dialog.showMessageBox = async (_owner, prompt) => {
    assert.equal(prompt.title, "Trust extension code?");
    if (options.publicUpdate) {
      if (publicObservation) {
        publicObservation.verifyTrust(prompt);
      } else {
        assert.equal(baselineSelections, 1, "baseline chooser required");
        assert.equal(approvals, 0, "one baseline approval");
        verifySnippetsTrust(prompt, "0.1.0", BASELINE_SHA256, 0, false);
      }
    } else if (options.publicCatalog === true) {
      const digest =
        "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
      assert.equal(options.archiveSha256, digest);
      assert.ok(approvals < 2, "only two public approvals");
      assert.equal(prompt.type, "warning");
      assert.equal(prompt.message, "Install Snippets 0.1.0?");
      assert.equal(
        prompt.detail,
        `This is trusted local code, not a sandbox. It can read/change files, run programs and use the network with your user permissions. Third-party authors are responsible for their extensions. Only install packages you trust. Installation is dormant until you invoke its action.\n\nPackage: omxterm.snippets\nSHA-256: ${digest}\nCurrent generation: ${approvals}\n\nOfficial means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions.`,
      );
      assert.ok(Array.isArray(prompt.buttons));
      assert.equal(prompt.buttons.length, 2);
      assert.equal(prompt.buttons[0], "Cancel");
      assert.equal(prompt.buttons[1], "Trust and install");
      assert.equal(prompt.defaultId, 0);
      assert.equal(prompt.cancelId, 0);
    } else assert.ok(prompt.detail.includes(options.archiveSha256));
    approvals++;
    return { response: 1, checkboxChecked: false };
  };
  return {
    ptys,
    children,
    approvalCount: () => approvals,
    readinessTraceFailures: () => readinessTraceFailures,
    beginPublicUpdate(catalogSha256) {
      assert.equal(options.publicUpdate, true);
      assert.equal(approvals, 1, "baseline approval required");
      assert.equal(publicObservation, undefined, "one public observer");
      const { ipcMain } = require("electron");
      publicObservation =
        require("./public-catalog-observer.cjs").startSnippetsUpdateObservation(
          {
            ipcMain,
            diagnostics: require("node:diagnostics_channel"),
            catalogSha256,
            archiveSha256: UPDATE_SHA256,
            verifyTrust: (prompt, digest, index, generation) => {
              assert.equal(index, 0);
              verifySnippetsTrust(prompt, "0.1.1", digest, generation, true);
            },
          },
        );
    },
    publicSummary() {
      assert.ok(publicObservation, "public observation required");
      publicBinding = publicObservation.summary();
      return publicBinding;
    },
    beginPublicQuit() {
      if (publicObservation) publicObservation.beginQuit();
    },
    restore({ allowRemoved = false } = {}) {
      try {
        if (publicObservation && allowRemoved) {
          if (!publicBinding) {
            publicObservation.stop({ allowRemoved: true });
            throw Error("public binding required before Quit");
          }
          require("./public-catalog-observer.cjs").sealPublicObservation(
            publicObservation,
            publicBinding,
            () => {},
          );
        } else publicObservation?.stop({ allowRemoved: false });
      } finally {
        Terminal.prototype._forwardEvents = original.forward;
        childProcess.fork = original.fork;
        syncBuiltinESMExports();
        dialog.showOpenDialog = original.open;
        dialog.showMessageBox = original.message;
        for (const dispose of subscriptions.splice(0)) dispose();
      }
    },
  };
}
module.exports = { observe, verifySnippetsTrust };
