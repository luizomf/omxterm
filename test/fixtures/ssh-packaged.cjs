// Main-inspector observer of the untouched package. Only native dialog answers
// are replaced; actions, hosted preload, PTY, renderer and fonts remain real.
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  webContents,
  clipboard,
  desktopCapturer,
} = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
let restore = () => {};
let requestQuit;
function cleanup() {
  restore();
}
async function diagnose() {
  const views = await Promise.all(
    webContents
      .getAllWebContents()
      .filter((view) => !view.isDestroyed())
      .map(async (view) => ({
        url: view.getURL(),
        nativeFocused: view.isFocused(),
        state: await view
          .executeJavaScript(
            "({text:document.body?.innerText, ready:document.readyState, bridge:typeof window.omxHostedContent, visible:document.visibilityState, documentFocused:document.hasFocus(), active:document.activeElement?.outerHTML.slice(0,1000), selected:[...document.querySelectorAll('#tab-strip [aria-selected=true]')].map(e=>e.textContent)})",
          )
          .catch((error) => String(error)),
      })),
  );
  return { ...globalThis.__omxtermPackagedState, views };
}
function abort() {
  app.once("will-quit", cleanup);
  app.quit();
}
function inspect(options) {
  assert.equal(app.isPackaged, true);
  assert.equal(app.getVersion(), options.version);
  assert.equal(app.getAppPath(), options.asar);
  assert.equal(process.execPath, options.executable);
  return {
    packaged: true,
    version: app.getVersion(),
    appPath: app.getAppPath(),
    executable: process.execPath,
    observer: "CommonJS",
  };
}
function identity(pid) {
  try {
    const fields = fs
      .readFileSync(`/proc/${pid}/stat`, "utf8")
      .split(")")
      .at(-1)
      .trim()
      .split(/\s+/);
    return { pid, start: fields[19], state: fields[0] };
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes(error.code)) return null;
    throw error;
  }
}
function alive(record) {
  const current = identity(record.pid);
  return (
    current?.start === record.start && !["Z", "X", "x"].includes(current.state)
  );
}
async function until(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error(`Timed out: ${label}`);
}
async function run(options) {
  inspect(options);
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window);
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const extensionTitle = `SSH Connect · ${options.extensionVersion}`;
  const checks = [];
  const children = [];
  const ptys = [];
  const state = {
    checks,
    children,
    ptys,
    approvals: 0,
    busyClose: 0,
    busyQuit: 0,
  };
  globalThis.__omxtermPackagedState = state;
  const file = (name) => path.join(options.root, name);
  const read = (name) => JSON.parse(fs.readFileSync(file(name), "utf8"));
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(options.evidence, name),
      JSON.stringify(value, null, 2),
    );
  const original = {
    fork: childProcess.fork,
    open: dialog.showOpenDialog,
    message: dialog.showMessageBox,
  };
  restore = () => {
    childProcess.fork = original.fork;
    syncBuiltinESMExports();
    dialog.showOpenDialog = original.open;
    dialog.showMessageBox = original.message;
    clipboard.clear();
  };
  childProcess.fork = (...args) => {
    const child = original.fork(...args);
    if (String(args[0]).endsWith("extension-runtime/bootstrap.mjs")) {
      assert.equal(
        args[0],
        path.join(options.asar, "dist/extension-runtime/bootstrap.mjs"),
      );
      assert.equal(args[2].execPath, options.executable);
      const record = { pid: child.pid, exit: null, closed: false };
      child.once("exit", (code, signal) => {
        record.exit = { code, signal };
      });
      child.once("close", () => {
        record.closed = true;
      });
      children.push(record);
    }
    return child;
  };
  syncBuiltinESMExports();
  dialog.showOpenDialog = async () => {
    assert.notEqual(
      options.catalogMode,
      "public",
      "public smoke cannot fall back to local installation",
    );
    return { canceled: false, filePaths: [options.archive] };
  };
  dialog.showMessageBox = async (_owner, prompt) => {
    if (prompt.title === "Trust extension code?") {
      assert.ok(prompt.detail.includes(options.archiveSha256));
      state.approvals++;
      return { response: 1, checkboxChecked: false };
    }
    if (prompt.title === "Close Tab") {
      state.busyClose++;
      return { response: prompt.cancelId, checkboxChecked: false };
    }
    assert.ok(
      ["Quit OMXTerm", "Sair do OMXTerm"].includes(prompt.title),
      "unexpected dialog",
    );
    state.busyQuit++;
    // Failure recovery can quit before the language checkpoint restores English.
    const response = prompt.buttons.indexOf(
      prompt.title === "Sair do OMXTerm" ? "Sair" : "Quit",
    );
    assert.ok(response >= 0);
    return { response, checkboxChecked: false };
  };
  function menu(label) {
    const find = (items) => {
      for (const item of items) {
        if (item.label.replace(/…$/, "") === label) return item;
        const nested = item.submenu && find(item.submenu.items);
        if (nested) return nested;
      }
    };
    const item = find(Menu.getApplicationMenu().items);
    assert.ok(item?.enabled, `enabled menu ${label}`);
    item.click(item, window, {});
  }
  const hosted = () =>
    webContents
      .getAllWebContents()
      .filter(
        (view) =>
          !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
      );
  const click = (view, label) =>
    view.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]'));
    if (!button || button.disabled || button.closest('[inert]')) throw Error('Unavailable button');
    button.click();
  })()`);
  const key = (view, keyCode) => {
    view.sendInputEvent({ type: "keyDown", keyCode });
    view.sendInputEvent({ type: "keyUp", keyCode });
  };
  async function settings() {
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "Settings",
    );
    await click(core, "Extensions");
    await until(
      () =>
        js(
          // Incompatible catalog cards deliberately keep Install disabled. Only
          // the page's own acquisition controls indicate snapshot readiness.
          "!!document.querySelector('.extensions-panel > .application-page-actions') && ![...document.querySelectorAll('.extensions-panel > .application-page-actions button')].some(b => b.disabled)",
        ),
      "Extensions ready",
    );
  }
  async function closeSettings() {
    await js("document.querySelector('.settings-close').click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed",
    );
  }
  async function selectTab(text) {
    await js(`(() => {
      const tab = [...document.querySelectorAll('#tab-strip [role=tab]')].find(b => b.textContent.includes(${JSON.stringify(text)}));
      if (!tab) throw Error('Tab not found'); tab.click();
    })()`);
    await until(
      () =>
        js(
          `document.querySelector('#tab-strip [role=tab][aria-selected=true]')?.textContent.includes(${JSON.stringify(text)}) === true`,
        ),
      "tab selected",
    );
  }
  // The sole Application Tab deliberately has no strip button.
  const tabCount = () =>
    js(
      "Math.max(1, document.querySelectorAll('#tab-strip [role=tab]').length)",
    );
  async function panel(view, visible, focus) {
    await until(
      async () => {
        const native = window.contentView.children.find(
          (child) => child.webContents === view,
        );
        return (
          !view.isDestroyed() &&
          !!native &&
          native.getVisible() === visible &&
          (await js(
            `document.querySelector('.auxiliary-panel')?.hidden === ${!visible}`,
          )) &&
          (focus === "core"
            ? core.isFocused() && !view.isFocused()
            : focus === "child"
              ? view.isFocused() && !core.isFocused()
              : true)
        );
      },
      `retained panel visible=${visible} native focus=${focus ?? "unchanged"}`,
    );
    assert.equal(hosted().length, 1, "one retained native tool");
    assert.equal(hosted()[0], view, "same native WebContents identity");
  }
  const screenshot = async (name) =>
    fs.writeFileSync(
      path.join(options.evidence, name),
      (await core.capturePage()).toPNG(),
    );
  const configBefore = fs.statSync(file("home/.ssh/config"));
  const shell = read("shell.json");
  ptys.push(identity(shell.probePid));
  assert.ok(ptys[0]);
  window.focus();
  await until(
    () => js("!!document.querySelector('.terminal-surface canvas')"),
    "initial Surface",
  );
  const panelContains = (text) =>
    js(
      `document.querySelector('.extensions-panel')?.textContent.includes(${JSON.stringify(text)}) === true`,
    );
  async function catalogInstall(label) {
    await js(`(() => {
      const card = [...document.querySelectorAll('.extension-catalog-card')].find(c => c.querySelector('h4')?.textContent === ${JSON.stringify(extensionTitle)});
      const button = card?.querySelector('button');
      if (!button || button.disabled || button.textContent !== ${JSON.stringify(label)}) throw Error('SSH catalog action unavailable');
      card.scrollIntoView({block:'center'});
    })()`);
    await screenshot(`public-catalog-${label.toLowerCase()}.png`);
    await js(`(() => {
      const card = [...document.querySelectorAll('.extension-catalog-card')].find(c => c.querySelector('h4')?.textContent === ${JSON.stringify(extensionTitle)});
      const button = card?.querySelector('button');
      if (!button || button.disabled || button.textContent !== ${JSON.stringify(label)}) throw Error('SSH catalog action unavailable');
      button.click();
    })()`);
  }
  await js(
    "window.__sshPublicCanvas = document.querySelector('.terminal-surface canvas')",
  );
  await settings();
  if (options.catalogMode === "public") {
    await click(core, "Browse official extensions");
    await until(
      () => panelContains("Catalog loaded."),
      "public catalog loaded",
      65000,
    );
    await catalogInstall("Install");
  } else await click(core, "Install local .omxext…");
  await until(
    () =>
      js(
        "document.querySelector('.extensions-panel').textContent.includes('generation 1')",
      ),
    "SSH installed",
    options.catalogMode ? 65000 : 15000,
  );
  const installed = await js(
    "document.querySelector('.extensions-panel').textContent",
  );
  assert.match(installed, /SSH Connect/);
  assert.equal(
    await js(
      `!![...document.querySelectorAll('.extensions-panel section h3')].find(h => h.textContent === ${JSON.stringify(extensionTitle)})`,
    ),
    true,
    "installed SSH identity matches selected archive version",
  );
  assert.equal(state.approvals, 1);
  assert.equal(children.length, 0);
  assert.equal(hosted().length, 0);
  checks.push("exact-archive-trust-dormant-install");
  await closeSettings();
  menu("SSH Connect");
  await until(
    async () =>
      hosted().length === 1 &&
      (await hosted()[0].executeJavaScript(
        "!!document.querySelector('[data-alias=fixture-fast]') && !document.querySelector('.quick-connect button').disabled",
      )),
    "real SSH page capability and alias discovery",
  );
  const view = hosted()[0];
  await panel(view, true, "child");
  assert.equal(await tabCount(), 1, "tool is outside Application Tabs");
  assert.equal(
    await js(
      "window.__sshPublicCanvas === document.querySelector('.terminal-surface canvas')",
    ),
    true,
  );
  assert.ok(alive(ptys[0]), "opening panel preserves original PTY");
  // Repeated admission is asynchronous even while the retained view is visible.
  await js(`(() => {
    window.__sshReopened = false;
    window.__removeSshReopen = window.omxterm.terminal.hostedContent.onOpen(() => {
      window.__sshReopened = true;
    });
  })()`);
  try {
    menu("SSH Connect");
    await until(() => js("window.__sshReopened"), "repeated SSH admission");
  } finally {
    await js("window.__removeSshReopen(); void 0;");
  }
  await panel(view, true, "child");
  await js("document.querySelector('.auxiliary-header button').click()");
  await panel(view, false, "core");
  menu("SSH Connect");
  await panel(view, true, "child");
  await settings();
  await panel(view, false, "core");
  await closeSettings();
  await panel(view, true, "core");
  menu("SSH Connect");
  await panel(view, true, "child");
  checks.push(
    "panel-outside-tabs-reopen-identity-close-focus-settings-suspend-restore",
  );
  assert.equal(children.length, 1);
  assert.deepEqual(
    await view.executeJavaScript(
      "window.omxHostedContent.request({operation:'host.capabilities'})",
    ),
    { capabilities: ["terminal.openSsh.v1"] },
  );
  assert.equal(fs.existsSync(file("ssh-fast.json")), false);
  assert.equal(fs.existsSync(file("ssh-live.json")), false);
  assert.equal(fs.existsSync(file("client-invocations.jsonl")), false);
  checks.push("capability-alias-discovery-no-client-execution");
  if (options.catalogMode === "public") {
    // This checkpoint proves acquisition/management, not another SSH argv campaign.
    await settings();
    await catalogInstall("Reinstall");
    await until(() => panelContains("generation 2"), "public reinstall", 65000);
    await until(
      () => hosted().length === 0 && children[0].closed,
      "reinstall retirement",
    );
    assert.deepEqual(children[0].exit, { code: 0, signal: null });
    assert.equal(children.length, 1, "reinstall remains dormant");
    assert.equal(state.approvals, 2);
    await closeSettings();
    menu("SSH Connect");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "!!document.querySelector('[data-alias=fixture-fast]')",
        )),
      "fresh SSH activation",
    );
    assert.equal(children.length, 2);
    await settings();
    await click(core, "Disable");
    await until(
      () => hosted().length === 0 && children[1].closed,
      "disable retirement",
    );
    assert.deepEqual(children[1].exit, { code: 0, signal: null });
    // Child closure precedes collection/snapshot completion. Wait for the
    // management response and enabled control, not merely native retirement.
    await until(
      () =>
        js(`(() => {
        const row = [...document.querySelectorAll('.extensions-panel section')].find(s => s.querySelector('h3')?.textContent === ${JSON.stringify(extensionTitle)});
        const uninstall = [...(row?.querySelectorAll('button') ?? [])].find(b => b.textContent === 'Uninstall');
        return !!row?.textContent.includes('generation 3') && row.textContent.includes('disabled') && !!uninstall && !uninstall.disabled;
      })()`),
      "completed Disable snapshot and enabled Uninstall",
    );
    await click(core, "Uninstall");
    await until(() => panelContains("uninstalled"), "SSH uninstalled");
    await closeSettings();
    // Closing Settings restores the sole terminal. Single-tab windows have no
    // tab-strip buttons; verify restored focus and the original PTY instead.
    await until(
      () => js("!!document.activeElement?.closest('.terminal-surface')"),
      "original terminal focus",
    );
    const destination = file("public-shell-after");
    const quoted = "'" + destination.replaceAll("'", "'\\''") + "'";
    await core.insertText(`printf '%s' "$$" > ${quoted}`);
    key(core, "Enter");
    await until(
      () =>
        fs.existsSync(destination) &&
        fs.readFileSync(destination, "utf8") === String(shell.probePid),
      "same shell accepts input",
    );
    assert.ok(alive(ptys[0]));
    assert.equal(
      await js(
        "window.__sshPublicCanvas === document.querySelector('.terminal-surface canvas')",
      ),
      true,
    );
    assert.equal(fs.existsSync(file("client-invocations.jsonl")), false);
    await screenshot("public-terminal-after.png");
    checks.push(
      "public-catalog-install-reinstall-dormant-retirement",
      "fresh-activation-disable-uninstall",
      "same-PTY-and-Surface-no-SSH-execution",
    );
    prepareQuit();
    return {
      ...state,
      catalog: {
        mode: "public",
        endpoint:
          "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json",
      },
      scope:
        "Production public HTTPS; controlled input/consent; no client execution or real authentication",
    };
  }
  if (options.appearance) {
    // Ordinary configuration files and production reload only: do not synthesize
    // preload notifications or mutate product appearance/language state.
    const configPath = file("config/omxterm/config.json");
    const originalConfig = fs.readFileSync(configPath, "utf8");
    const theme = read("theme-template.json");
    const themePath = file("config/omxterm/appearance-theme.json");
    const native = () =>
      window.contentView.children.find((c) => c.webContents === view);
    const initialWidth = await js(
      "Number(document.querySelector('.auxiliary-separator').getAttribute('aria-valuenow'))",
    );
    let language = "en-US";
    const reload = () =>
      menu(
        language === "en-US"
          ? "Reload User Configuration"
          : "Recarregar Configuração",
      );
    const snapshot = () =>
      view.executeJavaScript(`(() => {
      const style = document.documentElement.style;
      return {
        language: document.documentElement.lang,
        background: style.getPropertyValue('--terminal-background'),
        foreground: style.getPropertyValue('--terminal-foreground'),
        opacity: Number(style.getPropertyValue('--terminal-background-opacity')),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        viewport: innerWidth, width: document.documentElement.scrollWidth,
        quick: document.querySelector('.quick-connect input').value,
        search: document.querySelector('input[type=search]').value,
        connect: document.querySelector('.quick-connect button').textContent,
        searchLabel: document.querySelector('input[type=search]').closest('label').textContent,
        searchFocused: document.activeElement === document.querySelector('input[type=search]')
      };
    })()`);
    async function width(target) {
      assert.equal((target - 220) % 10, 0, "panel width uses keyboard steps");
      await js(`(() => {
        const separator = document.querySelector('.auxiliary-separator');
        for (const key of ['Home', ...Array(${(target - 220) / 10}).fill('ArrowLeft')])
          separator.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles:true, cancelable:true}));
      })()`);
      await until(
        () =>
          js(
            `Number(document.querySelector('.auxiliary-separator').getAttribute('aria-valuenow')) === ${target}`,
          ),
        "panel width " + target,
      );
    }
    async function capture(label, sample) {
      let geometry;
      await until(async () => {
        geometry = await js(`(() => {
          const slot = document.querySelector('.companion-native-slot:not([hidden])').getBoundingClientRect();
          const header = document.querySelector('.auxiliary-header').getBoundingClientRect();
          const terminal = document.querySelector('.terminal-surface').getBoundingClientRect();
          return {slot:{x:slot.x,y:slot.y,width:slot.width,height:slot.height},headerBottom:header.bottom,terminalRight:terminal.right,width:innerWidth,height:innerHeight};
        })()`);
        const bounds = native().getBounds();
        return ["x", "y", "width", "height"].every(
          (k) => Math.abs(bounds[k] - geometry.slot[k]) <= 2,
        );
      }, "native slot geometry " + label);
      const bounds = native().getBounds();
      assert.ok(bounds.y >= geometry.headerBottom - 2);
      assert.ok(bounds.x >= geometry.terminalRight - 2);
      assert.ok(bounds.x + bounds.width <= geometry.width + 2);
      assert.ok(bounds.y + bounds.height <= geometry.height + 2);
      const appearance = await snapshot();
      assert.ok(
        appearance.width <= appearance.viewport,
        "no horizontal page overflow",
      );
      assert.equal(appearance.bodyBackground, "rgba(0, 0, 0, 0)");
      fs.writeFileSync(
        path.join(options.evidence, label + "-tool.png"),
        (await view.capturePage()).toPNG(),
      );
      await screenshot(label + "-core.png");
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1200 },
      });
      assert.equal(sources.length, 1, "assigned single-screen desktop lane");
      assert.ok(
        !sources[0].thumbnail.isEmpty(),
        "actual desktop capture required",
      );
      fs.writeFileSync(
        path.join(options.evidence, label + "-desktop.png"),
        sources[0].thumbnail.toPNG(),
      );
      save(label + ".json", {
        sample,
        appearance,
        geometry,
        native: bounds,
        viewId: view.id,
        limitation:
          "Desktop captures require owner pixel inspection. Nested X11 without a compositor cannot prove native blur or desktop transparency; requested blur and propagated tint are not blur evidence.",
      });
    }
    await view.executeJavaScript(`(() => {
      document.querySelector('.quick-connect input').value = 'fixture@[2001:db8::7]:2207';
      const search = document.querySelector('input[type=search]');
      search.value = 'fixture'; search.dispatchEvent(new Event('input', {bubbles:true})); search.focus();
    })()`);
    // Each color/opacity is exercised at normal and minimum width. Alternate
    // visible and hidden reloads; both directions of language replay are real.
    let index = 0;
    for (const panelWidth of [initialWidth, 220]) {
      await width(panelWidth);
      for (const palette of [
        { name: "dark", background: "#15171b", foreground: "#e5e9f0" },
        { name: "light", background: "#f4f4f0", foreground: "#20242b" },
      ])
        for (const opacity of [0, 0.65, 1]) {
          const hidden = index++ % 2 === 1;
          const nextLanguage = language === "en-US" ? "pt-BR" : "en-US";
          const sample = {
            ...palette,
            opacity,
            language: nextLanguage,
            hidden,
            panelWidth,
            blur: true,
          };
          if (hidden) {
            await js(
              "document.querySelector('.auxiliary-header button').click()",
            );
            await panel(view, false, "core");
          }
          fs.writeFileSync(
            themePath,
            JSON.stringify({
              ...theme,
              name: "SSH appearance fixture",
              colors: {
                ...theme.colors,
                background: palette.background,
                foreground: palette.foreground,
              },
            }),
          );
          fs.writeFileSync(
            configPath,
            JSON.stringify({
              version: 1,
              language: nextLanguage,
              confirmClose: true,
              theme: { path: themePath },
              window: { transparency: 1 - opacity, blur: true },
            }),
          );
          reload();
          await until(async () => {
            const current = await snapshot();
            return (
              current.language === nextLanguage &&
              current.background === palette.background &&
              current.foreground === palette.foreground &&
              Math.abs(current.opacity - opacity) < 0.001 &&
              current.connect ===
                (nextLanguage === "pt-BR" ? "Conectar" : "Connect") &&
              current.searchLabel ===
                (nextLanguage === "pt-BR" ? "Buscar aliases" : "Search aliases")
            );
          }, "actual language/appearance reload");
          language = nextLanguage;
          const retained = await snapshot();
          assert.equal(retained.quick, "fixture@[2001:db8::7]:2207");
          assert.equal(retained.search, "fixture");
          if (hidden) {
            await panel(view, false, "core");
            menu("SSH Connect");
          } else
            assert.equal(
              retained.searchFocused,
              true,
              "visible relabel preserves focused input",
            );
          await panel(view, true, "child");
          await view.executeJavaScript(
            "document.querySelector('input[type=search]').focus()",
          );
          await capture(
            `appearance-${panelWidth}-${palette.name}-${opacity}`,
            sample,
          );
        }
    }
    fs.writeFileSync(configPath, originalConfig);
    reload();
    await until(async () => {
      const current = await snapshot();
      return (
        current.language === "en-US" &&
        current.connect === "Connect" &&
        current.opacity === 1
      );
    }, "restore original English configuration");
    await width(initialWidth);
    await view.executeJavaScript(`(() => {
      document.querySelector('.quick-connect input').value = '';
      const search = document.querySelector('input[type=search]');
      search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true})); search.focus();
    })()`);
    await until(
      () =>
        view.executeJavaScript(
          "!!document.querySelector('[data-alias=fixture-fast]') && !document.querySelector('.quick-connect button').disabled",
        ),
      "restored synthetic alias campaign",
    );
    await panel(view, true, "child");
    assert.equal(children.length, 1);
    assert.equal(await tabCount(), 1);
    assert.ok(alive(ptys[0]));
    assert.equal(
      await js(
        "window.__sshPublicCanvas === document.querySelector('.terminal-surface canvas')",
      ),
      true,
    );
    assert.equal(fs.existsSync(file("client-invocations.jsonl")), false);
    checks.push(
      "appearance-normal-220-dark-light-opacity-matrix-desktop-captures",
      "visible-hidden-language-relabel-focus-drafts-retained-restored",
    );
  }
  const baselineTabs = await tabCount();
  // DOM gestures are deliberate: exact repeat/release ownership, not physical
  // layout or Electron's optional suppression of a prevented native keyup.
  const gesture = (type, repeat = false) =>
    view.executeJavaScript(
      `document.activeElement.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, {key:'Enter', code:'Enter', bubbles:true, cancelable:true, repeat:${repeat}}))`,
    );
  await view.executeJavaScript(
    "document.querySelector('input[type=search]').focus()",
  );
  await gesture("keydown");
  await gesture("keydown", true);
  await gesture("keydown", true);
  // Bound a negative observation through a real preload roundtrip and 250ms.
  await view.executeJavaScript(
    "(async () => { await window.omxHostedContent.request({operation:'host.capabilities'}); await new Promise(r => setTimeout(r, 250)); })()",
  );
  assert.equal(
    fs.existsSync(file("ssh-fast.json")),
    false,
    "keydown/repeats must not launch",
  );
  assert.equal(await tabCount(), baselineTabs);
  await gesture("keyup");
  await until(
    () => fs.existsSync(file("ssh-fast.json")),
    "alias literal argv receipt",
  );
  const fast = read("ssh-fast.json");
  ptys.push(fast);
  assert.deepEqual(fast.argv, ["--", "fixture-fast"]);
  assert.equal(fast.cwd, os.userInfo().homedir);
  await until(() => !alive(fast), "fast actual native exit");
  await until(
    () =>
      js(
        "document.querySelector('.terminal-exit-notice')?.textContent.includes('SSH exited (code 37).') === true",
      ),
    "retained nonzero notice",
  );
  assert.equal(await tabCount(), baselineTabs + 1);
  await panel(view, true, "core");
  assert.ok(alive(ptys[0]), "Connect preserves original PTY");
  await until(
    () =>
      view.executeJavaScript(
        "document.querySelector('[role=status]').textContent.includes('Terminal accepted.')",
      ),
    "accepted wording",
  );
  assert.doesNotMatch(
    await view.executeJavaScript(
      "document.querySelector('[role=status]').textContent",
    ),
    /connected/i,
  );
  checks.push("release-only-single-alias-literal-argv-fast-exit37-retained");
  // Real retained Surface commands, not a mocked Surface API.
  menu("Find");
  await until(
    () =>
      js(
        "document.activeElement?.closest('[role=search]') !== null && document.activeElement?.tagName === 'INPUT'",
      ),
    "retained Find field",
  );
  await core.insertText("SYNTHETIC-SSH-fast-OUTPUT");
  await until(
    () =>
      js(
        "[...document.querySelectorAll('.restty-pane-search-status')].some(e => e.textContent === '1')",
      ),
    "retained output searchable",
  );
  key(core, "Escape");
  await until(
    () =>
      js(
        "!!document.activeElement?.closest('.terminal-surface') && !document.activeElement?.closest('[role=search]')",
      ),
    "retained terminal focus",
  );
  clipboard.clear();
  menu("Select All");
  menu("Copy");
  await until(
    () => clipboard.readText().includes("SYNTHETIC-SSH-fast-OUTPUT"),
    "retained output copyable",
  );
  const copied = clipboard.readText();
  assert.match(copied, /No authentication or remote connectivity attempted/);
  save("retained-copy.json", { text: copied });
  const canvasGeometry = () =>
    js(
      "(() => { const c=document.querySelector('.terminal-exit-notice').closest('.terminal-surface').querySelector('canvas'); const r=c.getBoundingClientRect(); return {x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height),backingWidth:c.width,backingHeight:c.height}; })()",
    );
  const beforeCanvas = await canvasGeometry();
  const beforeSize = window.getContentSize();
  window.setContentSize(beforeSize[0] + 80, beforeSize[1] + 40);
  await until(async () => {
    const current = await canvasGeometry();
    return (
      current.width > beforeCanvas.width &&
      current.height > beforeCanvas.height &&
      current.backingWidth > beforeCanvas.backingWidth &&
      current.backingHeight > beforeCanvas.backingHeight
    );
  }, "retained canvas actually refitted");
  const afterCanvas = await canvasGeometry();
  // Restty fonts are WASM-owned bytes, not document.fonts/CSS FontFaces.
  // Keep the actual rendered canvas for owner visual readability adjudication.
  let image;
  let textPixels = 0;
  // Geometry/backing-store resize is not a compositor paint fence. Check the
  // synthetic text rows, not the exit notice that can paint over a blank canvas.
  await until(async () => {
    image = await core.capturePage({
      x: afterCanvas.x,
      y: afterCanvas.y,
      width: afterCanvas.width,
      height: afterCanvas.height,
    });
    const pixels = image.toBitmap();
    const size = image.getSize();
    textPixels = 0;
    for (let y = 0; y < Math.min(100, size.height); y++) {
      for (let x = 0; x < size.width; x++) {
        const index = (y * size.width + x) * 4;
        if (
          pixels[index] > 150 &&
          pixels[index + 1] > 150 &&
          pixels[index + 2] > 150
        )
          textPixels++;
      }
    }
    return textPixels > 100;
  }, "retained synthetic text rows painted after refit");
  fs.writeFileSync(
    path.join(options.evidence, "retained-canvas.png"),
    image.toPNG(),
  );
  save("retained-render.json", {
    beforeCanvas,
    afterCanvas,
    textPixels,
    fontEvidence:
      "real packaged Restty canvas; visual readability requires owner inspection, not CSS FontFace enumeration",
  });
  await screenshot("retained-output.png");
  await core.insertText("NEVER-A-REMOTE-COMMAND");
  key(core, "Enter");
  assert.equal(alive(fast), false);
  await js("document.querySelector('.terminal-exit-notice button').click()");
  await until(
    () => js("!document.querySelector('.terminal-exit-notice')"),
    "retained Close",
  );
  assert.equal(state.busyClose, 0, "ended pane is not Busy");
  checks.push("retained-search-copy-nonblank-canvas-local-refit-close");
  menu("SSH Connect");
  await panel(view, true, "child");
  // Remove only our controlled executable. A page error must not allocate a tab.
  fs.renameSync(file("bin/ssh"), file("bin/ssh.hidden"));
  await view.executeJavaScript(
    "document.querySelector('.quick-connect input').value='fixture@[2001:db8::7]:2207'",
  );
  await click(view, "Connect");
  await until(
    () =>
      view.executeJavaScript(
        "document.querySelector('[role=status]').textContent.includes('OpenSSH client not found')",
      ),
    "missing executable error",
  );
  assert.equal(await tabCount(), baselineTabs);
  assert.equal(fs.existsSync(file("ssh-live.json")), false);
  fs.renameSync(file("bin/ssh.hidden"), file("bin/ssh"));
  checks.push("missing-ssh-error-no-tab");
  // Search remains distinct: an unmatched query must not become quick-connect.
  await view.executeJavaScript(
    "const s=document.querySelector('input[type=search]'); s.value='not-an-alias'; s.dispatchEvent(new Event('input',{bubbles:true})); s.focus()",
  );
  await gesture("keydown");
  await gesture("keyup");
  assert.equal(fs.existsSync(file("ssh-live.json")), false);
  const point = await view.executeJavaScript(
    "(() => {const r=document.querySelector('.quick-connect button').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()",
  );
  for (const type of ["mouseDown", "mouseUp"])
    view.sendInputEvent({ type, ...point, button: "left", clickCount: 1 });
  await until(
    () => fs.existsSync(file("ssh-live-ready.json")),
    "pointer quick connect live PTY",
  );
  const live = read("ssh-live.json");
  ptys.push(live);
  assert.equal(await tabCount(), baselineTabs + 1);
  assert.deepEqual(live.argv, [
    "-l",
    "fixture",
    "-p",
    "2207",
    "--",
    "2001:db8::7",
  ]);
  assert.equal(live.cwd, os.userInfo().homedir);
  await until(
    () =>
      js(
        "document.querySelector('#tab-strip [aria-selected=true]')?.textContent.includes('SYNTHETIC-SSH-live') === true",
      ),
    "display-only title on selected SSH tab",
  );
  save("selected-title.json", { selectedTitle: true });
  try {
    await until(
      async () =>
        core.isFocused() &&
        !view.isFocused() &&
        (await js("!!document.activeElement?.closest('.terminal-surface')")),
      "foreground terminal DOM and actual native core focus",
    );
  } catch (originalFailure) {
    save("focus-before.json", await diagnose());
    throw originalFailure;
  }
  assert.equal(
    await js(
      "document.activeElement.closest('.terminal-surface').querySelector('canvas') !== window.__sshPublicCanvas",
    ),
    true,
    "Connect selected a new Surface, not the original terminal",
  );
  assert.ok(
    alive(ptys[0]),
    "original PTY remains alive after foreground handoff",
  );
  await panel(view, true, "core");
  save("panel-focus.json", {
    coreNativeFocused: core.isFocused(),
    childNativeFocused: view.isFocused(),
    panelVisible: true,
    tabs: await tabCount(),
    originalPtyAlive: alive(ptys[0]),
    distinctSelectedSurface: true,
  });
  assert.equal(
    fs.existsSync(file("ssh-live-input.bin")),
    false,
    "initiating Enter did not reach client",
  );
  await core.insertText("X");
  await until(
    () => fs.existsSync(file("ssh-live-input.bin")),
    "fresh terminal input",
  );
  assert.equal(fs.readFileSync(file("ssh-live-input.bin"), "utf8"), "X");
  checks.push(
    "pointer-quick-distinct-target-literal-ipv6-argv-foreground-title",
  );
  async function defaultShellReceipt(name) {
    await until(
      () => js("!!document.activeElement?.closest('.terminal-surface')"),
      "default shell focus",
    );
    const destination = file(name);
    const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
    await core.insertText(
      `printf '%s\\n%s\\n' "$$" "$PWD" > ${quote(destination)}`,
    );
    key(core, "Enter");
    await until(
      () =>
        fs.existsSync(destination) &&
        /^\d+\n[^\n]+\n$/.test(fs.readFileSync(destination, "utf8")),
      "default shell command receipt",
    );
    const [pidText, cwd] = fs
      .readFileSync(destination, "utf8")
      .trimEnd()
      .split("\n");
    const pid = Number(pidText);
    const record = identity(pid);
    assert.ok(record);
    assert.equal(
      cwd,
      os.userInfo().homedir,
      "remote OSC7 must not become local cwd",
    );
    assert.equal(
      fs.realpathSync(`/proc/${pid}/exe`),
      fs.realpathSync(os.userInfo().shell),
    );
    ptys.push(record);
    save(name + ".json", { ...record, cwd, defaultShell: true });
  }
  const beforeNewTab = await tabCount();
  menu("New Tab");
  await until(
    async () => (await tabCount()) === beforeNewTab + 1,
    "new Default Shell tab allocated",
  );
  await panel(view, true, "core");
  await defaultShellReceipt("new-tab-shell");
  menu("Close Tab");
  await until(() => !alive(ptys.at(-1)), "new tab shell actual exit");
  await selectTab("SYNTHETIC-SSH-live");
  await js(
    "window.__sshPriorPane = document.activeElement.closest('.terminal-surface')",
  );
  menu("Split Right");
  await until(
    () =>
      js(
        "!!document.activeElement?.closest('.terminal-surface') && document.activeElement.closest('.terminal-surface') !== window.__sshPriorPane",
      ),
    "new split owns terminal focus",
  );
  await defaultShellReceipt("split-shell");
  menu("Close Pane");
  await until(() => !alive(ptys.at(-1)), "split shell actual exit");
  checks.push(
    "remote-osc7-ignored-new-tab-and-split-default-shell-at-account-home",
  );
  // The tool belongs to the window, not the shell that originally opened it.
  await js("document.querySelector('#tab-strip [role=tab]').click()");
  await panel(view, true, "core");
  assert.equal(
    await js("window.__sshPublicCanvas.getBoundingClientRect().width > 0"),
    true,
  );
  await core.insertText("exit");
  key(core, "Enter");
  await until(() => !alive(ptys[0]), "original source shell actual exit");
  await until(
    () => tabCount().then((count) => count === 1),
    "source terminal removed",
  );
  await panel(view, true, "core");
  menu("SSH Connect");
  await panel(view, true, "child");
  assert.equal(children.length, 1, "source exit does not restart backend");
  checks.push(
    "terminal-switch-preserves-panel-source-exit-retains-window-owned-tool",
  );
  await settings();
  await panel(view, false, "core");
  await click(core, "Disable");
  await until(
    () => hosted().length === 0 && children[0].closed,
    "extension backend and page retired",
  );
  assert.deepEqual(children[0].exit, { code: 0, signal: null });
  assert.ok(alive(live), "core SSH survives extension disable");
  await closeSettings();
  // Only the SSH terminal remains; its strip is now intentionally hidden.
  await until(() => core.isFocused(), "core focus after Disable and Settings");
  menu("Close Tab");
  await until(() => state.busyClose === 1, "live SSH Busy confirmation");
  assert.ok(alive(live), "cancelled Busy close keeps client");
  await core.insertText("Y");
  await until(
    () => fs.readFileSync(file("ssh-live-input.bin"), "utf8") === "XY",
    "client remains usable after disable and cancelled close",
  );
  await screenshot("live-after-disable.png");
  checks.push("disable-retirement-preserves-core-live-busy-close-cancel");
  const invocations = fs
    .readFileSync(file("client-invocations.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    invocations,
    [fast.argv, live.argv],
    "exactly two client executions, no discovery probes or duplicates",
  );
  save("client-argv.json", { fast, live, invocations });
  assert.equal(
    fs.readFileSync(file("home/.ssh/config"), "utf8"),
    "Host fixture-fast\n  HostName example.invalid\n",
  );
  assert.equal(
    fs.statSync(file("home/.ssh/config")).mtimeMs,
    configBefore.mtimeMs,
  );
  assert.deepEqual(fs.readdirSync(file("home/.ssh")), ["config"]);
  assert.equal(fs.existsSync(file("home/.ssh/known_hosts")), false);
  prepareQuit();
  function prepareQuit() {
    app.once("will-quit", () => {
      save("quit.json", {
        ...state,
        joined:
          ptys.every((record) => !alive(record)) &&
          children.every(
            (child) =>
              child.closed &&
              child.exit?.code === 0 &&
              child.exit.signal === null,
          ),
      });
      cleanup();
    });
    requestQuit = () => {
      // Production builds this label from app.name, not the dialog's brand title.
      const items = [];
      const collect = (entries) => {
        for (const item of entries) {
          items.push({ label: item.label, enabled: item.enabled });
          if (item.submenu) collect(item.submenu.items);
        }
      };
      collect(Menu.getApplicationMenu().items);
      save("quit-menu.json", { appName: app.name, items });
      menu(`Quit ${app.name}`);
    };
  }
  return {
    ...state,
    scope:
      "Synthetic client only; DOM keyboard and Chromium pointer; native dialog responses controlled",
    limitations: [
      "No real SSH/network/authentication",
      "No physical-keyboard/native-popup qualification",
      "No delayed-transfer background/modal race injection",
      "No internal font-disposal or transport-call instrumentation; retained behavior and actual process exit observed",
    ],
  };
}
module.exports = {
  inspect,
  run,
  cleanup,
  diagnose,
  abort,
  quit: () => {
    assert.ok(requestQuit);
    requestQuit();
  },
};
