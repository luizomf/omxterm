import assert from "node:assert/strict";
import type { BrowserWindow, KeyboardInputEvent } from "electron";
import {
  terminalApplicationMenuTemplate,
  terminalActionInvocations,
} from "../../src/main/application-menu";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { installApplicationMenu } from "../../src/main/native-application-menu";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { LocalImageData } from "../../src/shared/local-image";
import { createNativeHostPng } from "./native-host-png";
import { exercisePanelKeyboard } from "./auxiliary-panel-keyboard";
import { capturePanelInput } from "./auxiliary-panel-input";

interface PanelOptions {
  readonly window: BrowserWindow;
  readonly application: TerminalApplication<BrowserWindow>;
  readonly second: () => BrowserWindow;
  readonly sizes: Array<Array<{ cols: number; rows: number }>>;
  readonly output: (index: number, data: string) => void;
  readonly inputReady: (index: number) => boolean;
  readonly captureInput: (
    index: number,
    listener: (data: string) => void,
  ) => () => void;
  readonly clipboard: { text: string; writes: string[]; reads: number };
  readonly showAbout: () => void;
  readonly imagePending: () => boolean;
  readonly finishImage: (image: LocalImageData | null) => void;
  readonly reload: () => void;
}
const shown = "!document.querySelector('#snippets-sidebar').hidden";
const searchFocused =
  "document.activeElement === document.querySelector('#snippets-sidebar input')";
const terminalFocused =
  "document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)";
const separator = "document.querySelector('.auxiliary-separator')";
export type AuxiliaryPanelScenario = ReturnType<typeof createScenario>;
type Scene = AuxiliaryPanelScenario;

