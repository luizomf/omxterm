// Public Windows checkpoint. This only drives production UI and observes PTY data.
const assert = require("node:assert/strict");
const {
  classifyWindowsWrites,
  countWindowsProbeReceipts,
} = require("./snippets-scenario.cjs");

// Serialized into the actual core renderer. The catalog UI exposes a title and
// version, not an ID; the captured Official consent independently binds the ID.
function selectPublicCatalogAction(document, action) {
  const title = "Snippets — Linux, macOS and Windows ARM64 preview · 0.1.0";
  const cards = [
    ...document.querySelectorAll(".extensions-panel .extension-catalog-card"),
  ].filter((card) => card.querySelector("h4")?.textContent === title);
  if (cards.length !== 1)
    throw Error("exact Snippets catalog card unavailable");
  const card = cards[0];
  const buttons = [...card.querySelectorAll("button")];
  if (
    buttons.length !== 1 ||
    buttons[0].textContent !== action ||
    buttons[0].disabled
  )
    throw Error("exact Snippets catalog action unavailable");
  const button = buttons[0];
  for (let node = button; node; node = node.parentElement) {
    const style = document.defaultView.getComputedStyle(node);
    if (
      node.hasAttribute("hidden") ||
      node.hasAttribute("inert") ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    )
      throw Error("hidden or inert Snippets catalog action");
  }
  const bounds = button.getBoundingClientRect();
  if (
    !button.isConnected ||
    button.getClientRects().length === 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw Error("invisible Snippets catalog action");
  return button;
}

function inspectPublicInput(session, offset, expected, run, ping) {
  assert.equal(session.outputTruncated, false, "controlled output retained");
  assert.ok(session.cprTrace, "CPR trace required");
  const classified = classifyWindowsWrites(session.writes, offset, {
    output: session.output,
    outputTruncated: session.outputTruncated,
    captureError: session.cprTraceError,
    trace: session.cprTrace.snapshot(),
  });
  assert.equal(classified.text, expected, "exact public interaction bytes");
  assert.equal(
    countWindowsProbeReceipts(session.output, "SNIPPETS_RUN_RECEIPT"),
    run,
    "exact Run receipts",
  );
  assert.equal(
    countWindowsProbeReceipts(session.output, "SNIPPETS_AFTER_RETIREMENT"),
    ping,
    "exact Ping receipts",
  );
  return {
    expected,
    nonFocus: classified.text,
    focus: classified.focus,
    cpr: classified.cpr,
  };
}

// Management rows are distinct from catalog cards, which may be incompatible.
function managementState(document, generation, installed, local, action) {
  const rows = [
    ...document.querySelectorAll(".extensions-panel section"),
  ].filter((row) =>
    [...row.querySelectorAll(":scope > p")].some((p) =>
      p.textContent.startsWith("omxterm.snippets · generation "),
    ),
  );
  if (rows.length !== 1 || rows[0].closest("[hidden], [inert]")) return false;
  for (let node = rows[0]; node; node = node.parentElement) {
    const style = document.defaultView.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    )
      return false;
  }
  const text = [...rows[0].querySelectorAll(":scope > p")].find((p) =>
    p.textContent.startsWith("omxterm.snippets · generation "),
  )?.textContent;
  if (
    text !==
    `omxterm.snippets · generation ${generation} · ${installed} · local ${local} · other instances unknown`
  )
    return false;
  const nonCatalog = [
    ...document.querySelectorAll(".extensions-panel button"),
  ].filter(
    (button) =>
      !button.closest(".extension-catalog-card") &&
      !button.closest("[hidden], [inert]"),
  );
  if (nonCatalog.some((button) => button.disabled)) return false;
  return (
    !action ||
    [...rows[0].querySelectorAll("button")].filter(
      (button) =>
        button.textContent === action &&
        !button.disabled &&
        !button.closest("[hidden], [inert]"),
    ).length === 1
  );
}

function clickManagementAction(document, action) {
  const rows = [
    ...document.querySelectorAll(".extensions-panel section"),
  ].filter((row) =>
    [...row.querySelectorAll(":scope > p")].some((p) =>
      p.textContent.startsWith("omxterm.snippets · generation "),
    ),
  );
  if (rows.length !== 1)
    throw Error("exact Snippets management row unavailable");
  const buttons = [...rows[0].querySelectorAll("button")].filter(
    (button) => button.textContent === action,
  );
  if (
    buttons.length !== 1 ||
    buttons[0].disabled ||
    buttons[0].closest("[hidden], [inert]") ||
    buttons[0].getClientRects().length === 0
  )
    throw Error("Snippets management action unavailable");
  for (let node = buttons[0]; node; node = node.parentElement) {
    const style = document.defaultView.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    )
      throw Error("hidden management action");
  }
  buttons[0].click();
}

