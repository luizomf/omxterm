// Bounded production UI update on the exact stable Linux ARM64 host.
const assert = require("node:assert/strict");
const { readFile, writeFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { identity, alive } = require("./snippets-process-identity.cjs");

// The focused Surface is the selected terminal whose PTY is exercised below.
function selectedScenarioCanvas(document, expected) {
  const surface = document.activeElement?.closest(".terminal-surface");
  if (!surface || !surface.isConnected || surface.closest("[hidden], [inert]"))
    throw Error("focused scenario Surface unavailable");
  const visible = (node) => {
    for (let current = node; current; current = current.parentElement) {
      const style = document.defaultView.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const canvases = [...surface.querySelectorAll("canvas")].filter(visible);
  if (
    canvases.length !== 1 ||
    (expected &&
      (surface !== expected.surface || canvases[0] !== expected.canvas))
  )
    throw Error("focused scenario Surface or canvas changed");
  return { surface, canvas: canvases[0] };
}

// Serialized into the core renderer. Refuse ambiguous, hidden or disabled cards.
function selectUpdate(document) {
  const cards = [
    ...document.querySelectorAll(".extensions-panel .extension-catalog-card"),
  ].filter(
    (card) =>
      card.querySelector("h4")?.textContent ===
      "Snippets — Linux, macOS and Windows ARM64 preview · 0.1.1",
  );
  if (cards.length !== 1) throw Error("exact Snippets update card unavailable");
  const buttons = [...cards[0].querySelectorAll("button")];
  if (
    buttons.length !== 1 ||
    buttons[0].textContent !== "Update" ||
    buttons[0].disabled ||
    buttons[0].closest("[hidden], [inert]") ||
    !buttons[0].getClientRects().length
  )
    throw Error("Snippets Update unavailable");
  for (const element of [cards[0].querySelector("h4"), buttons[0]]) {
    for (let node = element; node; node = node.parentElement) {
      const style = document.defaultView.getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        throw Error("hidden Snippets Update");
    }
  }
  return buttons[0];
}

function namedButton(document, selector, labels) {
  const buttons = [...document.querySelectorAll(selector)].filter(
    (button) =>
      labels.includes(button.textContent) &&
      !button.closest("[hidden], [inert]"),
  );
  if (
    buttons.length !== 1 ||
    buttons[0].disabled ||
    !buttons[0].getClientRects().length
  )
    return null;
  return buttons[0];
}

function managementState(document, version, generation, local) {
  const rows = [
    ...document.querySelectorAll(".extensions-panel section"),
  ].filter((row) =>
    [...row.querySelectorAll(":scope > p")].some((p) =>
      p.textContent.startsWith("omxterm.snippets · generation "),
    ),
  );
  if (rows.length !== 1 || rows[0].closest("[hidden], [inert]")) return false;
  return (
    rows[0].querySelector(":scope > h3")?.textContent ===
      `Snippets · ${version}` &&
    [...rows[0].querySelectorAll(":scope > p")].some(
      (p) =>
        p.textContent ===
        `omxterm.snippets · generation ${generation} · enabled · local ${local} · other instances unknown`,
    )
  );
}

// The small sequence is separately testable without a browser or Electron.
async function runUpdateSteps(steps) {
  const checks = [];
  await steps.installBaseline();
  checks.push("local-baseline-generation-1");
  await steps.activateBaseline();
  checks.push("baseline-activated");
  await steps.publicUpdate();
  checks.push("public-update-retired-dormant-generation-2");
  await steps.activateUpdateAndCheckTerminal();
  checks.push("fresh-activation-same-terminal-yaml");
  return checks;
}

async function runPublicUpdate({
  window,
  fixture,
  ptys,
  children,
  approvalCount,
  beginPublicUpdate,
  publicSummary,
}) {
  const { Menu, webContents } = require("electron");
  const yamlPath = path.join(fixture.root, "config/omxterm/snippets.yaml");
  const yaml = await readFile(yamlPath);
  assert.deepEqual(
    JSON.parse(yaml.toString("utf8")),
    require("./snippets-catalog.json"),
  );
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const until = async (check, label, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Timed out: ${label}`);
  };
  const click = (selector) =>
    js(
      `(() => { const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]; const b = nodes[0]; if (nodes.length !== 1 || b.disabled || b.closest('[hidden], [inert]') || !b.getClientRects().length) throw Error('Unavailable control'); b.click(); })()`,
    );
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
        (v) => !v.isDestroyed() && v.getURL().startsWith("omx-extension://"),
      );
  const state = (version, generation, local) =>
    js(
      `(${managementState.toString()})(document, ${JSON.stringify(version)}, ${generation}, ${JSON.stringify(local)})`,
    );
  const focusTerminal = () =>
    until(
      async () =>
        core.isFocused() &&
        (await js("!!document.activeElement?.closest('.terminal-surface')")),
      "terminal focus",
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
          "(() => { const b = document.querySelector('#settings-tab-extensions'); return !!b && !b.disabled && !!b.getClientRects().length; })()",
        ),
      "Extensions control",
    );
    await click("#settings-tab-extensions");
    await until(
      () =>
        js(
          "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true'",
        ),
      "Extensions selected",
    );
  };
  const openTool = async () => {
    await click(".settings-close");
    await focusTerminal();
    menu("Toggle Snippets");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        )),
      "hosted Snippets",
    );
    const view = hosted()[0];
    const native = window.contentView.children.find(
      (child) => child.webContents === view,
    );
    assert.ok(native);
    await until(
      () =>
        native.getVisible() && view.isFocused() && native.getBounds().width > 0,
      "presented Snippets",
    );
    return view;
  };
  window.focus();
  await until(
    () => ptys.length === 1 && ptys[0].output.length > 0,
    "scenario PTY",
  );
  const session = ptys[0];
  const ptyIdentity = identity(session.pid);
  assert.ok(ptyIdentity && alive(ptyIdentity));
  await focusTerminal();
  await js(
    `window.__snippetsUpdateSurface = (${selectedScenarioCanvas.toString()})(document); true`,
  );
  const checkShell = async (name) => {
    const marker = path.join(fixture.root, name);
    const quoted = "'" + marker.replaceAll("'", "'\\''") + "'";
    await core.insertText(`printf '%s' "$$" > ${quoted}`);
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      async () =>
        (await readFile(marker, "utf8").catch(() => "")) ===
        String(session.pid),
      "same PTY shell response",
    );
  };
  await checkShell("before-update-shell.txt");
  let oldView;
  let oldBackend;
  const checks = await runUpdateSteps({
    async installBaseline() {
      menu("Toggle Snippets");
      await until(
        () =>
          js(
            "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true'",
          ),
        "absent package guidance",
      );
      const button = `(${namedButton.toString()})(document, '.extensions-panel button', ['Install local .omxext…'])`;
      await until(() => js(`!!${button}`), "local install control");
      await js(
        `(() => { const b = ${button}; if (!b) throw Error('Local install unavailable'); b.click(); })()`,
      );
      await until(() => state("0.1.0", 1, "dormant"), "baseline generation 1");
      assert.equal(approvalCount(), 1);
      assert.equal(children.length, 0);
      assert.equal(hosted().length, 0);
    },
    async activateBaseline() {
      oldView = await openTool();
      assert.equal(children.length, 1);
      oldBackend = identity(children[0].pid);
      assert.ok(oldBackend && alive(oldBackend));
    },
    async publicUpdate() {
      beginPublicUpdate(fixture.catalogSha256);
      await settings();
      await until(
        () => state("0.1.0", 1, "active"),
        "active baseline management",
      );
      const button = `(${namedButton.toString()})(document, '.extension-catalog button', ['Browse official extensions', 'Refresh catalog'])`;
      await until(() => js(`!!${button}`), "catalog control");
      await js(
        `(() => { const b = ${button}; if (!b) throw Error('Catalog control unavailable'); b.click(); })()`,
      );
      await until(
        () =>
          js(
            "document.querySelector('.extension-catalog [role=status]')?.textContent.includes('Catalog loaded.')",
          ),
        "public catalog",
        65000,
      );
      const selector = `(${selectUpdate.toString()})(document)`;
      await until(
        () =>
          js(
            `(() => { try { return !!${selector}; } catch { return false; } })()`,
          ),
        "Update control",
      );
      // Reuse the bounded capture seam: it retains the dialog, selected page,
      // card, heading and action through scroll, frames, screenshot and click.
      await require("./ssh-packaged.cjs").catalogInstall(
        core,
        "Snippets — Linux, macOS and Windows ARM64 preview · 0.1.1",
        "Update",
        (image) =>
          writeFileSync(
            path.join(fixture.evidence, "public-update-card.png"),
            image.toPNG(),
            { flag: "wx" },
          ),
        true,
      );
      await until(
        () => state("0.1.1", 2, "dormant"),
        "updated generation 2 dormant",
        65000,
      );
      await until(
        () => hosted().length === 0 && children[0].closed,
        "old backend retired",
      );
      assert.deepEqual(children[0].exit, { code: 0, signal: null });
      assert.equal(alive(oldBackend), false);
      assert.equal(children.length, 1);
      assert.equal(approvalCount(), 2);
      const binding = publicSummary();
      assert.equal(binding.catalogGeneration, 1);
      assert.equal(binding.approvals, 1);
      assert.equal(binding.installed, 1);
      assert.equal(binding.attempts.length, 1);
      await writeFile(
        path.join(fixture.evidence, "public-update-binding.json"),
        JSON.stringify(binding, null, 2),
        { flag: "wx" },
      );
    },
    async activateUpdateAndCheckTerminal() {
      const newView = await openTool();
      assert.notEqual(newView, oldView);
      assert.equal(children.length, 2);
      const nextBackend = identity(children[1].pid);
      assert.ok(nextBackend && alive(nextBackend));
      assert.notEqual(nextBackend.pid, oldBackend.pid);
      assert.deepEqual(await readFile(yamlPath), yaml);
      // Hide via the independent panel toggle, then prove the same shell accepts input.
      menu("Toggle Auxiliary Panel");
      await focusTerminal();
      await js(
        `(() => { if (!window.__snippetsUpdateSurface) throw Error('scenario Surface capture missing'); (${selectedScenarioCanvas.toString()})(document, window.__snippetsUpdateSurface); })()`,
      );
      assert.equal(ptys.length, 1);
      assert.equal(session.exited, false);
      assert.equal(alive(ptyIdentity), true);
      await checkShell("after-update-shell.txt");
      assert.deepEqual(await readFile(yamlPath), yaml);
      assert.equal(alive(ptyIdentity), true);
    },
  });
  return {
    checks,
    approvals: approvalCount(),
    input:
      "synthetic Chromium/X11; controlled consent; production Linux ARM64 public update",
  };
}
module.exports = {
  selectUpdate,
  selectedScenarioCanvas,
  namedButton,
  managementState,
  runUpdateSteps,
  runPublicUpdate,
};
