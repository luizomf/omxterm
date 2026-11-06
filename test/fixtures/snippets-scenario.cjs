// One scenario for source and unchanged extracted-package launch adapters.
// Native dialogs/input are fixture-controlled; all product admission stays real.
const assert = require("node:assert/strict");
const { readFile, writeFile } = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const catalog = require(
  process.platform === "win32"
    ? "./snippets-windows-catalog.json"
    : "./snippets-catalog.json",
);
const insert = catalog.snippets[0].body;
const run = catalog.snippets[1].body;

function controlledPosixShellCommand(controlledPlainShell) {
  // Readline's default may re-enable bracketed paste as the interactive shell
  // starts. Only the fixture-owned inner shell reads this isolated inputrc;
  // the preceding real account shell keeps its ordinary startup behavior.
  const launch = controlledPlainShell
    ? 'INPUTRC="$HOME/.snippets-plain-inputrc" exec /bin/sh -i'
    : "exec /bin/sh -i";
  return `exec /bin/sh -c 'printf "\\033[?2004lSNIPPETS_SHELL_READY\\n"; ${launch}'`;
}

// Count complete controlled-probe receipt lines without mutating PTY output.
function countWindowsProbeReceipts(output, marker) {
  assert.equal(typeof output, "string");
  assert.match(marker, /^[A-Z_]+$/);
  const atLineStart = (start) =>
    start === 0 ||
    output[start - 1] === "\n" ||
    /\u001b\[[1-9][0-9]*;1H$/.test(output.slice(0, start));
  let count = 0;
  let offset = 0;
  while (true) {
    const start = output.indexOf(marker, offset);
    if (start < 0) {
      // A trailing partial marker means the current count is incomplete.
      for (let length = 1; length < marker.length; length++) {
        const partialStart = output.length - length;
        if (
          partialStart >= offset &&
          output.endsWith(marker.slice(0, length)) &&
          atLineStart(partialStart)
        )
          return null;
      }
      return count;
    }
    const end = start + marker.length;
    if (
      end === output.length ||
      (output[end] === "\r" && end + 1 === output.length)
    )
      return null;
    const lineEnded =
      output[end] === "\n" ||
      (output[end] === "\r" && output[end + 1] === "\n");
    assert.ok(
      atLineStart(start) && lineEnded,
      "Invalid controlled probe receipt framing",
    );
    count++;
    offset = end;
  }
}

// node-pty exposes no semantic/protocol provenance. Accept only standalone
// focus shapes or a CPR paired with an earlier observed lexical query; never
// strip escapes from a mixed or split write.
function classifyWindowsWrites(
  writes,
  offset,
  cprContext,
  end = writes.length,
) {
  if (
    !Array.isArray(writes) ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(end) ||
    offset < 0 ||
    end < offset ||
    end > writes.length
  )
    throw Error("Invalid PTY write window");
  let text = "";
  const focus = [];
  const cpr = [];
  const observed = cprContext
    ? require("./snippets-windows-cpr.cjs").validateWindowsCprTrace(
        writes,
        cprContext,
      )
    : null;
  if (observed && end > observed.writeEnd)
    throw Error("CPR observation does not cover write window");
  for (const [index, chunk] of writes.slice(offset, end).entries()) {
    const position = offset + index;
    if (chunk === "\u001b[O" || chunk === "\u001b[I") {
      focus.push({
        index: position,
        kind: chunk === "\u001b[O" ? "out" : "in",
      });
    } else if (typeof chunk === "string" && chunk.includes("\u001b")) {
      const reply = observed?.replies.get(position);
      if (!reply || position >= observed.writeEnd)
        throw Error("Unexpected PTY protocol write");
      cpr.push(reply);
    } else {
      if (typeof chunk !== "string")
        throw Error("Unexpected PTY protocol write");
      text += chunk;
    }
  }
  return { text, focus, cpr };
}

function windowsCprContext(session) {
  return session.cprTrace || session.cprTraceError !== undefined
    ? {
        output: session.output,
        outputTruncated: session.outputTruncated,
        captureError: session.cprTraceError,
        trace: session.cprTrace?.snapshot(),
      }
    : undefined;
}

function assertWindowsInteraction(
  writes,
  offset,
  insertText,
  runText,
  cprContext,
  end = writes.length,
) {
  const expected =
    insertText +
    "\r" +
    runText +
    "\r\r" +
    runText +
    "\u0003" +
    insertText +
    "\rSNIPPETS_PING\r";
  const classified = classifyWindowsWrites(writes, offset, cprContext, end);
  assert.equal(
    classified.text,
    expected,
    "complete interaction has no extra input",
  );
  return {
    expected,
    nonFocus: classified.text,
    focus: classified.focus,
    cpr: classified.cpr,
  };
}

// node-pty delivers decoded strings. This is selected PTY output, not an
// independent recording of child stdin or write provenance.
function snapshotWindowsPtyOutput(session) {
  assert.equal(typeof session.output, "string");
  assert.equal(typeof session.outputTruncated, "boolean");
  assert.ok(Number.isSafeInteger(session.outputLimitCodeUnits));
  assert.ok(session.outputLimitCodeUnits > 0);
  assert.ok(session.output.length <= session.outputLimitCodeUnits);
  return {
    observation: "selected-pty-output-before-input-cleanup",
    text: session.output,
    truncated: session.outputTruncated,
    limitCodeUnits: session.outputLimitCodeUnits,
  };
}

async function retainWindowsPtyEvidence(
  evidence,
  session,
  checks,
  childOutput,
  captureError,
  checkpointErrors,
  cprTrace,
  cprTraceError,
) {
  await writeFile(
    path.join(evidence, "pty-writes.json"),
    JSON.stringify(
      {
        classification: "synthetic-pty-writes-not-qualification",
        pid: session.pid,
        writes: session.writes,
        checks,
        childOutput,
        ...(captureError
          ? { childOutputCaptureError: String(captureError) }
          : {}),
        ...(cprTrace ? { cprTrace } : {}),
        ...(cprTraceError !== undefined
          ? { cprTraceCaptureError: String(cprTraceError) }
          : {}),
        ...checkpointErrors,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
}

function diagnosticBoolean(read) {
  try {
    const value = read();
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

async function withGestureRelease(action, release) {
  let failed = false;
  let failure;
  try {
    return await action();
  } catch (error) {
    failed = true;
    failure = error;
    throw error;
  } finally {
    try {
      await release();
    } catch (error) {
      if (failed && error !== failure)
        throw new AggregateError(
          [failure, error],
          "Gesture and release failed",
        );
      throw error;
    }
  }
}

async function finalizeScenarioInput(
  quartz,
  windowsInput,
  scenarioFailed,
  scenarioFailure,
) {
  try {
    await quartz?.close();
    windowsInput?.close({ scenarioFailed });
  } catch (error) {
    if (scenarioFailed) {
      if (
        error === scenarioFailure ||
        (scenarioFailure instanceof AggregateError &&
          scenarioFailure.errors.includes(error))
      )
        throw scenarioFailure;
      throw new AggregateError(
        [scenarioFailure, error],
        "Scenario and input cleanup failed",
      );
    }
    throw error;
  }
}

async function runScenario({
  window,
  fixture,
  ptys,
  children,
  approvalCount,
  archiveSha256,
  fixtureProcesses,
  windowsProbeReady,
  windowsProbeSnapshot,
  readinessTraceFailures,
  insertDiagnostic,
}) {
  const observeFirstInsert = fixture.memoryInput
    ? require("./snippets-memory-input.cjs").observeFirstInsert
    : undefined;
  const catalogPath = path.join(fixture.root, "config/omxterm/snippets.yaml");
  const originalCatalog = await readFile(catalogPath, "utf8");
  assert.deepEqual(JSON.parse(originalCatalog), catalog);
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const visibleCanvas =
    "[...document.querySelectorAll('.terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0)";
  const until = async (check, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Timed out: ${label}`);
  };
  const click = (contents, selector) =>
    contents.executeJavaScript(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled || e.closest('[inert], [hidden]')) throw Error('Unavailable control'); e.click(); })()`,
    );
  const button = (contents, text) =>
    contents.executeJavaScript(
      `(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent === ${JSON.stringify(text)} && !e.closest('[hidden]')); if (!e || e.disabled) throw Error('Unavailable button'); e.click(); })()`,
    );
  const menu = (label) => {
    // Keep Node-only helpers and early failure diagnostics independent of Electron.
    const { Menu } = require("electron");
    const find = (items) => {
      for (const item of items) {
        if (item.label.replace(/…$/, "") === label) return item;
        const nested = item.submenu && find(item.submenu.items);
        if (nested) return nested;
      }
    };
    const item = find(Menu.getApplicationMenu().items);
    assert.ok(item, label);
    item.click(item, window, {});
  };
  const hosted = () =>
    require("electron")
      .webContents.getAllWebContents()
      .filter(
        (v) => !v.isDestroyed() && v.getURL().startsWith("omx-extension://"),
      );
  const checks = [];
  const nativeKeys = [];
  const windowsWriteChecks = [];
  let quartz;
  let windowsInput;
  let scenarioFailure;
  let scenarioFailed = false;
  let diagnosticView;
  let diagnosticNative;
  let diagnosticClickDispatched = false;
  let childInputCheckpointError;
  let childInputCheckpointSidecarError;
  let readinessSession;
  let readinessIdentity;
  let childOutput = null;
  let childOutputCaptureError;
  let childCprTrace;
  let childCprTraceError;
  const captureChildOutput = () => {
    if (process.platform !== "win32" || !fixture.evidence || !readinessSession)
      return;
    try {
      childOutput = snapshotWindowsPtyOutput(readinessSession);
      childCprTrace = readinessSession.cprTrace?.snapshot();
      childCprTraceError = readinessSession.cprTraceError;
    } catch (error) {
      childOutputCaptureError = error;
    }
  };
  const identity = (pid) => {
    assert.ok(typeof fixtureProcesses === "function");
    assert.ok(Number.isSafeInteger(pid) && pid > 0, "live process PID");
    const record = fixtureProcesses().find((row) => row.pid === pid);
    assert.ok(record && record.identity && record.identity !== "exited");
    return record;
  };
  const observeInput = (target) => (event, input) => {
    nativeKeys.push({
      target,
      type: input.type,
      key: input.key,
      code: input.code,
      repeat: input.isAutoRepeat,
      prevented: event.defaultPrevented,
    });
  };
  core.on("before-input-event", observeInput("core"));
  try {
    window.focus();
    await until(() => js(`!!(${visibleCanvas})`), "live Surface");
    await until(
      () =>
        ptys.length === 1 &&
        ptys[0].output.length > 0 &&
        (process.platform !== "win32" || ptys[0].pid > 0),
      "live PTY",
    );
    const session = ptys[0];
    readinessSession = session;
    const ptyIdentity =
      process.platform === "win32" ? identity(session.pid) : undefined;
    readinessIdentity = ptyIdentity;
    let backendIdentity;
    let retirementIdentity;
    // POSIX package adapters start the account shell (often with bracketed paste).
    // Enter a controlled POSIX shell through ordinary terminal input, never
    // through the observer or a product injection API. Its output establishes
    // plain-paste mode before the exact-byte scenario shared with source runs.
    await until(
      async () =>
        core.isFocused() &&
        (await js("!!document.activeElement?.closest('.terminal-surface')")),
      "initial terminal focus",
    );
    if (process.platform !== "win32") {
      await core.insertText(
        controlledPosixShellCommand(fixture.controlledPlainShell === true),
      );
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    }
    await until(
      () => session.output.includes("\u001b[?2004lSNIPPETS_SHELL_READY\r\n"),
      "controlled shell emitted plain-paste mode",
    );
    const waitForWindowsProbe = async () => {
      if (process.platform !== "win32") return;
      assert.equal(typeof windowsProbeReady, "function");
      const wait = () =>
        until(
          () => windowsProbeReady(core, session),
          "controlled Windows probe renderer readiness",
        );
      await wait();
      if (fixture.readinessDiagnostic)
        throw Error("SNIPPETS_READINESS_DIAGNOSTIC_STOP_AFTER_PREDICATE");
      await js(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      await wait();
    };
    await waitForWindowsProbe();
    await js(`window.__snippetsCanvas = ${visibleCanvas}`);
    assert.equal(
      await js("document.querySelectorAll('.snippets-view').length"),
      0,
      "built-in omitted",
    );
    menu("Toggle Snippets");
    await until(
      () =>
        js(
          "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && document.querySelector('.settings-snippets-notice')?.hidden === false",
        ),
      "absent package opens Extensions guidance",
    );
    assert.equal(children.length, 0, "guidance never activates code");
    checks.push("absent-package-management-no-activation");
    await button(core, "Install local .omxext…");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('generation 1') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "ordinary installation",
    );
    assert.equal(approvalCount(), 1);
    assert.equal(children.length, 0, "installation dormant");
    await click(core, ".settings-close");
    menu("Toggle Snippets");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        )),
      "installed catalog",
    );
    let view = hosted()[0];
    view.on("before-input-event", observeInput("child"));
    assert.equal(
      await view.executeJavaScript("document.documentElement.lang"),
      "en-US",
    );
    let native = window.contentView.children.find(
      (child) => child.webContents === view,
    );
    assert.ok(native);
    // Native hide/core focus precede the IPC ACK and renderer Hide commit.
    const panelHidden = async () =>
      !native.getVisible() &&
      core.isFocused() &&
      (await js(
        "document.querySelector('.auxiliary-panel')?.hidden === true && !!document.activeElement?.closest('.terminal-surface')",
      ));
    await until(
      () =>
        native.getVisible() && view.isFocused() && native.getBounds().width > 0,
      "presented native child",
    );
    await view.executeJavaScript(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    if (fixture.evidence) {
      await writeFile(
        path.join(fixture.evidence, "installed-child.png"),
        (await view.capturePage()).toPNG(),
      );
      await writeFile(
        path.join(fixture.evidence, "installed-core.png"),
        (await core.capturePage()).toPNG(),
      );
    }
    assert.equal(children.length, 1);
    if (ptyIdentity) backendIdentity = identity(children[0].pid);
    async function closeAndReopen(action) {
      const previous = view;
      const previousNative = native;
      const previousId = view.id;
      const backend = children[0];
      await view.executeJavaScript(
        "const search = document.querySelector('input[type=search]'); search.value = 'discard-on-close'; search.dispatchEvent(new Event('input', {bubbles:true}));",
      );
      let destroyed = false;
      previous.once("destroyed", () => {
        destroyed = true;
      });
      await action();
      await until(
        async () =>
          destroyed &&
          previous.isDestroyed() &&
          !window.contentView.children.includes(previousNative) &&
          hosted().length === 0 &&
          core.isFocused() &&
          (await js(
            "document.querySelector('.auxiliary-panel').hidden && ![...document.querySelectorAll('.auxiliary-tools button')].some(b => b.textContent === 'Snippets') && !!document.activeElement?.closest('.terminal-surface')",
          )),
        "Close destroys Snippets and returns native terminal focus",
      );
      menu("Toggle Snippets");
      await until(
        async () =>
          hosted().length === 1 &&
          (await hosted()[0].executeJavaScript(
            "document.querySelectorAll('.snippet-activate').length === 2 && document.querySelector('input[type=search]').value === ''",
          )),
        "fresh Snippets catalog without discarded search",
      );
      view = hosted()[0];
      native = window.contentView.children.find(
        (child) => child.webContents === view,
      );
      assert.ok(native);
      assert.notEqual(view, previous);
      assert.notEqual(view.id, previousId);
      assert.notEqual(native, previousNative);
      view.on("before-input-event", observeInput("child"));
      await until(
        () => native.getVisible() && view.isFocused(),
        "fresh native Snippets focus",
      );
      assert.equal(children.length, 1);
      assert.equal(children[0], backend);
      assert.equal(backend.closed, false);
      assert.equal(backend.exit, null);
      assert.equal(ptys.length, 1);
      assert.equal(session.exited, false);
      assert.equal(
        await js(`window.__snippetsCanvas === (${visibleCanvas})`),
        true,
      );
      assert.equal(await readFile(catalogPath, "utf8"), originalCatalog);
    }
    await closeAndReopen(() => menu("Toggle Snippets"));
    await closeAndReopen(() => click(core, ".auxiliary-close"));
    checks.push(
      "selected-visible-toggle-and-header-close-destroy-fresh-view-same-backend-catalog-PTY",
    );
    await view.executeJavaScript(
      "window.__snippetsSearch = document.querySelector('input[type=search]'); window.__snippetsSearch.value = 'Exact run'; window.__snippetsSearch.dispatchEvent(new Event('input', {bubbles:true}));",
    );
    await click(core, ".auxiliary-hide");
    await until(panelHidden, "Hide retains native Snippets");
    menu("Toggle Auxiliary Panel");
    await until(
      () => native.getVisible() && view.isFocused(),
      "independent panel reveal",
    );
    assert.equal(hosted()[0], view);
    assert.equal(hosted().length, 1);
    assert.equal(
      await view.executeJavaScript(
        "window.__snippetsSearch === document.querySelector('input[type=search]') && window.__snippetsSearch.value === 'Exact run'",
      ),
      true,
    );
    menu("Toggle Auxiliary Panel");
    await until(panelHidden, "independent panel hide");
    menu("Toggle Snippets");
    await until(
      () => native.getVisible() && view.isFocused(),
      "hidden tool action reveals retained Snippets",
    );
    await view.executeJavaScript(
      "window.__snippetsSearch.value = ''; window.__snippetsSearch.dispatchEvent(new Event('input', {bubbles:true}));",
    );
    await until(
      () =>
        view.executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        ),
      "unfiltered retained catalog",
    );
    checks.push("ordinary-archive-trust-enabled-activation");
    checks.push(
      "explicit-hide-independent-panel-toggle-retains-exact-view-query",
    );
    const terminalFocus = () =>
      until(
        async () =>
          core.isFocused() &&
          (await js("!!document.activeElement?.closest('.terminal-surface')")),
        "native terminal focus",
      );
    const open = async () => {
      // Hide first: selected-visible tool activation now destroys, not hides.
      if (native.getVisible()) {
        await click(core, ".auxiliary-hide");
        await until(panelHidden, "Hide acknowledged before reveal");
      }
      menu("Toggle Snippets");
      await until(
        () => native.getVisible() && view.isFocused(),
        "native child focus",
      );
      await until(
        () =>
          view.executeJavaScript(
            "document.querySelectorAll('.snippet-activate').length === 2",
          ),
        "catalog reload",
      );
    };
    const drain = () => new Promise((resolve) => setTimeout(resolve, 150));
    const receiptCount = (marker) => {
      assert.notEqual(session.outputTruncated, true, "probe output retained");
      return countWindowsProbeReceipts(session.output, marker);
    };
    const assertWrites = async (offset, expected) => {
      const observed = () =>
        process.platform === "win32"
          ? classifyWindowsWrites(
              session.writes,
              offset,
              windowsCprContext(session),
            ).text
          : session.writes.slice(offset).join("");
      assert.equal(
        session.output.match(/\u001b\[\?2004[hl]/g)?.at(-1),
        "\u001b[?2004l",
        "controlled shell retains plain-paste mode",
      );
      await until(() => observed() === expected, "exact PTY bytes");
      await drain();
      assert.equal(observed(), expected, "no delayed repeat/release leakage");
      if (process.platform === "win32") {
        const classified = classifyWindowsWrites(
          session.writes,
          offset,
          windowsCprContext(session),
        );
        windowsWriteChecks.push({
          offset,
          end: session.writes.length,
          expected,
          nonFocus: classified.text,
          focus: classified.focus,
          cpr: classified.cpr,
        });
      }
    };
    await waitForWindowsProbe();
    let offset = session.writes.length;
    const interactionStart = offset;
    if (insertDiagnostic) {
      diagnosticView = view;
      diagnosticNative = native;
      insertDiagnostic.checkpoint({
        session,
        expected: insert,
        viewId: view.id,
        coreId: core.id,
        focusBefore: {
          view: diagnosticBoolean(() => view.isFocused()),
          core: diagnosticBoolean(() => core.isFocused()),
          visible: diagnosticBoolean(() => native.getVisible()),
          window: diagnosticBoolean(() => window.isFocused()),
        },
      });
    }
    if (
      fixture.evidence &&
      (insertDiagnostic ||
        (process.platform === "win32" && fixture.childInputCapture === true))
    ) {
      try {
        const checkpointPath = path.join(
          fixture.evidence,
          "child-input-checkpoint.json",
        );
        const checkpoint = JSON.stringify({
          classification: "synthetic-child-input-diagnostic-not-qualification",
          phase: "before-first-insert-click",
          pid: session.pid,
          writeOffset: offset,
        });
        // The capture-only path avoids an additional event-loop yield before
        // the ordinary click; synchronous evidence I/O can still perturb timing.
        if (insertDiagnostic)
          await writeFile(checkpointPath, checkpoint, { flag: "wx" });
        else
          require("node:fs").writeFileSync(checkpointPath, checkpoint, {
            flag: "wx",
          });
      } catch (error) {
        childInputCheckpointError = String(error);
        try {
          await writeFile(
            path.join(fixture.evidence, "child-input-checkpoint-error.json"),
            JSON.stringify({
              classification:
                "synthetic-child-input-diagnostic-not-qualification",
              phase: "before-first-insert-click",
              error: childInputCheckpointError,
            }),
            { flag: "wx" },
          );
        } catch (sidecarError) {
          childInputCheckpointSidecarError = String(sidecarError);
        }
      }
    }
    const firstInsert = async () => {
      await click(view, "li:first-child .snippet-activate");
      diagnosticClickDispatched = true;
      await terminalFocus();
      await assertWrites(offset, insert);
      if (process.platform === "win32") {
        await until(
          () => receiptCount("SNIPPETS_INSERT_DRAFT_RECEIPT") === 1,
          "controlled probe observed first Insert",
        );
        assert.equal(
          classifyWindowsWrites(
            session.writes,
            offset,
            windowsCprContext(session),
          ).text,
          insert,
          "no delayed input before explicit Enter",
        );
        await until(
          () => receiptCount("SNIPPETS_INSERT_RECEIPT") !== null,
          "complete controlled probe receipt output",
        );
        assert.equal(
          receiptCount("SNIPPETS_INSERT_RECEIPT"),
          0,
          "Insert has not executed",
        );
      }
    };
    if (fixture.memoryInput) {
      const memoryDiagnostic = await observeFirstInsert({
        observe: firstInsert,
        snapshot: () => ({
          output: snapshotWindowsPtyOutput(session),
          writes: [...session.writes],
          checks: [...windowsWriteChecks],
        }),
        evidence: fixture.evidence,
        pid: session.pid,
        nonce: fixture.memoryInput,
      });
      return {
        memoryDiagnostic,
        identities: [ptyIdentity, backendIdentity],
        checks,
        archiveSha256,
        approvals: approvalCount(),
      };
    }
    await firstInsert();
    if (insertDiagnostic) {
      await until(
        () => receiptCount("SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED") === 1,
        "controlled probe observed first Insert",
      );
      throw Error("SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES");
    }
    const explicitEnterOffset = session.writes.length;
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    if (process.platform === "win32")
      await assertWrites(explicitEnterOffset, "\r");
    await until(
      () =>
        process.platform === "win32"
          ? receiptCount("SNIPPETS_INSERT_RECEIPT") === 1
          : /\r?\nSNIPPETS_INSERT_RECEIPT\r?\n/.test(session.output),
      "shell executed exact insert after explicit Enter",
    );
    await open();
    offset = session.writes.length;
    await view.executeJavaScript(
      "document.querySelector('li:last-child .snippet-activate').focus()",
    );
    await view.executeJavaScript(
      `window.__activationEvents = []; for (const type of ['keydown', 'keypress', 'click']) document.addEventListener(type, event => window.__activationEvents.push({ type, key: event.key, trusted: event.isTrusted }), true);`,
    );
    const gestureStart = nativeKeys.length;
    // Both platforms retain synthetic OS input across native focus handoff.
    // Neither API submission nor a constant key-up query is release evidence.
    if (process.platform === "darwin") {
      const { openQuartzInput } = require("./snippets-quartz.cjs");
      quartz = await openQuartzInput({
        manifest: fixture.quartzTool,
        root: fixture.root,
        evidence: fixture.evidence,
      });
      await quartz.down();
    } else if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot;
      assert.ok(
        systemRoot && path.isAbsolute(systemRoot),
        "Windows system root",
      );
      const { openWindowsInput } = require("./snippets-windows-input.cjs");
      windowsInput = openWindowsInput({
        executable: path.join(
          systemRoot,
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        script: path.join(fixture.root, "snippets-windows-input.ps1"),
        marker: fixture.inputMarker,
        handle: window.getNativeWindowHandle().readBigUInt64LE().toString(),
        owner: process.pid,
      });
      windowsInput.down();
    } else execFileSync("/usr/bin/xdotool", ["keydown", "Return"]);
    await withGestureRelease(
      async () => {
        await terminalFocus();
        if (quartz) await quartz.repeat();
        if (windowsInput) windowsInput.repeat();
        await until(
          () =>
            nativeKeys
              .slice(gestureStart)
              .some(
                (input) =>
                  input.target === "core" &&
                  input.type === "keyDown" &&
                  input.key === "Enter" &&
                  input.repeat,
              ),
          "native held Enter autorepeat",
        );
      },
      async () => {
        if (quartz) await quartz.up();
        else if (windowsInput) windowsInput.up();
        else execFileSync("/usr/bin/xdotool", ["keyup", "Return"]);
      },
    );
    const activationEvents = await view.executeJavaScript(
      "window.__activationEvents",
    );
    assert.ok(
      activationEvents.some((event) => event.type === "click" && event.trusted),
    );
    if (fixture.evidence)
      await writeFile(
        path.join(fixture.evidence, "activation-events.json"),
        JSON.stringify(activationEvents, null, 2),
      );
    // Electron can omit keyUp after prevented autorepeat on both platforms,
    // independently reproduced without OMXTerm. Observe OS release instead;
    // retain exact PTY isolation and the next fresh Enter as product oracles.
    let released;
    if (process.platform === "darwin" || windowsInput) {
      released = windowsInput
        ? "Windows independent session held-to-up observed"
        : "Quartz targeted release and session held-to-up observed";
      assert.ok(
        nativeKeys
          .slice(gestureStart)
          .some(
            (input) =>
              input.target === "child" &&
              input.type === "keyDown" &&
              input.key === "Enter" &&
              !input.repeat &&
              !input.prevented,
          ),
        "native child Enter activation",
      );
    } else {
      released = execFileSync(
        "/usr/bin/python3",
        [
          "-c",
          `import ctypes
x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XKeysymToKeycode.restype = ctypes.c_ubyte
x.XQueryKeymap.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
if not d: raise SystemExit('Cannot open X display')
code = x.XKeysymToKeycode(d, 0xff0d)
keys = (ctypes.c_ubyte * 32)()
x.XQueryKeymap(d, keys)
x.XCloseDisplay(d)
if not code or keys[code // 8] & (1 << (code % 8)): raise SystemExit('Enter still held')
print('Enter released')`,
        ],
        { encoding: "utf8" },
      ).trim();
      assert.equal(released, "Enter released");
    }
    await assertWrites(offset, run + "\r");
    if (process.platform === "win32")
      await until(
        () => receiptCount("SNIPPETS_RUN_RECEIPT") === 1,
        "controlled probe received exact Run",
      );
    if (quartz || windowsInput)
      assert.ok(
        nativeKeys
          .slice(gestureStart)
          .filter(
            (input) =>
              input.target === "core" &&
              input.type === "keyUp" &&
              input.key === "Enter",
          )
          .every((input) => input.prevented),
        "any delivered held release is consumed",
      );
    assert.ok(
      nativeKeys
        .slice(gestureStart)
        .some(
          (input) =>
            input.target === "core" &&
            input.type === "keyDown" &&
            input.key === "Enter" &&
            input.repeat &&
            input.prevented,
        ),
      "Chromium delivered a native repeat",
    );
    // The next fresh gesture must not remain swallowed by the old owner.
    const freshOffset = session.writes.length;
    if (quartz) {
      const freshKeyStart = nativeKeys.length;
      await quartz.down();
      await until(
        () =>
          nativeKeys
            .slice(freshKeyStart)
            .some(
              (input) =>
                input.target === "core" &&
                input.type === "keyDown" &&
                input.key === "Enter" &&
                !input.repeat &&
                !input.prevented,
            ),
        "fresh native core Enter",
      );
      await quartz.up();
    } else if (windowsInput) {
      const freshKeyStart = nativeKeys.length;
      windowsInput.down();
      await until(
        () =>
          nativeKeys
            .slice(freshKeyStart)
            .some(
              (input) =>
                input.target === "core" &&
                input.type === "keyDown" &&
                input.key === "Enter" &&
                !input.repeat &&
                !input.prevented,
            ),
        "fresh native core Enter",
      );
      windowsInput.up();
    } else execFileSync("/usr/bin/xdotool", ["key", "Return"]);
    await assertWrites(freshOffset, "\r");
    if (process.platform === "win32") {
      assert.equal(receiptCount("SNIPPETS_INSERT_RECEIPT"), 1);
      assert.equal(receiptCount("SNIPPETS_RUN_RECEIPT"), 1);
    }
    await quartz?.close();
    if (fixture.evidence)
      await writeFile(
        path.join(fixture.evidence, "native-keys.json"),
        JSON.stringify(
          { nativeKeys, released, windows: windowsInput?.observations },
          null,
          2,
        ),
      );
    await until(
      () =>
        process.platform === "win32"
          ? receiptCount("SNIPPETS_RUN_RECEIPT") === 1
          : /\r?\nSNIPPETS_RUN_RECEIPT\r?\n/.test(session.output),
      "shell executed Run",
    );
    checks.push("exact-insert-run-native-enter-repeat-release");
    await open();
    offset = session.writes.length;
    let runDraftBefore = 0;
    if (process.platform === "win32")
      await until(() => {
        const count = receiptCount("SNIPPETS_RUN_DRAFT_RECEIPT");
        if (count === null) return false;
        runDraftBefore = count;
        return true;
      }, "complete prior Run draft receipt output");
    await click(view, "li:last-child .snippet-preview-open");
    await until(
      () => js("!!document.querySelector('.snippet-preview[open]')"),
      "preview",
    );
    assert.equal(native.getVisible(), false, "overlay excludes native child");
    assert.equal(
      await js("document.querySelector('.snippet-preview-body').textContent"),
      run,
    );
    async function capturePreview() {
      // An open dialog is DOM readiness, not a render opportunity. Match the
      // child/Files capture barrier without claiming compositor/pixel freshness.
      // The existing native supervisor/inspector deadline bounds stalled frames.
      await core.executeJavaScript(`(async () => {
        const dialog = document.querySelector('.snippet-preview[open]');
        const body = dialog?.querySelector('.snippet-preview-body');
        const check = () => {
          if (!dialog?.isConnected || !dialog.open ||
              document.querySelector('.snippet-preview[open]') !== dialog ||
              dialog.querySelector('.snippet-preview-body') !== body ||
              body?.textContent !== ${JSON.stringify(run)})
            throw Error('Snippets preview changed before capture');
        };
        check();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        check();
      })()`);
      assert.equal(native.getVisible(), false, "overlay excludes native child");
      return core.capturePage();
    }
    if (fixture.evidence)
      await writeFile(
        path.join(fixture.evidence, "preview.png"),
        (await capturePreview()).toPNG(),
      );
    await click(core, ".snippet-preview-insert");
    await terminalFocus();
    await assertWrites(offset, run);
    if (process.platform === "win32") {
      await until(
        () => receiptCount("SNIPPETS_RUN_DRAFT_RECEIPT") === runDraftBefore + 1,
        "controlled probe received preview Insert",
      );
      assert.equal(
        classifyWindowsWrites(
          session.writes,
          offset,
          windowsCprContext(session),
        ).text,
        run,
      );
    }
    // Clear the unsubmitted draft using ordinary terminal input.
    core.sendInputEvent({
      type: "keyDown",
      keyCode: "C",
      modifiers: ["control"],
    });
    core.sendInputEvent({
      type: "keyUp",
      keyCode: "C",
      modifiers: ["control"],
    });
    if (windowsInput)
      await until(
        () => receiptCount("SNIPPETS_DRAFT_CLEARED") === 1,
        "probe cleared draft",
      );
    await open();
    offset = session.writes.length;
    await click(view, "li:first-child .snippet-preview-open");
    await until(
      () => js("!!document.querySelector('.snippet-preview[open]')"),
      "cancel preview",
    );
    await click(core, ".snippet-preview-cancel");
    await until(
      async () =>
        view.isFocused() &&
        (await view.executeJavaScript(
          "document.activeElement === document.querySelector('li:first-child .snippet-preview-open')",
        )),
      "cancel initiating control focus",
    );
    await drain();
    if (process.platform === "win32") {
      const classified = classifyWindowsWrites(
        session.writes,
        offset,
        windowsCprContext(session),
      );
      assert.equal(classified.text, "");
      windowsWriteChecks.push({
        offset,
        end: session.writes.length,
        expected: "",
        nonFocus: classified.text,
        focus: classified.focus,
        cpr: classified.cpr,
      });
    } else assert.equal(session.writes.slice(offset).join(""), "");
    await click(view, "li:first-child .snippet-preview-open");
    await until(
      () => js("!!document.querySelector('.snippet-preview[open]')"),
      "Run override preview",
    );
    offset = session.writes.length;
    await click(core, ".snippet-preview-run");
    await terminalFocus();
    await assertWrites(offset, insert + "\r");
    if (process.platform === "win32") {
      await until(
        () => receiptCount("SNIPPETS_INSERT_RECEIPT") === 2,
        "controlled probe received preview Run",
      );
      assert.equal(receiptCount("SNIPPETS_RUN_RECEIPT"), 1);
    }
    await open();
    checks.push("preview-overrides-both-intents-cancel-restores-focus");
    await view.executeJavaScript(
      "const search = document.querySelector('input[type=search]'); search.value = 'Exact run'; search.dispatchEvent(new Event('input', { bubbles: true }));",
    );
    await click(core, ".auxiliary-hide");
    await until(() => !native.getVisible(), "search Hide acknowledged");
    menu("Toggle Auxiliary Panel");
    await until(
      async () =>
        native.getVisible() &&
        (await view.executeJavaScript(
          "document.querySelector('input').value === 'Exact run' && document.querySelectorAll('.snippet-activate').length === 1",
        )),
      "retained search after activation",
    );
    assert.equal(hosted()[0], view);
    checks.push("retained-search-hide-reactivate");
    // Commit via the real Settings language control, not the hosted bridge.
    menu("Settings");
    await until(
      () =>
        js(
          "[...document.querySelectorAll('.settings-dialog select')].some(s => !s.disabled && [...s.options].some(o => o.value === 'pt-BR'))",
        ),
      "ready language Settings control",
    );
    await js(
      `(() => { const select = [...document.querySelectorAll('.settings-dialog select')].find(s => [...s.options].some(o => o.value === 'pt-BR')); if (!select) throw Error('Missing language selector'); select.value = 'pt-BR'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await until(
      () => view.executeJavaScript("document.documentElement.lang === 'pt-BR'"),
      "committed Portuguese",
    );
    assert.equal(
      await view.executeJavaScript(
        "document.querySelector('.snippet-intent').textContent",
      ),
      "Executar · adiciona Enter",
    );
    assert.equal(
      await view.executeJavaScript("document.querySelector('input').value"),
      "Exact run",
    );
    await js(
      `(() => { const select = [...document.querySelectorAll('.settings-dialog select')].find(s => [...s.options].some(o => o.value === 'en-US')); select.value = 'en-US'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await until(
      () =>
        view.executeJavaScript(
          "document.documentElement.lang === 'en-US' && document.querySelector('.snippet-intent').textContent === 'Run · adds Enter'",
        ),
      "English restored",
    );
    checks.push("live-en-US-pt-BR-retained-query");
    await button(core, "Extensions");
    await button(core, "Disable");
    await until(
      () => hosted().length === 0 && children[0].closed,
      "joined retirement",
    );
    assert.deepEqual(children[0].exit, { code: 0, signal: null });
    await click(core, ".settings-close");
    menu("Toggle Snippets");
    await until(
      () =>
        js(
          "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && document.querySelector('.extensions-panel')?.textContent.includes('disabled') && document.querySelector('.settings-snippets-notice')?.hidden === false",
        ),
      "disabled package guidance without re-enabling",
    );
    assert.equal(
      children.length,
      1,
      "disabled guidance never starts another backend",
    );
    checks.push("disabled-package-management-no-enable");
    await button(core, "Uninstall");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
        ),
      "uninstalled",
    );
    assert.equal(await readFile(catalogPath, "utf8"), originalCatalog);
    await click(core, ".settings-close");
    await terminalFocus();
    assert.equal(ptys.length, 1);
    assert.equal(session.exited, false);
    if (ptyIdentity) {
      retirementIdentity = identity(session.pid);
      assert.deepEqual(retirementIdentity, ptyIdentity);
    }
    assert.equal(
      await js(`window.__snippetsCanvas === (${visibleCanvas})`),
      true,
    );
    if (process.platform === "win32") {
      assert.equal(receiptCount("SNIPPETS_INSERT_RECEIPT"), 2);
      assert.equal(receiptCount("SNIPPETS_RUN_RECEIPT"), 1);
    }
    await core.insertText(
      process.platform === "win32"
        ? "SNIPPETS_PING"
        : "printf '%s\\n' 'SNIPPETS_AFTER_RETIREMENT'",
    );
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      () =>
        process.platform === "win32"
          ? receiptCount("SNIPPETS_AFTER_RETIREMENT") === 1
          : /\r?\nSNIPPETS_AFTER_RETIREMENT\r?\n/.test(session.output),
      "same session usable after retirement",
    );
    if (process.platform === "win32") {
      await drain();
      const checked = assertWindowsInteraction(
        session.writes,
        interactionStart,
        insert,
        run,
        windowsCprContext(session),
      );
      windowsWriteChecks.push({
        offset: interactionStart,
        end: session.writes.length,
        ...checked,
      });
      assert.equal(receiptCount("SNIPPETS_INSERT_RECEIPT"), 2);
      assert.equal(receiptCount("SNIPPETS_RUN_RECEIPT"), 1);
      assert.equal(receiptCount("SNIPPETS_AFTER_RETIREMENT"), 1);
    }
    checks.push("disable-uninstall-unchanged-catalog-live-surface-pty");
    return {
      checks,
      archiveSha256,
      approvals: approvalCount(),
      ...(ptyIdentity
        ? { identities: [ptyIdentity, backendIdentity], retirementIdentity }
        : {}),
      input:
        process.platform === "darwin"
          ? "synthetic Quartz session input; tagged OS release and held-state observation; controlled native consent; production macOS ARM64 composition"
          : process.platform === "win32"
            ? "synthetic Windows SendInput; independently observed held/released state; controlled native consent and ConPTY probe; production Windows ARM64 composition"
            : `synthetic Chromium/X11; controlled native consent; production Linux ${process.arch === "arm64" ? "ARM64" : "x64"} composition`,
    };
  } catch (error) {
    scenarioFailed = true;
    scenarioFailure = error;
    captureChildOutput();
    if (
      process.platform === "win32" &&
      fixture.evidence &&
      fixture.readinessDiagnostic
    ) {
      let snapshot;
      let snapshotError;
      let traceError;
      let readyError;
      let traceFailures = null;
      let readinessAtSnapshot = null;
      try {
        if (typeof windowsProbeSnapshot !== "function")
          throw Error("Readiness snapshot unavailable");
        snapshot = windowsProbeSnapshot(core, readinessSession);
      } catch (captureError) {
        snapshotError = String(captureError);
      }
      try {
        if (typeof readinessTraceFailures === "function")
          traceFailures = readinessTraceFailures();
      } catch (captureError) {
        traceError = String(captureError);
      }
      try {
        if (typeof windowsProbeReady === "function") {
          const value = windowsProbeReady(core, readinessSession);
          readinessAtSnapshot = typeof value === "boolean" ? value : null;
        }
      } catch (captureError) {
        readyError = String(captureError);
      }
      try {
        await writeFile(
          path.join(fixture.evidence, "readiness-diagnostic.json"),
          JSON.stringify(
            {
              ...snapshot,
              classification: "startup-readiness-diagnostic-not-qualification",
              error: String(error),
              ptyIdentity: readinessIdentity ?? null,
              readinessAtSnapshot,
              traceFailures,
              ...(snapshotError ? { snapshotError } : {}),
              ...(traceError ? { traceError } : {}),
              ...(readyError ? { readyError } : {}),
            },
            null,
            2,
          ),
          { flag: "wx" },
        );
      } catch {
        process.stderr.write(
          "Synthetic readiness diagnostic capture unavailable\n",
        );
      }
    }
    if (fixture.evidence && insertDiagnostic && diagnosticView) {
      try {
        await writeFile(
          path.join(fixture.evidence, "insert-diagnostic.json"),
          JSON.stringify(
            {
              ...insertDiagnostic.snapshot(),
              error: String(error),
              clickDispatched: diagnosticClickDispatched,
              ...(childInputCheckpointError
                ? { childInputCheckpointError }
                : {}),
              ...(childInputCheckpointSidecarError
                ? { childInputCheckpointSidecarError }
                : {}),
              focusAfter: {
                view: diagnosticBoolean(() => diagnosticView.isFocused()),
                core: diagnosticBoolean(() => core.isFocused()),
                visible: diagnosticBoolean(() => diagnosticNative.getVisible()),
                window: diagnosticBoolean(() => window.isFocused()),
              },
            },
            null,
            2,
          ),
          { flag: "wx" },
        );
      } catch {
        process.stderr.write(
          "Synthetic insert diagnostic capture unavailable\n",
        );
      }
    }
    if (fixture.evidence) {
      try {
        await writeFile(
          path.join(fixture.evidence, "failure.png"),
          (await core.capturePage()).toPNG(),
        );
      } catch {
        // Diagnostics must not replace the scenario failure.
      }
      try {
        await writeFile(
          path.join(fixture.evidence, "failure.json"),
          JSON.stringify(
            {
              error: String(error),
              checks,
              nativeKeys,
              windowsInput: windowsInput?.observations,
              core: await js("document.body.outerHTML"),
              children: await Promise.all(
                hosted().map(async (view) => ({
                  url: view.getURL(),
                  html: await view.executeJavaScript("document.body.outerHTML"),
                })),
              ),
            },
            null,
            2,
          ),
        );
      } catch {
        // The durable input marker remains independent of this capture.
      }
    }
    throw error;
  } finally {
    if (!scenarioFailed) captureChildOutput();
    let cleanupFailure;
    try {
      await finalizeScenarioInput(
        quartz,
        windowsInput,
        scenarioFailed,
        scenarioFailure,
      );
    } catch (error) {
      cleanupFailure = error;
    }
    let evidenceFailure = childOutputCaptureError;
    if (childCprTraceError !== undefined) {
      const error = Error(`CPR observation unavailable: ${childCprTraceError}`);
      evidenceFailure = evidenceFailure
        ? new AggregateError([evidenceFailure, error], "PTY observation failed")
        : error;
    }
    if (process.platform === "win32" && fixture.evidence && readinessSession) {
      try {
        await retainWindowsPtyEvidence(
          fixture.evidence,
          readinessSession,
          windowsWriteChecks,
          childOutput,
          childOutputCaptureError,
          {
            ...(childInputCheckpointError ? { childInputCheckpointError } : {}),
            ...(childInputCheckpointSidecarError
              ? { childInputCheckpointSidecarError }
              : {}),
          },
          childCprTrace,
          childCprTraceError,
        );
      } catch (error) {
        evidenceFailure = evidenceFailure
          ? new AggregateError(
              [evidenceFailure, error],
              "PTY capture and persistence failed",
            )
          : error;
      }
    }
    if (cleanupFailure) {
      if (evidenceFailure)
        throw new AggregateError(
          [cleanupFailure, evidenceFailure],
          "Input cleanup and PTY evidence failed",
        );
      throw cleanupFailure;
    }
    if (evidenceFailure) {
      if (scenarioFailed)
        throw new AggregateError(
          [scenarioFailure, evidenceFailure],
          "Scenario and PTY evidence failed",
        );
      throw evidenceFailure;
    }
  }
}
module.exports = {
  controlledPosixShellCommand,
  countWindowsProbeReceipts,
  runScenario,
  withGestureRelease,
  finalizeScenarioInput,
  snapshotWindowsPtyOutput,
  retainWindowsPtyEvidence,
  classifyWindowsWrites,
  assertWindowsInteraction,
};
