// Opt-in production-source geometry qualification. No network SSH, Files
// mutation campaign, catalog requests, shortcut campaign or package qualification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { screen } = require("electron");
const {
  projectedBounds,
  assertMove,
  assertSaved,
  assertComplete,
} = require("./companion-placement-contract.cjs");
const { inputOwner } = require("./companion-placement-input.cjs");
async function runPlacement(s) {
  const {
    core,
    window,
    js,
    menu,
    until,
    hosted,
    settings,
    closeSettings,
    click,
    children,
    ptys,
    options,
    checks,
    dialog,
    identity,
    alive,
  } = s;
  assert.equal(options.placement, true);
  assert.ok(options.source && options.filesArchive);
  const results = [];
  const receipt = { complete: false, results, failures: [] };
  const save = () =>
    fs.writeFileSync(
      path.join(options.evidence, "placement-scenario.json"),
      JSON.stringify(receipt, null, 2),
    );
  const record = (group, observations) => {
    results.push({ group, passed: true, ...observations });
    save();
  };
  const input = inputOwner(options.evidence);
  const configPath = path.join(options.root, "config/omxterm/config.json");
  const readConfig = () => JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rawPath = path.join(options.root, "ssh-live-input.bin");
  const raw = () =>
    fs.existsSync(rawPath) ? fs.readFileSync(rawPath, "utf8") : "";
  const native = (view) =>
    window.contentView.children.find((v) => v.webContents === view);
  const visible = (view, expected) =>
    until(
      () => !view.isDestroyed() && native(view)?.getVisible() === expected,
      "native visibility",
    );
  const rectScript = (selector) =>
    `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0); if (!e) throw Error('Missing visible allocation'); const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()`;
  const slot = () => js(rectScript(".companion-native-slot"));
  const panel = () => js(rectScript(".auxiliary-panel"));
  async function side(expected) {
    await until(async () => {
      const p = await panel();
      const t = await js(rectScript("#terminal-tabs"));
      return expected === "left" ? p.x + p.width <= t.x : t.x + t.width <= p.x;
    }, "shared panel side " + expected);
  }
  async function bounds(view) {
    await until(
      async () =>
        JSON.stringify(native(view)?.getBounds()) ===
        JSON.stringify(
          projectedBounds(
            await slot(),
            core.getZoomFactor(),
            window.getContentSize(),
          ),
        ),
      "native bounds match measured slot",
    );
  }
  async function reload(next) {
    const value = readConfig();
    value.window.auxiliaryPanelSide = next;
    fs.writeFileSync(configPath, JSON.stringify(value));
    menu("Reload User Configuration");
  }
  async function openTool(label, ready) {
    const before = new Set(hosted());
    menu(label);
    await until(
      () => hosted().some((v) => !before.has(v)),
      label + " WebContents",
    );
    const view = hosted().find((v) => !before.has(v));
    await until(() => view.executeJavaScript(ready), label + " ready");
    await visible(view, true);
    return view;
  }
  async function select(label, view) {
    await js(
      `(() => { const b = [...document.querySelectorAll('.auxiliary-tools button')].find(b => b.textContent === ${JSON.stringify(label)}); if (!b) throw Error('Missing tool'); b.click(); })()`,
    );
    await visible(view, true);
    await bounds(view);
  }
  const field = ".quick-connect input";
  const fieldValue = (view) =>
    view.executeJavaScript(
      `document.querySelector(${JSON.stringify(field)}).value`,
    );
  let ssh, files, live, clientLog, backendSet;
  const continuity = async () => {
    assert.ok(alive(live), "same live SSH birth");
    assert.equal(
      fs.readFileSync(
        path.join(options.root, "client-invocations.jsonl"),
        "utf8",
      ),
      clientLog,
      "no client launch replay",
    );
    assert.deepEqual(children, backendSet, "same live extension backends");
    assert.ok(children.every((c) => !c.closed && c.exit === null));
    assert.equal(
      await js(
        "window.__placementCanvas === document.querySelector('.terminal-tab:not([hidden]) .terminal-surface:not([hidden]) canvas') && window.__placementSurface === document.querySelector('.terminal-tab:not([hidden]) .terminal-surface:not([hidden])')",
      ),
      true,
      "same selected Surface",
    );
  };
  async function draft() {
    ssh.focus();
    await ssh.executeJavaScript(
      `(() => { const e = document.querySelector(${JSON.stringify(field)}); window.__placementField = e; e.value = 'placement-draft'; e.focus(); e.setSelectionRange(3, 7); })()`,
    );
    await until(
      () => ssh.isFocused() && !core.isFocused(),
      "native child owns focused draft",
    );
  }
  async function snapshot() {
    return {
      slot: await slot(),
      bounds: native(ssh).getBounds(),
      zoom: core.getZoomFactor(),
      size: window.getContentSize(),
      identity: {
        childId: ssh.id,
        childFocused: ssh.isFocused(),
        coreFocused: core.isFocused(),
        ...(await ssh.executeJavaScript(
          `(() => { const e = document.querySelector(${JSON.stringify(field)}); return { sameField: e === window.__placementField, fieldFocused: e === document.activeElement, value: e.value, start: e.selectionStart, end: e.selectionEnd }; })()`,
        )),
        sameSurface: await js(
          "window.__placementCanvas === document.querySelector('.terminal-tab:not([hidden]) .terminal-surface:not([hidden]) canvas')",
        ),
      },
    };
  }
  function screenPoint(css, childBounds) {
    assert.equal(
      screen.getDisplayMatching(window.getBounds()).scaleFactor,
      1,
      "XTEST lane requires observed 1:1 display scale",
    );
    const origin = window.getContentBounds();
    const zoom = childBounds ? ssh.getZoomFactor() : core.getZoomFactor();
    return {
      x: Math.round(origin.x + (childBounds?.x ?? 0) + css.x * zoom),
      y: Math.round(origin.y + (childBounds?.y ?? 0) + css.y * zoom),
    };
  }
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  async function move(next) {
    await draft();
    const before = await snapshot();
    const oldView = native(ssh);
    const events = [];
    const blurred = () => events.push("blur");
    const oldVisible = oldView.setVisible;
    oldView.setVisible = function (value) {
      events.push(["visible", value]);
      return oldVisible.call(this, value);
    };
    ssh.on("blur", blurred);
    let after;
    try {
      await reload(next);
      await side(next);
      await bounds(ssh);
      await js(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      after = await snapshot();
      assertMove(before, after);
      assert.equal(native(ssh), oldView, "same native view");
      assert.equal(after.identity.sameField, true);
      assert.equal(after.identity.sameSurface, true);
      assert.equal(
        events.includes("blur"),
        false,
        "geometry cannot blur/refocus child",
      );
      assert.equal(
        events.some((e) => Array.isArray(e) && e[1] === false),
        false,
        "geometry cannot hide/show child",
      );
      await continuity();
    } finally {
      oldView.setVisible = oldVisible;
      ssh.removeListener("blur", blurred);
    }
    const rawBefore = raw();
    const valueBefore = await fieldValue(ssh);
    const fieldRect = await ssh.executeJavaScript(rectScript(field));
    const newHit = input.clickAndType(
      screenPoint(center(fieldRect), native(ssh).getBounds()),
    );
    await until(
      async () => (await fieldValue(ssh)).length === valueBefore.length + 1,
      "new native location accepts x",
    );
    assert.equal(raw(), rawBefore, "child hit never reaches terminal");
    assert.equal(ssh.isFocused(), true, "new location owns native child focus");
    assert.equal(core.isFocused(), false);
    const valueAfter = await fieldValue(ssh);
    const terminal = await js(rectScript(".terminal-surface:not([hidden])"));
    const oldPoint = center(before.slot);
    assert.ok(
      oldPoint.x > terminal.x &&
        oldPoint.x < terminal.x + terminal.width &&
        oldPoint.y > terminal.y &&
        oldPoint.y < terminal.y + terminal.height,
      "old child point is now terminal interior",
    );
    const oldHit = input.clickAndType(screenPoint(oldPoint));
    await until(
      () => raw().length >= rawBefore.length + 1,
      "old location terminal input fence",
    );
    assert.equal(raw(), rawBefore + "x", "exact old-location native PTY input");
    assert.equal(core.isFocused(), true, "old location owns native core focus");
    assert.equal(ssh.isFocused(), false);
    assert.equal(
      await fieldValue(ssh),
      valueAfter,
      "old location no longer hits child",
    );
    record("x-only-" + next, {
      before,
      after,
      events,
      newHit,
      oldHit,
      raw: raw(),
    });
  }
  try {
    window.setContentSize(1100, 760);
    core.setZoomFactor(1);
    await closeSettings();
    ssh = await openTool(
      "SSH Connect",
      "!!document.querySelector('.quick-connect input') && !document.querySelector('.quick-connect button').disabled",
    );
    await side("right");
    await ssh.executeJavaScript(
      "document.querySelector('.quick-connect input').value = 'fixture@[2001:db8::7]:2207'; document.querySelector('.quick-connect button').click()",
    );
    await until(
      () => fs.existsSync(path.join(options.root, "ssh-live-ready.json")),
      "one synthetic live client",
    );
    live = JSON.parse(
      fs.readFileSync(path.join(options.root, "ssh-live-ready.json"), "utf8"),
    );
    assert.deepEqual(live.argv, [
      "-l",
      "fixture",
      "-p",
      "2207",
      "--",
      "2001:db8::7",
    ]);
    assert.equal(identity(live.pid)?.start, live.start);
    assert.ok(alive(live));
    ptys.push(live);
    clientLog = fs.readFileSync(
      path.join(options.root, "client-invocations.jsonl"),
      "utf8",
    );
    assert.deepEqual(
      clientLog
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
      [live.argv],
    );
    await until(
      async () =>
        core.isFocused() &&
        (await js(
          "!!document.querySelector('.terminal-tab:not([hidden]) .terminal-surface:not([hidden]) canvas') && document.querySelector('.terminal-tab:not([hidden]) canvas') !== window.__sshPublicCanvas && document.querySelector('#tab-strip [aria-selected=true]')?.textContent.includes('SYNTHETIC-SSH-live') === true",
        )),
      "distinct connected terminal ready and focused",
    );
    await js(
      "window.__placementSurface = document.querySelector('.terminal-tab:not([hidden]) .terminal-surface:not([hidden])'); window.__placementCanvas = window.__placementSurface.querySelector('canvas'); void 0",
    );
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(options.filesArchive))
        .digest("hex"),
      options.filesArchiveSha256,
    );
    await settings();
    const previousOpen = dialog.showOpenDialog,
      previousMessage = dialog.showMessageBox;
    let approvals = 0;
    try {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [options.filesArchive],
      });
      dialog.showMessageBox = async (_owner, prompt) => {
        assert.equal(prompt.title, "Trust extension code?");
        assert.ok(prompt.detail.includes(options.filesArchiveSha256));
        approvals++;
        return { response: 1, checkboxChecked: false };
      };
      await click(core, "Install local .omxext…");
      await until(
        () =>
          js(
            `!![...document.querySelectorAll('.extensions-panel section h3')].find(h => h.textContent === ${JSON.stringify(options.filesTitle)})`,
          ),
        "Files installation",
      );
      assert.equal(approvals, 1);
    } finally {
      dialog.showOpenDialog = previousOpen;
      dialog.showMessageBox = previousMessage;
    }
    await closeSettings();
    files = await openTool(
      "Files",
      "!!document.querySelector('form.location input') && document.querySelector('.entries[role=tree]')?.getAttribute('aria-busy') === 'false' && /^[0-9][0-9,]* visible entr(?:y|ies)(?: · Truncated at 5,000 per folder)?$/.test(document.querySelector('.summary')?.textContent ?? '')",
    );
    await files.executeJavaScript(
      "window.__placementFile = document.querySelector('form.location input'); window.__placementFile.value = 'retained-files';",
    );
    await select("SSH Connect", ssh);
    backendSet = children.map((c) => ({ ...c }));
    assert.equal(children.length, 2);
    const configBefore = readConfig();
    const bytesBefore = fs.readFileSync(configPath, "utf8");
    await settings();
    await closeSettings();
    assert.equal(
      fs.readFileSync(configPath, "utf8"),
      bytesBefore,
      "opening Settings never writes config",
    );
    await settings();
    await visible(ssh, false);
    await visible(files, false);
    await js("document.querySelector('#settings-tab-window').click()");
    const choice =
      "[...document.querySelectorAll('label.settings-row')].find(e => e.querySelector('span')?.textContent === 'Auxiliary panel side')?.querySelector('select')";
    await until(() => js(`!!(${choice})`), "Window side choice");
    assert.equal(await js(`(${choice}).value`), "right");
    await js(
      `(() => { const e = ${choice}; e.value = 'left'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await until(
      () => readConfig().window.auxiliaryPanelSide === "left",
      "saved side",
    );
    await until(
      () =>
        js(
          "document.querySelector('.settings-status')?.textContent === 'Saved.' && !document.querySelector('.settings-status').classList.contains('error')",
        ),
      "successful Settings save",
    );
    assertSaved(configBefore, readConfig(), "left");
    await visible(ssh, false);
    await visible(files, false);
    await closeSettings();
    await side("left");
    await bounds(ssh);
    await settings();
    await js("document.querySelector('#settings-tab-window').click()");
    assert.equal(await js(`(${choice}).value`), "left");
    await closeSettings();
    menu("Reload User Configuration");
    await side("left");
    await bounds(ssh);
    record("settings", {
      saved: readConfig(),
      suspended: true,
      reopened: "left",
    });
    await move("right");
    await move("left");
    await resize();
    core.setZoomFactor(1.25);
    await bounds(ssh);
    await reload("right");
    await side("right");
    await bounds(ssh);
    const zoom = {
      slot: await slot(),
      native: native(ssh).getBounds(),
      zoom: core.getZoomFactor(),
    };
    assert.equal(zoom.zoom, 1.25);
    record("zoom", zoom);
    core.setZoomFactor(1);
    await bounds(ssh);
    await draft();
    menu("Command Palette");
    await until(
      () =>
        js(
          "!!document.querySelector('.command-palette input') && document.querySelector('.command-palette').contains(document.activeElement)",
        ),
      "core overlay owns focus",
    );
    await visible(ssh, false);
    await visible(files, false);
    const overlayShows = [];
    const nativeViews = [native(ssh), native(files)];
    const visibilityMethods = nativeViews.map((v) => v.setVisible);
    nativeViews.forEach((view, index) => {
      view.setVisible = function (value) {
        overlayShows.push(value);
        return visibilityMethods[index].call(this, value);
      };
    });
    try {
      await reload("left");
      // Observe scheduled layout too, not just the synchronous CSS side change.
      await side("left");
      await js(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      assert.equal(native(ssh).getVisible(), false);
      assert.equal(native(files).getVisible(), false);
      assert.equal(
        overlayShows.includes(true),
        false,
        "side update cannot reshow blocked native pixels",
      );
    } finally {
      nativeViews.forEach((view, index) => {
        view.setVisible = visibilityMethods[index];
      });
    }
    core.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await until(
      () => js("!document.querySelector('.command-palette')"),
      "overlay closed",
    );
    await visible(ssh, true);
    await bounds(ssh);
    assert.equal(await fieldValue(ssh), "placement-draft");
    record("overlay", { side: "left", restoredId: ssh.id });
    await select("Files", files);
    await side("left");
    assert.equal(
      await files.executeJavaScript(
        "window.__placementFile === document.querySelector('form.location input') && window.__placementFile.value === 'retained-files'",
      ),
      true,
    );
    await select("SSH Connect", ssh);
    await side("left");
    await js("document.querySelector('.auxiliary-hide').click()");
    await visible(ssh, false);
    menu("Toggle Auxiliary Panel");
    await visible(ssh, true);
    await bounds(ssh);
    assert.equal(await fieldValue(ssh), "placement-draft");
    assert.equal(hosted().length, 2);
    await continuity();
    record("shared-retention", {
      ids: [files.id, ssh.id],
      live,
      backends: backendSet,
      inputReleased: input.assertReleased(),
    });
    assertComplete(results);
    receipt.complete = true;
    checks.push(...results.map((r) => "placement-" + r.group));
  } catch (error) {
    receipt.failures.push(String(error.stack || error));
    throw error;
  } finally {
    save();
  }

  async function resize() {
    const rows = [];
    const separator = "document.querySelector('.auxiliary-separator')";
    const width = async () => (await panel()).width;
    const key = (code) => {
      core.sendInputEvent({ type: "keyDown", keyCode: code });
      core.sendInputEvent({ type: "keyUp", keyCode: code });
    };
    for (const next of ["left", "right"]) {
      await reload(next);
      await side(next);
      await bounds(ssh);
      core.focus();
      await js(`${separator}.focus()`);
      for (const [code, expected] of [
        ["Home", 220],
        [next === "left" ? "Right" : "Left", 230],
        [next === "left" ? "Left" : "Right", 220],
        ["End", 560],
      ]) {
        key(code);
        await until(
          async () => (await width()) === expected,
          "separator " + code,
        );
        await bounds(ssh);
        rows.push({ side: next, key: code, width: await width() });
      }
      key("Home");
      await until(async () => (await width()) === 220, "drag baseline");
      const point = center(await js(rectScript(".auxiliary-separator")));
      point.x = Math.round(point.x);
      point.y = Math.round(point.y);
      const target = { x: point.x + (next === "left" ? 60 : -60), y: point.y };
      core.sendInputEvent({ type: "mouseMove", ...point });
      try {
        core.sendInputEvent({
          type: "mouseDown",
          button: "left",
          clickCount: 1,
          ...point,
        });
        await until(
          () => js(`${separator}.classList.contains('dragging')`),
          "drag captured",
        );
        core.sendInputEvent({
          type: "mouseMove",
          ...target,
          modifiers: ["leftbuttondown"],
        });
        await until(
          async () => (await width()) === 280,
          "physical direction grows",
        );
      } finally {
        core.sendInputEvent({
          type: "mouseUp",
          button: "left",
          clickCount: 1,
          ...target,
        });
      }
      await until(
        () => js(`!${separator}.classList.contains('dragging')`),
        "drag released",
      );
      await bounds(ssh);
      rows.push({ side: next, dragWidth: await width() });
    }
    const point = center(await js(rectScript(".auxiliary-separator")));
    point.x = Math.round(point.x);
    point.y = Math.round(point.y);
    const stableWidth = await width();
    try {
      core.sendInputEvent({
        type: "mouseDown",
        button: "left",
        clickCount: 1,
        ...point,
      });
      await until(
        () => js(`${separator}.classList.contains('dragging')`),
        "side-switch gesture captured",
      );
      await reload("left");
      await side("left");
      await until(
        () => js(`!${separator}.classList.contains('dragging')`),
        "side switch cancels gesture",
      );
      core.sendInputEvent({
        type: "mouseMove",
        x: point.x - 60,
        y: point.y,
        modifiers: ["leftbuttondown"],
      });
      // Fence two animation frames so a queued resize cannot escape this oracle.
      await js(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      assert.equal(
        await width(),
        stableWidth,
        "cancelled gesture cannot resize",
      );
    } finally {
      core.sendInputEvent({
        type: "mouseUp",
        button: "left",
        clickCount: 1,
        ...point,
      });
    }
    await bounds(ssh);
    await continuity();
    record("resize", {
      rows,
      cancelledAcrossSide: true,
      input: "synthetic Chromium separator input",
    });
  }
}
module.exports = { runPlacement };