function createScenario(options: PanelOptions) {
  const { window, application } = options;
  const contents = window.webContents;
  const evaluate = <T = unknown>(script: string) =>
    contents.executeJavaScript(script) as Promise<T>;
  const wait = async (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Auxiliary fixture timed out: ${label}`);
  };
  const until = (expression: string) =>
    wait(() => evaluate<boolean>(expression), expression);
  const input: string[] = [];
  const sessionInput: string[][] = [[], []];
  let bindings = terminalDefaultKeybinds(process.platform);
  const unexpected = () => assert.fail("Unexpected panel fixture menu action");
  const actions = {
    newWindow: unexpected,
    closeSelectedWindow: unexpected,
    newTabInSelectedWindow: () => application.newTabInSelectedWindow(),
    closeSelectedTab: unexpected,
    selectNextTab: unexpected,
    selectPreviousTab: unexpected,
    selectTabInSelectedWindow: unexpected,
    requestQuit: unexpected,
    toggleSelectedFullScreen: () => application.toggleSelectedFullScreen(),
    toggleSelectedAlwaysOnTop: unexpected,
    toggleSelectedDevTools: unexpected,
    zoomInSelectedWindow: unexpected,
    zoomOutSelectedWindow: unexpected,
    resetSelectedWindowZoom: unexpected,
    copySelectedTerminal: () => application.clipboardSelectedWindow("copy"),
    pasteSelectedTerminal: () => application.clipboardSelectedWindow("paste"),
    selectAllSelectedTerminal: () =>
      application.clipboardSelectedWindow("select-all"),
    findInSelectedTerminal: unexpected,
    toggleSelectedSnippets: () => application.toggleSelectedSnippets(),
    toggleSelectedTabBar: () => application.toggleSelectedTabBar(),
    toggleSelectedTitleBar: () => application.toggleSelectedTitleBar(),
    reloadUserConfiguration: options.reload,
    openLocalImage: () => application.openLocalImageInSelectedWindow(),
    showAbout: options.showAbout,
    showSettings: unexpected,
  };
  const invocations = terminalActionInvocations(actions);
  deliverKeybindsFromKeyEvents(
    contents,
    () => bindings,
    (action) => invocations[action](),
    process.platform,
  );
  const install = () =>
    installApplicationMenu(
      terminalApplicationMenuTemplate("OMXTerm", actions, bindings),
    );
  let menu = install();
  const clickMenu = (label: string) => {
    const item = menu.items
      .flatMap((item) => item.submenu?.items ?? [])
      .find((item) => item.label === label);
    assert.ok(item, label);
    (
      item.click as (
        item: Electron.MenuItem,
        window: BrowserWindow,
        event: object,
      ) => void
    )(item, window, {});
  };
  const key = (
    keyCode: string,
    modifiers: KeyboardInputEvent["modifiers"] = [],
  ) => {
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const width = () =>
    evaluate<number>(
      "document.querySelector('#snippets-sidebar').getBoundingClientRect().width",
    );
  const point = () =>
    evaluate<{ x: number; y: number }>(
      `(() => { const r = ${separator}.getBoundingClientRect(); return { x: Math.round(r.x + 3), y: Math.round(r.y + r.height / 2) }; })()`,
    );
  return {
    options,
    contents,
    evaluate,
    wait,
    until,
    key,
    clickMenu,
    input,
    sessionInput,
    width,
    point,
    remap() {
      bindings = {
        ...bindings,
        copy: "Control+Alt+C",
        paste: "Control+Alt+V",
        selectAll: "Control+Alt+A",
        toggleSnippets: "Control+Alt+S",
      };
      menu = install();
    },
  };
}

// Synthetic Chromium input, real application menu callbacks, main keybind
// matcher, preload, production window host, WebGL Surfaces and fixture PTYs.
// This is not evidence of physical keyboard layouts or OS pointer hardware.
export async function exerciseAuxiliaryPanel(options: PanelOptions) {
  const scene = createScenario(options);
  const { window, application, sizes } = options;
  const { until, wait, evaluate, clickMenu, width } = scene;
  window.setContentSize(1000, 700);
  window.focus();
  await until("document.querySelectorAll('canvas').length === 1");
  await wait(() => sizes[0]!.length > 0, "initial grid");
  await until(terminalFocused);
  application.newTabInSelectedWindow();
  await until("document.querySelectorAll('canvas').length === 2");
  await wait(() => (sizes[1]?.length ?? 0) > 0, "second grid");
  const releaseInput = await capturePanelInput(scene);
  try {
    await evaluate(
      "window.panelCanvases = [...document.querySelectorAll('canvas')]; window.panelSurfaces = [...document.querySelectorAll('.terminal-surface')]",
    );
    const hiddenSize = { ...sizes[0]!.at(-1)! };
    const originalColumns = sizes[1]!.at(-1)!.cols;
    clickMenu("Toggle Snippets");
    await until(`${shown} && ${searchFocused}`);
    await until("!!document.querySelector('#snippets-sidebar li button')");
    assert.equal(await width(), 280);
    await wait(
      () => sizes[1]!.at(-1)!.cols < originalColumns,
      "selected grid shrinks",
    );
    await until(searchFocused);
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await until(searchFocused);
    await exerciseClipboard(scene);
    await exerciseResize(scene);
    assert.deepEqual(sizes[0]!.at(-1), hiddenSize);
    options.output(0, "\r\nHIDDEN_PANEL_OUTPUT\r\n");
    await exerciseSmallWindow(scene);
    await exerciseOverlays(scene);
    await exerciseRetention(scene, hiddenSize);
    return {
      auxiliary: "layout-lifetime-input-overlays-verified",
      input: "synthetic-chromium-not-physical",
    };
  } finally {
    releaseInput();
  }
}

async function exerciseClipboard(s: Scene) {
  const { clipboard } = s.options;
  const { clickMenu, until, wait, key, evaluate, input } = s;
  clipboard.text = "query\ntext";
  clickMenu("Paste");
  await until(
    "document.querySelector('#snippets-sidebar input').value === 'query text'",
  );
  clickMenu("Select All");
  clickMenu("Copy");
  await wait(() => clipboard.writes.at(-1) === "query text", "menu query copy");
  const defaults: KeyboardInputEvent["modifiers"] =
    process.platform === "darwin" ? ["meta"] : ["control", "shift"];
  clipboard.text = "default";
  key("A", defaults);
  key("V", defaults);
  await until(
    "document.querySelector('#snippets-sidebar input').value === 'default'",
  );
  key("A", defaults);
  key("C", defaults);
  await wait(() => clipboard.writes.at(-1) === "default", "default query copy");
  key("S", process.platform === "darwin" ? ["meta", "shift"] : defaults);
  await until(`!(${shown})`);
  s.remap();
  key("S", ["control", "alt"]);
  await until(searchFocused);
  assert.equal(
    await evaluate("document.querySelector('#snippets-sidebar input').value"),
    "default",
  );
  clipboard.text = "remapped";
  key("A", ["control", "alt"]);
  key("V", ["control", "alt"]);
  await until(
    "document.querySelector('#snippets-sidebar input').value === 'remapped'",
  );
  key("A", ["control", "alt"]);
  key("C", ["control", "alt"]);
  await wait(
    () => clipboard.writes.at(-1) === "remapped",
    "remapped query copy",
  );
  assert.equal(input.join(""), "");
  await evaluate(
    "document.querySelector('#snippets-sidebar input').value = ''; document.querySelector('#snippets-sidebar input').dispatchEvent(new Event('input'))",
  );
}

async function exerciseResize(s: Scene) {
  const { contents, until, wait, width, key, evaluate } = s;
  const point = await s.point();
  contents.sendInputEvent({ type: "mouseMove", ...point });
  contents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await until(`${separator}.classList.contains('dragging')`);
  contents.sendInputEvent({
    type: "mouseMove",
    x: point.x - 80,
    y: point.y,
    modifiers: ["leftbuttondown"],
  });
  await wait(async () => (await width()) >= 350, "captured resize");
  contents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    clickCount: 1,
    x: point.x - 80,
    y: point.y,
  });
  await until(`!${separator}.classList.contains('dragging')`);
  for (const [code, expected] of [
    ["Home", 220],
    ["Left", 230],
    ["Right", 220],
    ["End", 560],
  ] as const) {
    key(code);
    await wait(async () => (await width()) === expected, `keyboard ${code}`);
  }
  assert.equal(
    await evaluate("document.activeElement.className"),
    "auxiliary-separator",
  );
}

async function exerciseSmallWindow(s: Scene) {
  const { window } = s.options;
  const { until, wait, width, key, evaluate } = s;
  window.setContentSize(500, 700);
  await wait(async () => (await width()) === 314, "automatic clamp");
  window.setContentSize(1000, 700);
  await wait(
    async () => (await width()) === 560,
    "preferred width restoration",
  );
  window.setContentSize(405, 300);
  await until(`!(${shown})`);
  key("S", ["control", "alt"]);
  await until(
    "document.querySelector('.auxiliary-status').textContent.includes('Widen the window')",
  );
  window.setContentSize(406, 300);
  await until(
    "document.querySelector('#terminal-window-content').getBoundingClientRect().width === 406",
  );
  assert.equal(await evaluate(shown), false);
  key("S", ["control", "alt"]);
  await until(shown);
  assert.equal(await width(), 220);
  window.setContentSize(1000, 300);
  await wait(
    async () => (await width()) === 560,
    "preferred width survives hiding",
  );
  await evaluate(
    "document.querySelector('.snippets-results').scrollTop = 100000",
  );
  assert.equal(
    await evaluate(
      "(() => { const r = document.querySelector('.auxiliary-header button').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()",
    ),
    true,
  );
  await evaluate("document.querySelector('.auxiliary-header button').click()");
  await until(terminalFocused);
  key("S", ["control", "alt"]);
  await until(searchFocused);
}

async function exerciseOverlays(s: Scene) {
  const { contents, until, wait, clickMenu, evaluate, input, key } = s;
  const point = await s.point();
  contents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await until(`${separator}.classList.contains('dragging')`);
  clickMenu("About OMXTerm");
  await until(
    "!!document.querySelector('.about-dialog[open]') && document.querySelector('#snippets-sidebar').inert",
  );
  await until(`!${separator}.classList.contains('dragging')`);
  contents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    clickCount: 1,
    ...point,
  });
  clickMenu("Toggle Snippets");
  clickMenu("Paste");
  await evaluate(
    "document.querySelector('#snippets-sidebar li button').click(); document.querySelector('.auxiliary-header button').click()",
  );
  assert.equal(await evaluate(shown), true);
  assert.equal(input.join(""), "");
  await evaluate("document.querySelector('.about-close').click()");
  await until(terminalFocused);
  clickMenu("Open Local Image…");
  await wait(s.options.imagePending, "image picker pending");
  await until("document.querySelector('#snippets-sidebar').inert");
  clickMenu("Toggle Snippets");
  s.options.finishImage(null);
  await until(terminalFocused);
  await until("!document.querySelector('#snippets-sidebar').inert");
  clickMenu("Open Local Image…");
  await wait(s.options.imagePending, "image load pending");
  s.options.finishImage({
    name: "synthetic.png",
    mime: "image/png",
    width: 2,
    height: 2,
    data: createNativeHostPng(2, 2),
  });
  await until(
    "!!document.querySelector('.local-image-preview[open] img')?.naturalWidth",
  );
  clickMenu("Toggle Snippets");
  clickMenu("Paste");
  key("Escape");
  await until(terminalFocused);
  assert.equal(await evaluate(shown), true);
  assert.equal(input.join(""), "");
}

async function exerciseRetention(
  s: Scene,
  hiddenSize: { cols: number; rows: number },
) {
  const { window, application, sizes, clipboard } = s.options;
  const { clickMenu, until, wait, evaluate, width } = s;
  for (const theme of ["#f5f5f5", "#000000"]) {
    clickMenu("Reload User Configuration");
    await until(
      `document.documentElement.style.getPropertyValue('--terminal-background') === '${theme}'`,
    );
    await wait(async () => (await width()) === 560, "reload width");
  }
  clickMenu("Toggle Title Bar");
  clickMenu("Toggle Tab Bar");
  for (const fullscreen of [true, false]) {
    window.setFullScreen(fullscreen);
    await wait(() => window.isFullScreen() === fullscreen, "native fullscreen");
    await evaluate("new Promise(requestAnimationFrame)");
    if (fullscreen)
      await until("document.querySelector('.window-title-bar').hidden");
  }
  assert.equal(
    await evaluate(
      "window.panelCanvases.every((c, i) => c === document.querySelectorAll('canvas')[i]) && window.panelSurfaces.every((s, i) => s === document.querySelectorAll('.terminal-surface')[i])",
    ),
    true,
  );
  assert.deepEqual(sizes[0]!.at(-1), hiddenSize);
  assert.equal(sizes.length, 2, "layout never creates a replacement session");
  await application.newWindow();
  await wait(
    async () =>
      (await s.options
        .second()
        .webContents.executeJavaScript(
          "document.querySelectorAll('canvas').length === 1",
        )) as boolean,
    "peer Surface",
  );
  assert.equal(
    await s.options
      .second()
      .webContents.executeJavaScript(
        "document.querySelector('#snippets-sidebar').hidden",
      ),
    true,
  );
  s.options.second().focus();
  await wait(
    async () =>
      (await s.options
        .second()
        .webContents.executeJavaScript(terminalFocused)) as boolean,
    "peer host subscriptions ready",
  );
  // Peer-specific notification proves isolation, not shortcut delivery.
  s.options.second().webContents.send(terminalIpc.snippetsToggle);
  await wait(
    async () =>
      (await s.options
        .second()
        .webContents.executeJavaScript(
          "document.querySelector('#snippets-sidebar').getBoundingClientRect().width === 280",
        )) as boolean,
    "independent peer preference",
  );
  assert.equal(await width(), 560);
  window.focus();
  application.selectTabInSelectedWindow(1);
  await until(terminalFocused);
  application.clipboardSelectedWindow("select-all");
  application.clipboardSelectedWindow("copy");
  await wait(
    () => clipboard.writes.some((text) => text.includes("HIDDEN_PANEL_OUTPUT")),
    "hidden output retained in same core",
  );
  await exercisePanelKeyboard(s);
}
