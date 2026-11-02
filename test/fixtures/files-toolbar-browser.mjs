// Opt-in headless test of the actual Files page/CSS, with synthetic host/backend
// responses. CDP input uses real Chromium hit-testing; no desktop is opened.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const browser = process.env.OMXTERM_TOOLBAR_CHROMIUM;
assert.ok(
  browser,
  "Set OMXTERM_TOOLBAR_CHROMIUM to a headless Chromium executable",
);
await access(browser, constants.X_OK);
await mkdir(".scratch", { recursive: true });
const root = await mkdtemp(path.resolve(".scratch/files-toolbar-browser-"));
let child;
let exited;
let isExited = false;
const interrupt = () => child?.kill("SIGTERM");
process.once("SIGTERM", interrupt);
try {
  await build({
    entryPoints: ["test/fixtures/files-toolbar-browser-entry.ts"],
    bundle: true,
    platform: "browser",
    outfile: path.join(root, "view.js"),
    logLevel: "silent",
  });
  const html = path.join(root, "index.html");
  const css = pathToFileURL(path.resolve("extensions/files/files.css")).href;
  await writeFile(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${css}"><script defer src="view.js"></script></head><body></body></html>`,
  );
  child = spawn(
    browser,
    [
      "--headless",
      "--remote-debugging-pipe",
      "--disable-background-networking",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${path.join(root, "profile")}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        LANG: process.env.LANG ?? "C",
        HOME: root,
        TMPDIR: root,
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_CACHE_HOME: path.join(root, "cache"),
        XDG_DATA_HOME: path.join(root, "data"),
        ...(process.platform === "win32"
          ? {
              SystemRoot: process.env.SystemRoot,
              USERPROFILE: root,
              APPDATA: path.join(root, "appdata"),
              LOCALAPPDATA: path.join(root, "localappdata"),
            }
          : {}),
      },
    },
  );
  // Pipe transport avoids a listening debugging port and needs no new dependency.
  let diagnostics = "";
  child.stderr.on("data", (data) => {
    diagnostics = (diagnostics + data).slice(-4000);
  });
  let id = 0;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  exited = new Promise((resolve) => {
    const finish = (detail) => {
      isExited = true;
      rejectPending(new Error(`Chromium ${detail}: ${diagnostics}`));
      resolve();
    };
    child.once("exit", (code, signal) => finish(`exited (${code}, ${signal})`));
    child.once("error", (error) => finish(`spawn failed (${error.message})`));
  });
  child.stdio[3].on("error", rejectPending);
  child.stdio[4].on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf(0);
      if (end < 0) break;
      const message = JSON.parse(buffer.subarray(0, end).toString());
      buffer = buffer.subarray(end + 1);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error)
        request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  let session;
  function send(method, params = {}, sessionId = session) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            `Chromium command timed out: ${method} ${params.expression ?? ""}`,
          ),
        );
      }, 10000);
      pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdio[3].write(
        JSON.stringify({ id: requestId, method, params, sessionId }) + "\0",
      );
    });
  }
  async function evaluate(expression, ...args) {
    const reply = await send("Runtime.evaluate", {
      expression:
        typeof expression === "function"
          ? `(${expression})(...${JSON.stringify(args)})`
          : expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (reply.exceptionDetails)
      throw new Error(
        reply.exceptionDetails.exception?.description ??
          JSON.stringify(reply.exceptionDetails),
      );
    return reply.result.value;
  }
  async function until(check, label) {
    const deadline = Date.now() + 3000;
    do {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    throw new Error(`Timed out: ${label}`);
  }
  const frame = () =>
    evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
  const mouse = (type, point, extra = {}) =>
    send("Input.dispatchMouseEvent", { type, ...point, ...extra });
  async function click(point) {
    await mouse("mousePressed", point, {
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await mouse("mouseReleased", point, {
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await frame();
  }
  async function key(key, code, number, modifiers = 0) {
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: number,
        nativeVirtualKeyCode: number,
        modifiers,
        ...(key === "Enter" && type === "keyDown"
          ? { text: "\r", unmodifiedText: "\r" }
          : {}),
      });
  }
  async function screenshot(name) {
    const destination = process.env.OMXTERM_TOOLBAR_EVIDENCE;
    if (!destination) return;
    await mkdir(destination, { recursive: true });
    const result = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(destination, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  }
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (
    await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    })
  ).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Accessibility.enable");

  const selector = (icon) =>
    `[aria-describedby="files-toolbar-${icon}-tooltip"]`;
  const address = ".location input";
  const treeRow = "[role=treeitem]";
  async function geometry(icon) {
    return evaluate((selector) => {
      const b = document.querySelector(selector);
      const t = document.getElementById(b.getAttribute("aria-describedby"));
      const rect = (element) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        focused: document.activeElement === b,
        hidden: t.hidden,
        name: b.getAttribute("aria-label"),
        text: t.textContent,
        outline: getComputedStyle(b).outlineStyle,
        anchor: rect(b),
        tip: rect(t),
      };
    }, selector(icon));
  }
  async function point(selector) {
    return evaluate((selector) => {
      const b = document.querySelector(selector),
        r = b.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    }, selector);
  }
  async function assertHit(selector) {
    const hits = await evaluate((selector) => {
      const b = document.querySelector(selector),
        r = b.getBoundingClientRect();
      return [
        [r.left + 2, r.top + 2],
        [r.right - 2, r.top + 2],
        [r.left + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
        [(r.left + r.right) / 2, (r.top + r.bottom) / 2],
      ].map(([x, y]) => b.contains(document.elementFromPoint(x, y)));
    }, selector);
    assert.deepEqual(
      hits,
      Array(5).fill(true),
      `${selector} hit-test corners and center`,
    );
  }
  async function assertAccessible(icon, names) {
    const tree = await send("Accessibility.getFullAXTree");
    const node = tree.nodes.find(
      (item) =>
        item.role?.value === "button" && item.name?.value === names[icon],
    );
    assert.ok(node, `accessible name: ${names[icon]}`);
    assert.equal(node.description?.value, names[`${icon}Tip`]);
  }
  async function load(width, language, light, scale = 1) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 400,
      deviceScaleFactor: scale,
      mobile: false,
    });
    await send("Page.bringToFront");
    await evaluate("delete window.filesFixture");
    await send("Page.navigate", { url: pathToFileURL(html).href });
    await until(async () => {
      try {
        return await evaluate("!!window.filesFixture");
      } catch {
        return false;
      }
    }, "Files page loaded");
    await until(
      async () =>
        await evaluate(
          "document.querySelector('[role=tree]')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('[role=treeitem]').length === 40",
        ),
      "initial synthetic listing",
    );
    await evaluate(
      (language, light) => {
        filesFixture.setLanguage(language);
        filesFixture.setAppearance(
          light
            ? { background: "#fafafa", foreground: "#151515", opacity: 1 }
            : { background: "#101218", foreground: "#f4f4f4", opacity: 1 },
        );
      },
      language,
      light,
    );
    await frame();
  }
  const labels = (language) =>
    language === "en-US"
      ? {
          home: "Home",
          "new-folder": "New folder",
          go: "Go",
          homeTip: "Open the home directory",
          "new-folderTip": "Create a folder in the current directory",
        }
      : {
          home: "Pasta pessoal",
          "new-folder": "Nova pasta",
          go: "Ir",
          homeTip: "Abrir a pasta pessoal",
          "new-folderTip": "Criar uma pasta no diretório atual",
        };
  async function focusFolder() {
    await evaluate(
      (selector) => document.querySelector(selector).focus(),
      address,
    );
    for (let i = 0; i < 2; i++) await key("Tab", "Tab", 9, 8);
    const state = await geometry("new-folder");
    assert.ok(state.focused && !state.hidden, "keyboard-focus explanation");
    assert.notEqual(state.outline, "none", "visible keyboard focus");
  }
  const draft = (value) =>
    evaluate((value) => {
      document.querySelector(".location input").value = value;
    }, value);
  const firstName = () =>
    evaluate("document.querySelector('.file-name')?.textContent");

  async function pointer(names, tag) {
    await draft("/other");
    const folder = await point(selector("new-folder"));
    await mouse("mouseMoved", folder);
    const tip = await geometry("new-folder");
    assert.equal(tip.hidden, false, "hover explanation visible");
    assert.equal(tip.text, names["new-folderTip"]);
    await assertAccessible("new-folder", names);
    await mouse("mouseMoved", { x: folder.x, y: tip.tip.top + 2 });
    assert.equal(
      (await geometry("new-folder")).hidden,
      false,
      "unobstructed edge remains hoverable",
    );
    await key("Escape", "Escape", 27);
    await mouse("mouseMoved", folder);
    assert.equal(
      (await geometry("new-folder")).hidden,
      true,
      "movement does not undo Escape",
    );
    await mouse("mouseMoved", { x: 2, y: 200 });
    await mouse("mouseMoved", folder);
    for (const icon of ["home", "up", "refresh", "new-folder", "actions", "go"])
      await assertHit(selector(icon));
    await assertHit(address);
    await assertHit(treeRow);
    const input = await point(address),
      go = await point(selector("go"));
    await mouse("mouseMoved", input);
    await click(input);
    assert.equal(
      await evaluate(
        "document.activeElement === document.querySelector('.location input')",
      ),
      true,
      "pointer focuses address",
    );
    await mouse("mouseMoved", folder);
    await mouse("mouseMoved", go);
    await click(go);
    assert.equal(await firstName(), "other-0", "real Go click navigates");
    assert.equal((await geometry("go")).hidden, false);
    await assertHit(treeRow);
    const row = await point(treeRow);
    await mouse("mouseMoved", row);
    await click(row);
    assert.equal(
      await evaluate(
        "document.querySelector('[role=treeitem]').getAttribute('aria-selected')",
      ),
      "true",
      "real click selects tree row",
    );
    // Keyboard focus moves while the real pointer stays stationary over Go.
    await mouse("mouseMoved", go);
    await focusFolder();
    await assertHit(selector("go"));
    await screenshot(`pointer-${tag}`);
    await draft("/root");
    await click(go);
    assert.equal(
      await firstName(),
      "item-0",
      "stationary pointer click reaches Go",
    );
    await focusFolder();
    await mouse("mouseMoved", { x: go.x + 1, y: go.y });
    assert.equal(
      (await geometry("go")).hidden,
      false,
      "renewed movement prefers actual hovered control",
    );
    assert.equal((await geometry("new-folder")).hidden, true);
    console.log(`PASS pointer hover ${tag}`);
  }
  async function notice(language, names, tag) {
    await key("Tab", "Tab", 9);
    const before = await geometry("home");
    assert.ok(before.focused && !before.hidden);
    await evaluate(
      "window.originalHome=document.activeElement;filesFixture.failNextHome()",
    );
    await key("Enter", "Enter", 13);
    await frame();
    const after = await geometry("home");
    assert.ok(
      await evaluate(
        "document.querySelector('[role=status]').textContent.includes('permission')",
      ),
    );
    assert.ok(
      after.anchor.top > before.anchor.top,
      "notice really moves toolbar",
    );
    assert.ok(
      after.focused && !after.hidden,
      "notice preserves focused explanation",
    );
    assert.ok(
      Math.abs(after.tip.top - after.anchor.bottom) < 1,
      JSON.stringify({ before, after }),
    );
    await assertAccessible("home", names);
    const nextLanguage = language === "en-US" ? "pt-BR" : "en-US";
    await evaluate(
      (language) => filesFixture.setLanguage(language),
      nextLanguage,
    );
    const relabeled = await geometry("home");
    assert.equal(
      await evaluate("document.activeElement === originalHome"),
      true,
      "same retained focused control",
    );
    assert.equal(relabeled.name, labels(nextLanguage).home);
    assert.equal(relabeled.text, labels(nextLanguage).homeTip);
    assert.equal(relabeled.hidden, false);
    assert.ok(
      Math.abs(relabeled.tip.top - relabeled.anchor.bottom) < 1,
      "locale reflow follows anchor",
    );
    await screenshot(`notice-${tag}`);
    await assertHit(selector("new-folder"));
    const folder = await point(selector("new-folder"));
    await mouse("mouseMoved", folder);
    await click(folder);
    assert.equal(
      await evaluate("document.querySelector('.operation-editor').hidden"),
      false,
      "moved control click opens editor",
    );
    console.log(`PASS focused tooltip ${tag}`);
  }
  async function scroll(width, names, tag) {
    await key("Tab", "Tab", 9);
    const before = await geometry("home");
    assert.ok(before.focused && !before.hidden);
    const position = { x: width - 16, y: 350 };
    await mouse("mouseMoved", position);
    async function wheel(deltaY, expected) {
      await mouse("mouseWheel", position, { deltaX: 0, deltaY });
      await until(
        async () => Math.abs((await evaluate("scrollY")) - expected) < 1,
        "actual wheel scroll",
      );
      await frame();
    }
    const partialScroll = before.anchor.bottom - 2;
    await wheel(partialScroll, partialScroll);
    const partial = await geometry("home");
    assert.ok(
      partial.anchor.bottom > 0 && partial.anchor.bottom < 4,
      "partially scrolled anchor",
    );
    assert.ok(partial.focused && !partial.hidden);
    assert.ok(
      partial.tip.top >= 0 && partial.tip.bottom <= 400,
      JSON.stringify(partial),
    );
    await wheel(600, partialScroll + 600);
    const away = await geometry("home");
    assert.ok(
      away.anchor.bottom <= 0 && away.focused && away.hidden,
      JSON.stringify(away),
    );
    await assertAccessible("home", names);
    await wheel(-1200, 0);
    const back = await geometry("home");
    assert.ok(
      back.focused && !back.hidden,
      "focused tooltip restored with anchor",
    );
    await screenshot(`scroll-${tag}`);
    console.log(`PASS actual scroll ${tag}`);
  }
  async function hidden(tag) {
    await evaluate("filesFixture.useDotfiles()");
    await until(
      async () =>
        await evaluate(
          "document.querySelector('[role=tree]')?.getAttribute('aria-busy') === 'false' && [...document.querySelectorAll('.file-name')].some(node => node.textContent === 'visible')",
        ),
      "dotfile fixture loaded",
    );
    const names = () =>
      evaluate(
        "[...document.querySelectorAll('.file-name')].map(node => node.textContent)",
      );
    assert.deepEqual(await names(), ["visible"], "dotfiles hidden by default");
    for (let i = 0; i < 5; i++) await key("Tab", "Tab", 9);
    assert.equal(
      await evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        selector("actions"),
      ),
      true,
      "Tab reaches Actions",
    );
    await key("Enter", "Enter", 13);
    const toggle = '[role="menuitemcheckbox"]';
    assert.equal(
      await evaluate(
        (selector) =>
          document.querySelector(selector)?.getAttribute("aria-checked"),
        toggle,
      ),
      "false",
    );
    await key("End", "End", 35);
    assert.equal(
      await evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        toggle,
      ),
      true,
      "menu keyboard navigation reaches toggle",
    );
    const bounds = await evaluate((selector) => {
      const item = document.querySelector(selector);
      const menu = item.closest('[role="menu"]');
      const button = item.getBoundingClientRect();
      const popup = menu.getBoundingClientRect();
      return {
        visible: button.top >= popup.top && button.bottom <= popup.bottom,
        inViewport:
          popup.left >= 0 &&
          popup.right <= innerWidth &&
          popup.top >= 0 &&
          popup.bottom <= innerHeight,
        outline: getComputedStyle(item).outlineStyle,
      };
    }, toggle);
    assert.ok(bounds.visible && bounds.inViewport, JSON.stringify(bounds));
    assert.notEqual(
      bounds.outline,
      "none",
      "menu item has keyboard focus indication",
    );
    await key("Enter", "Enter", 13);
    assert.deepEqual(await names(), [".config", ".profile", "visible"]);
    await key("Enter", "Enter", 13);
    assert.equal(
      await evaluate(
        (selector) =>
          document.querySelector(selector)?.getAttribute("aria-checked"),
        toggle,
      ),
      "true",
    );
    const ax = await send("Accessibility.getFullAXTree");
    assert.ok(
      ax.nodes.some(
        (node) =>
          node.role?.value === "menuitemcheckbox" &&
          node.name?.value === "Show dotfiles (names starting with .)" &&
          node.properties?.some(
            (property) =>
              property.name === "checked" && property.value?.value === "true",
          ),
      ),
      "checked state exposed to accessibility tree",
    );
    await key("End", "End", 35);
    await evaluate("filesFixture.setLanguage('pt-BR')");
    assert.equal(
      await evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        toggle,
      ),
      true,
      "locale change retains menu focus",
    );
    assert.ok(
      await evaluate(
        (selector) =>
          document
            .querySelector(selector)
            .textContent.includes("Mostrar itens iniciados por ponto (.)"),
        toggle,
      ),
    );
    await key("Enter", "Enter", 13);
    assert.deepEqual(
      await names(),
      ["visible"],
      "keyboard hides dotfiles again",
    );
    await evaluate((selector) => {
      const input = document.querySelector(selector);
      input.focus();
      input.select();
    }, address);
    await send("Input.insertText", { text: "/root/.config" });
    assert.equal(
      await evaluate(
        (selector) => document.querySelector(selector).value,
        address,
      ),
      "/root/.config",
    );
    await key("Enter", "Enter", 13);
    await until(
      async () => (await firstName()) === "settings",
      "typed hidden root",
    );
    assert.deepEqual(
      await names(),
      ["settings"],
      "filter applies relative to typed hidden root",
    );
    console.log(`PASS hidden keyboard ${tag}`);
  }
  async function shortcut(platform) {
    await evaluate("filesFixture.useDotfiles()");
    await until(
      async () =>
        await evaluate(
          "document.querySelector('[role=tree]')?.getAttribute('aria-busy') === 'false' && document.querySelector('.file-name')?.textContent === 'visible'",
        ),
      "dotfile fixture loaded",
    );
    const names = () =>
      evaluate(
        "[...document.querySelectorAll('.file-name')].map(node => node.textContent)",
      );
    const hint = () =>
      evaluate(
        "document.querySelector('.filter-hint').hidden ? null : document.querySelector('.filter-hint').textContent",
      );
    assert.equal(await hint(), "Dotfiles hidden");
    await evaluate(
      "window.shortcutEvents = []; window.addEventListener('keydown', event => shortcutEvents.push({ prevented: event.defaultPrevented, repeat: event.repeat }));",
    );
    await evaluate("document.querySelector('[role=treeitem]').focus()");
    const mac = platform === "mac";
    const gesture = () =>
      mac ? key(">", "Period", 190, 12) : key("h", "KeyH", 72, 2);
    await gesture();
    assert.deepEqual(await names(), [".config", ".profile", "visible"]);
    assert.deepEqual(await evaluate("shortcutEvents.at(-1)"), {
      prevented: true,
      repeat: false,
    });
    assert.equal(await hint(), null);
    await evaluate("document.querySelector('[role=treeitem]').focus()");
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: mac ? ">" : "h",
      code: mac ? "Period" : "KeyH",
      windowsVirtualKeyCode: mac ? 190 : 72,
      modifiers: mac ? 12 : 2,
      autoRepeat: true,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: mac ? ">" : "h",
      code: mac ? "Period" : "KeyH",
      windowsVirtualKeyCode: mac ? 190 : 72,
      modifiers: mac ? 12 : 2,
    });
    assert.deepEqual(
      await names(),
      [".config", ".profile", "visible"],
      "repeat did not toggle",
    );
    assert.deepEqual(await evaluate("shortcutEvents.at(-1)"), {
      prevented: true,
      repeat: true,
    });
    await evaluate(
      (selector) => document.querySelector(selector).focus(),
      address,
    );
    await gesture();
    assert.deepEqual(
      await names(),
      [".config", ".profile", "visible"],
      "address editing is not intercepted",
    );
    assert.deepEqual(await evaluate("shortcutEvents.at(-1)"), {
      prevented: false,
      repeat: false,
    });
    await evaluate(
      (selector) => document.querySelector(selector).focus(),
      selector("actions"),
    );
    await key("Enter", "Enter", 13);
    const ax = await send("Accessibility.getFullAXTree");
    const item = ax.nodes.find(
      (node) =>
        node.role?.value === "menuitemcheckbox" &&
        node.name?.value === "Show dotfiles (names starting with .)",
    );
    assert.equal(
      item?.description?.value,
      mac ? "Shortcut: Cmd+Shift+." : "Shortcut: Ctrl+H",
    );
    await key("End", "End", 35);
    await evaluate("filesFixture.setLanguage('pt-BR')");
    assert.equal(
      await evaluate("document.querySelector('.menu-shortcut').textContent"),
      mac ? "Atalho: Cmd+Shift+." : "Atalho: Ctrl+H",
    );
    await gesture();
    assert.deepEqual(await names(), ["visible"], "shortcut works from menu");
    assert.equal(await hint(), "Itens iniciados por ponto ocultos");
    console.log(`PASS scoped shortcut ${platform}`);
  }
  const scenario = process.argv[2] ?? "matrix";
  assert.ok(
    [
      "pointer",
      "notice",
      "scroll",
      "matrix",
      "hidden",
      "shortcut-mac",
      "shortcut-linux",
    ].includes(scenario),
  );
  if (scenario.startsWith("shortcut-")) {
    await send("Emulation.setUserAgentOverride", {
      userAgent: await evaluate("navigator.userAgent"),
      platform: scenario === "shortcut-mac" ? "MacIntel" : "Linux aarch64",
    });
    assert.equal(
      await evaluate("navigator.platform"),
      scenario === "shortcut-mac" ? "MacIntel" : "Linux aarch64",
    );
  }
  const sizes =
    scenario === "matrix" || scenario === "hidden"
      ? [
          [196, 1],
          [196, 2],
          [320, 1],
        ]
      : [[196, 1]];
  for (const [width, scale] of sizes)
    for (const language of scenario === "matrix"
      ? ["en-US", "pt-BR"]
      : ["en-US"])
      for (const light of scenario === "matrix" || scenario === "hidden"
        ? [false, true]
        : [false]) {
        const tag = `${width}x${scale}-${language}-${light ? "light" : "dark"}`;
        const names = labels(language);
        for (const kind of scenario === "matrix"
          ? ["pointer", "notice", "scroll"]
          : [scenario]) {
          await load(width, language, light, scale);
          if (kind === "pointer") await pointer(names, tag);
          if (kind === "notice") await notice(language, names, tag);
          if (kind === "scroll") await scroll(width, names, tag);
          if (kind === "hidden") await hidden(tag);
          if (kind === "shortcut-mac") await shortcut("mac");
          if (kind === "shortcut-linux") await shortcut("linux");
        }
        if (scenario === "matrix") console.log(`PASS matrix ${tag}`);
      }
  await send("Browser.close", {}, undefined);
} finally {
  if (child && !isExited) {
    child.kill("SIGTERM");
    const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(kill);
  }
  process.removeListener("SIGTERM", interrupt);
  await rm(root, { recursive: true, force: true });
}