async function runPublicScenario({
  window,
  fixture,
  ptys,
  children,
  approvalCount,
  archiveSha256,
  fixtureProcesses,
  windowsProbeReady,
}) {
  const { Menu, webContents } = require("electron");
  const { readFile, writeFile } = require("node:fs/promises");
  const path = require("node:path");
  const {
    snapshotWindowsPtyOutput,
    retainWindowsPtyEvidence,
  } = require("./snippets-scenario.cjs");
  const digest =
    "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
  assert.equal(fixture.publicCatalog, true);
  assert.equal(archiveSha256, digest);
  assert.equal(fixture.archiveSha256, digest);
  assert.equal(typeof windowsProbeReady, "function");
  assert.equal(typeof fixtureProcesses, "function");
  const yamlPath = path.join(fixture.root, "config/omxterm/snippets.yaml");
  const yaml = await readFile(yamlPath, "utf8");
  assert.deepEqual(
    JSON.parse(yaml),
    require("./snippets-windows-catalog.json"),
  );
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const canvas =
    "[...document.querySelectorAll('.terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0)";
  const until = async (check, label, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Timed out: ${label}`);
  };
  const menu = (label) => {
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
    webContents
      .getAllWebContents()
      .filter(
        (view) =>
          !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
      );
  const identity = (pid) => {
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    const rows = fixtureProcesses().filter((row) => row.pid === pid);
    assert.equal(rows.length, 1, "unique live process");
    assert.ok(
      rows[0].identity && rows[0].identity !== "exited",
      "creation identity",
    );
    return rows[0];
  };
  const capture = async (contents, name) => {
    if (!fixture.evidence) return;
    const image = await contents.capturePage();
    assert.equal(image.isEmpty(), false, `capture ${name}`);
    await writeFile(path.join(fixture.evidence, name), image.toPNG(), {
      flag: "wx",
    });
  };
  const click = (contents, selector) =>
    contents.executeJavaScript(
      `(() => { const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]; if (nodes.length !== 1 || nodes[0].disabled || nodes[0].closest('[hidden], [inert]') || !nodes[0].getClientRects().length) throw Error('Unavailable control'); nodes[0].click(); })()`,
    );
  const button = async (text) => {
    await until(
      () =>
        js(
          `(() => { const nodes = [...document.querySelectorAll('.extensions-panel button')].filter(b => b.textContent === ${JSON.stringify(text)} && !b.closest('[hidden], [inert]')); return nodes.length === 1 && !nodes[0].disabled && nodes[0].getClientRects().length > 0; })()`,
        ),
      `Extensions button ${text} ready`,
    );
    return js(
      `(() => { const nodes = [...document.querySelectorAll('.extensions-panel button')].filter(b => b.textContent === ${JSON.stringify(text)} && !b.closest('[hidden], [inert]')); if (nodes.length !== 1 || nodes[0].disabled || !nodes[0].getClientRects().length) throw Error('Unavailable button'); nodes[0].click(); })()`,
    );
  };
  const focused = () =>
    until(
      async () =>
        core.isFocused() &&
        (await js("!!document.activeElement?.closest('.terminal-surface')")),
      "original terminal focus",
    );
  const settings = async () => {
    menu("Settings");
    await until(
      () => js("!!document.querySelector('.settings-dialog')"),
      "Settings",
    );
    await until(
      () =>
        js(
          "(() => { const nodes = [...document.querySelectorAll('#settings-tab-extensions')]; const button = nodes[0]; return nodes.length === 1 && !button.disabled && !button.closest('[hidden], [inert]') && button.getClientRects().length > 0; })()",
        ),
      "Settings Extensions control ready",
    );
    await click(core, "#settings-tab-extensions");
    await until(
      () =>
        js(
          "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && !!document.querySelector('.extensions-panel')",
        ),
      "Extensions selected",
    );
  };
  const management = (generation, installed, local, action) =>
    js(
      `(${managementState.toString()})(document, ${generation}, ${JSON.stringify(installed)}, ${JSON.stringify(local)}, ${JSON.stringify(action)})`,
    );
  const manage = (action) =>
    js(
      `(${clickManagementAction.toString()})(document, ${JSON.stringify(action)})`,
    );
  const browseCatalog = async () => {
    await button("Browse official extensions");
    await until(
      () =>
        js(
          "document.querySelector('.extension-catalog [role=status]')?.textContent.includes('Catalog loaded.') && [...document.querySelectorAll('.extension-catalog button')].some(b => b.textContent === 'Refresh catalog' && !b.disabled)",
        ),
      "public catalog loaded",
      65000,
    );
  };
  const catalogAction = async (action) => {
    const selector = `(${selectPublicCatalogAction.toString()})(document, ${JSON.stringify(action)})`;
    await js(
      `(() => { const b = ${selector}; b.closest('.extension-catalog-card').scrollIntoView({block:'center'}); })()`,
    );
    await js(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await js(`!!${selector}`);
    await capture(core, `public-catalog-${action.toLowerCase()}.png`);
    await js(`(${selector}).click()`);
  };
  const waitReady = async (session) => {
    await until(
      () => windowsProbeReady(core, session),
      "controlled probe ACK and modes",
    );
    await js(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await until(
      () => windowsProbeReady(core, session),
      "controlled probe ACK and modes after frames",
    );
  };
  const checks = [];
  const writeChecks = [];
  let session;
  let finalInput;
  let scenarioError;
  try {
    window.focus();
    await until(() => js(`!!(${canvas})`), "live Surface");
    await until(
      () => ptys.length === 1 && ptys[0].pid > 0 && ptys[0].output.length > 0,
      "initial ConPTY",
    );
    session = ptys[0];
    const ptyIdentity = identity(session.pid);
    await focused();
    await until(
      () => session.output.includes("\u001b[?2004lSNIPPETS_SHELL_READY\r\n"),
      "plain paste marker",
    );
    await waitReady(session);
    await js(`window.__snippetsPublicCanvas = ${canvas}`);
    const start = session.writes.length;
    const assertInput = (expected, run, ping) => {
      assert.equal(
        session.output.match(/\u001b\[\?2004[hl]/g)?.at(-1),
        "\u001b[?2004l",
        "plain-paste mode retained",
      );
      const checked = inspectPublicInput(session, start, expected, run, ping);
      writeChecks.push({
        offset: start,
        end: session.writes.length,
        ...checked,
      });
    };
    assertInput("", 0, 0);
    assert.equal(children.length, 0);
    await settings();
    await browseCatalog();
    await catalogAction("Install");
    await until(
      () => management(1, "enabled", "dormant", "Disable"),
      "generation 1 dormant",
      65000,
    );
    assert.equal(approvalCount(), 1);
    assert.equal(children.length, 0, "install remains dormant");
    assert.equal(hosted().length, 0);
    await capture(core, "public-install-management.png");
    checks.push("public-catalog-install-official-trust-dormant");
    await click(core, ".settings-close");
    await focused();
    menu("Toggle Snippets");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        )),
      "first Snippets activation",
    );
    const view = hosted()[0];
    const native = window.contentView.children.find(
      (item) => item.webContents === view,
    );
    assert.ok(native);
    await until(
      () =>
        native.getVisible() && view.isFocused() && native.getBounds().width > 0,
      "presented Snippets child",
    );
    await view.executeJavaScript(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    assert.equal(children.length, 1);
    const backend1 = identity(children[0].pid);
    await capture(view, "public-active-child.png");
    await capture(core, "public-active-core.png");
    await waitReady(session);
    assertInput("", 0, 0);
    await click(view, "li:last-child .snippet-activate");
    await focused();
    await until(() => {
      const count = countWindowsProbeReceipts(
        session.output,
        "SNIPPETS_RUN_RECEIPT",
      );
      assert.ok(count === null || count <= 1, "duplicate Run child receipt");
      return count === 1;
    }, "single Run child receipt");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertInput("SNIPPETS_RUN\r", 1, 0);
    checks.push("explicit-toggle-exact-run-child-receipt");
    await settings();
    await browseCatalog();
    await catalogAction("Reinstall");
    await until(
      () => management(2, "enabled", "dormant", "Disable"),
      "generation 2 dormant",
      65000,
    );
    await until(
      () => hosted().length === 0 && children[0].closed,
      "first backend retired",
    );
    assert.ok(children[0].exit);
    assert.equal(children[0].exit.code, 0);
    assert.equal(children[0].exit.signal, null);
    assert.equal(children.length, 1, "reinstall remains dormant");
    assert.equal(approvalCount(), 2);
    assert.ok(
      !fixtureProcesses().some(
        (row) => row.pid === backend1.pid && row.identity === backend1.identity,
      ),
    );
    assertInput("SNIPPETS_RUN\r", 1, 0);
    await capture(core, "public-reinstall-management.png");
    checks.push("public-reinstall-old-backend-joined-dormant");
    await click(core, ".settings-close");
    await focused();
    menu("Toggle Snippets");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        )),
      "second Snippets activation",
    );
    assert.equal(children.length, 2);
    const backend2 = identity(children[1].pid);
    const second = hosted()[0];
    const secondNative = window.contentView.children.find(
      (item) => item.webContents === second,
    );
    assert.ok(secondNative);
    await until(
      () =>
        secondNative.getVisible() &&
        second.isFocused() &&
        secondNative.getBounds().width > 0,
      "second presented Snippets child",
    );
    await settings();
    await until(
      () => management(2, "enabled", "active", "Disable"),
      "active generation 2 management",
    );
    await manage("Disable");
    await until(
      () => management(3, "disabled", "dormant", "Enable"),
      "disabled generation 3",
    );
    await until(
      () => hosted().length === 0 && children[1].closed,
      "second backend retired",
    );
    assert.ok(children[1].exit);
    assert.equal(children[1].exit.code, 0);
    assert.equal(children[1].exit.signal, null);
    assert.ok(
      !fixtureProcesses().some(
        (row) => row.pid === backend2.pid && row.identity === backend2.identity,
      ),
    );
    await manage("Enable");
    await until(
      () => management(4, "enabled", "dormant", "Disable"),
      "enabled generation 4 remains dormant",
    );
    assert.equal(children.length, 2);
    assert.equal(hosted().length, 0);
    await manage("Uninstall");
    await until(
      () => management(5, "uninstalled", "dormant", null),
      "uninstalled generation 5",
    );
    assert.equal(await readFile(yamlPath, "utf8"), yaml);
    await capture(core, "public-uninstall-management.png");
    checks.push("disable-enable-uninstall-unchanged-catalog");
    await click(core, ".settings-close");
    await focused();
    assert.equal(ptys.length, 1);
    assert.equal(session.exited, false);
    const retirementIdentity = identity(session.pid);
    assert.deepEqual(retirementIdentity, ptyIdentity);
    assert.equal(
      await js(`window.__snippetsPublicCanvas === (${canvas})`),
      true,
    );
    assertInput("SNIPPETS_RUN\r", 1, 0);
    await core.insertText("SNIPPETS_PING");
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(() => {
      const count = countWindowsProbeReceipts(
        session.output,
        "SNIPPETS_AFTER_RETIREMENT",
      );
      assert.ok(count === null || count <= 1, "duplicate Ping child receipt");
      return count === 1;
    }, "same ConPTY Ping receipt");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertInput("SNIPPETS_RUN\rSNIPPETS_PING\r", 1, 1);
    assert.equal(await readFile(yamlPath, "utf8"), yaml);
    await capture(core, "public-terminal-after.png");
    assertInput("SNIPPETS_RUN\rSNIPPETS_PING\r", 1, 1);
    assert.equal(session.exited, false);
    assert.deepEqual(identity(session.pid), ptyIdentity);
    assert.equal(
      await js(`window.__snippetsPublicCanvas === (${canvas})`),
      true,
    );
    assert.equal(await readFile(yamlPath, "utf8"), yaml);
    checks.push("same-surface-pty-usable-before-quit");
    finalInput = () => assertInput("SNIPPETS_RUN\rSNIPPETS_PING\r", 1, 1);
    return {
      checks,
      archiveSha256,
      approvals: approvalCount(),
      input:
        "synthetic Chromium input; controlled Official consent and Node ConPTY probe; production public HTTPS",
      identities: [ptyIdentity, backend1, backend2],
      retirementIdentity,
    };
  } catch (error) {
    scenarioError = error;
    throw error;
  } finally {
    if (fixture.evidence && session) {
      let finalError;
      try {
        if (!scenarioError) finalInput();
      } catch (error) {
        finalError = error;
      }
      try {
        await retainWindowsPtyEvidence(
          fixture.evidence,
          session,
          writeChecks,
          snapshotWindowsPtyOutput(session),
          undefined,
          {},
          session.cprTrace?.snapshot(),
          session.cprTraceError,
        );
      } catch (error) {
        if (scenarioError || finalError)
          throw new AggregateError(
            [scenarioError || finalError, error],
            "Public scenario and evidence failed",
          );
        throw error;
      }
      if (finalError) throw finalError;
    }
  }
}

module.exports = {
  runPublicScenario,
  selectPublicCatalogAction,
  managementState,
  inspectPublicInput,
};
