import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow, WebContentsView } from "electron";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
} from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  type ActiveUserConfiguration,
} from "../../src/main/user-configuration-reloader";
import {
  DEFAULT_TERMINAL_THEME,
  type TerminalThemeAppearance,
} from "../../src/shared/terminal-theme";
import type { TerminalApplication } from "../../src/main/terminal-application";
import { waitFor } from "./window-chrome-exercise";
import { focusThemeSeparator } from "./theme-appearance-keyboard";
import { createThemeSearch } from "./theme-appearance-search";

const pane = ".terminal-tab:not([hidden]) .terminal-surface";
const dividers = [
  '.terminal-pane-split[data-direction="row"] > .terminal-pane-divider',
  '.terminal-pane-split[data-direction="column"] > .terminal-pane-divider',
  ".auxiliary-separator",
];
const hidden = "rgba(0, 0, 0, 0)";
type Sizes = ReadonlyArray<ReadonlyArray<{ cols: number; rows: number }>>;

function createScene(
  window: BrowserWindow,
  sizes: Sizes,
  search: () => ReturnType<typeof createThemeSearch>,
  hosted: boolean,
) {
  const contents = window.webContents;
  const evaluate = <T>(script: string, target = window) =>
    target.webContents.executeJavaScript(script) as Promise<T>;
  const until = (script: string) =>
    waitFor(() => evaluate<boolean>(script), script);
  const key = (keyCode: string, shift = false) => {
    const modifiers: Array<"shift"> = shift ? ["shift"] : [];
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  const paint = (selector: string, pseudo = "::before") =>
    evaluate<string>(
      `getComputedStyle(document.querySelector(${JSON.stringify(selector)}), ${JSON.stringify(pseudo)}).backgroundColor`,
    );
  const point = (selector: string) =>
    evaluate<{ x: number; y: number }>(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)}; })()`,
    );
  const idle = async () => {
    contents.sendInputEvent({ type: "mouseMove", x: 10, y: 100 });
    await search().focus();
    await until(
      `!document.querySelector('.terminal-pane-divider:hover, .auxiliary-separator:hover')`,
    );
  };
  const grid = () => sizes.map((events) => ({ ...events.at(-1)! }));
  const changed = (before: ReturnType<typeof grid>) =>
    sizes.some(
      (events, i) =>
        events.at(-1)!.cols !== before[i]!.cols ||
        events.at(-1)!.rows !== before[i]!.rows,
    );
  return {
    contents,
    evaluate,
    until,
    key,
    paint,
    point,
    idle,
    grid,
    changed,
    hosted,
  };
}

export async function openThemeSearch(
  window: BrowserWindow,
  until: (script: string) => Promise<void>,
  snippets?: { assertActivated(): void },
) {
  await until("!document.querySelector('#snippets-sidebar').hidden");
  if (!snippets) {
    await until("!!document.querySelector('#snippets-sidebar input')");
    return createThemeSearch(
      window.webContents,
      "#snippets-sidebar input",
      () => !window.isDestroyed(),
    );
  }
  const hosted = () =>
    window.contentView.children.filter(
      (view): view is WebContentsView =>
        "webContents" in view &&
        !(view as WebContentsView).webContents.isDestroyed() &&
        (view as WebContentsView).webContents
          .getURL()
          .startsWith("omx-extension://"),
    );
  await waitFor(async () => {
    const views = hosted();
    return (
      views.length === 1 &&
      views[0]!.getVisible() &&
      views[0]!.webContents.isFocused() &&
      (await views[0]!.webContents.executeJavaScript(
        "document.querySelectorAll('li .snippet-activate').length === 1 && !!document.querySelector('input[type=search]')",
      )) === true
    );
  }, "installed Snippets child and catalog");
  const view = hosted()[0]!;
  snippets.assertActivated();
  return createThemeSearch(
    view.webContents,
    "input[type=search]",
    () =>
      !window.isDestroyed() &&
      window.contentView.children.includes(view) &&
      !view.webContents.isDestroyed() &&
      view.getVisible(),
  );
}

// Real file loader/reloader, production fan-out and retained hosts/PTYs. Input
// is Chromium synthetic input, not physical keyboard or pointer hardware.
export async function exerciseTheme(
  options: {
    window: BrowserWindow;
    application: TerminalApplication<BrowserWindow>;
    second: () => BrowserWindow;
    sizes: Sizes;
    hostedSnippets?: { targetReady(): boolean; assertActivated(): void };
  },
  root: string,
  apply: (state: ActiveUserConfiguration, committed: boolean) => void,
  outputs: ReadonlyArray<(data: string) => void>,
) {
  const { window, application, sizes } = options;
  let search!: ReturnType<typeof createThemeSearch>;
  const scene = createScene(
    window,
    sizes,
    () => search,
    !!options.hostedSnippets,
  );
  const { contents, evaluate, until, paint, point, idle } = scene;
  window.setContentSize(1200, 800);
  window.focus();
  await evaluate("globalThis.__windowChromeHostReady()");
  await waitFor(() => (sizes[0]?.length ?? 0) > 0, "first grid");
  application.splitSelectedPane("right");
  await until(`document.querySelectorAll('${pane} canvas').length === 2`);
  await waitFor(() => (sizes[1]?.length ?? 0) > 0, "right split grid");
  application.splitSelectedPane("down");
  await until(`document.querySelectorAll('${pane} canvas').length === 3`);
  await waitFor(() => (sizes[2]?.length ?? 0) > 0, "down split grid");
  if (options.hostedSnippets)
    await waitFor(
      options.hostedSnippets.targetReady,
      "focused third pane invocation target",
    );
  application.toggleSelectedSnippets();
  search = await openThemeSearch(window, until, options.hostedSnippets);
  await application.newWindow();
  const peer = options.second();
  await evaluate("globalThis.__windowChromeHostReady()", peer);
  window.focus();
  await idle();
  await evaluate(
    `globalThis.appearanceCanvases = [...document.querySelectorAll('canvas')]`,
  );
  await search.retain();
  const directory = path.join(root, "appearance-xdg", "omxterm");
  await mkdir(directory, { recursive: true });
  // The accent case proves the 1px line paints over first-row cell paint,
  // which only touches the pane's top edge without top padding (the default
  // is 12 px since #932).
  await writeFile(
    path.join(directory, "config.json"),
    JSON.stringify({
      version: 1,
      theme: { path: "theme.json" },
      terminal: { padding: { top: 0 } },
    }),
  );
  const reloader = createUserConfigurationReloader({
    initial: { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
    load: () =>
      loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: path.dirname(directory) },
        homeDirectory: root,
        getInstalledFontFamilyMetrics: async () => undefined,
      }),
    apply,
  });
  async function reload(appearance?: TerminalThemeAppearance, light = false) {
    await writeFile(
      path.join(directory, "theme.json"),
      JSON.stringify({
        ...DEFAULT_TERMINAL_THEME,
        colors: {
          ...DEFAULT_TERMINAL_THEME.colors,
          ...(light ? { background: "#f5f5f5", foreground: "#161616" } : {}),
        },
        ...(appearance === undefined ? {} : { appearance }),
      }),
    );
    await reloader.reload();
    assert.deepEqual(reloader.current().userFileErrors, []);
    for (const target of [window, peer])
      await evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        target,
      );
  }
  const accent = `${pane}.pane-focused`;
  await reload({
    paneDivider: "#123456",
    auxiliaryPanelDivider: "#654321",
    activePaneHighlight: "#abcdef",
  });
  for (const selector of dividers)
    assert.equal(
      await paint(selector),
      selector === dividers[2] ? "rgb(101, 67, 33)" : "rgb(18, 52, 86)",
    );
  assert.equal(await paint(accent, "::after"), "rgb(171, 205, 239)");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.documentElement).getPropertyValue('--terminal-pane-accent').trim()",
      peer,
    ),
    "#abcdef",
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.auxiliary-panel'), '::after').content",
    ),
    "none",
  );
  outputs[2]!("\u001b[H\u001b[48;2;255;0;0m" + " ".repeat(80) + "\u001b[0m");
  await assertTopPaint(window, accent);
  for (const selector of dividers) {
    const p = await point(selector);
    contents.sendInputEvent({ type: "mouseMove", ...p });
    await until(
      `document.querySelector(${JSON.stringify(selector)}).matches(':hover')`,
    );
    const color =
      selector === dividers[2] ? "rgb(101, 67, 33)" : "rgb(18, 52, 86)";
    assert.equal(await paint(selector), color);
    if (scene.hosted) contents.focus();
    await evaluate("document.activeElement.blur()");
    contents.sendInputEvent({
      type: "mouseDown",
      button: "left",
      clickCount: 1,
      ...p,
    });
    await until(
      `document.querySelector(${JSON.stringify(selector)}).classList.contains('dragging')`,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).blur()`,
    );
    assert.equal(
      await paint(selector),
      color,
      "Custom drag retains exact color",
    );
    contents.sendInputEvent({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      ...p,
    });
  }
  await idle();
  const counts = sizes.map((events) => events.length);
  await reload({
    paneDivider: null,
    auxiliaryPanelDivider: null,
    activePaneHighlight: null,
  });
  assert.deepEqual(
    sizes.map((events) => events.length),
    counts,
    "Appearance-only reload must not resize PTYs",
  );
  assert.equal(await search.focused(), true);
  for (const selector of dividers) assert.equal(await paint(selector), hidden);
  assert.equal(await paint(accent, "::after"), hidden);
  assert.equal(
    await evaluate(
      "getComputedStyle(document.documentElement).getPropertyValue('--terminal-pane-accent').trim()",
      peer,
    ),
    "transparent",
  );
  await exerciseHiddenDividers(scene);
  await reload(undefined, true);
  assert.equal(await paint(accent, "::after"), "rgb(22, 22, 22)");
  for (const selector of dividers) {
    const normal = await paint(selector);
    assert.match(normal, /^color\(srgb /u);
    // (245 * .82 + 22 * .18) / 255, Chromium color-mix serialization.
    assert.ok(Math.abs(Number(normal.split(" ")[1]) - 0.80337) < 0.001, normal);
    const p = await point(selector);
    contents.sendInputEvent({ type: "mouseMove", ...p });
    await until(
      `document.querySelector(${JSON.stringify(selector)}).matches(':hover')`,
    );
    assert.notEqual(
      await paint(selector),
      normal,
      "Omission restores brighter interaction paint",
    );
    await idle();
  }
  await writeFile(
    path.join(directory, "config.json"),
    JSON.stringify({
      version: 1,
      window: { transparency: 0.25 },
      theme: { path: "theme.json" },
    }),
  );
  await reload();
  assert.equal(await paint(accent, "::after"), "rgb(128, 212, 255)");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.documentElement).getPropertyValue('--terminal-background-opacity').trim()",
    ),
    process.platform === "win32" ? "1" : "0.75",
  );
  assert.equal(
    await evaluate(
      "appearanceCanvases.every((canvas, i) => document.querySelectorAll('canvas')[i] === canvas)",
    ),
    true,
  );
  assert.equal(await search.retained(), true);
  assert.equal(sizes.length, 4);
  return {
    appearance: "file-reload-three-roles-both-axes-panel-focus-and-grids",
    input: "synthetic-chromium-not-physical",
  };
}

export function hasThemeTopPaint(
  { width, height }: { width: number; height: number },
  pixels: Uint8Array,
) {
  const byteLength = width * height * 4;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 2 ||
    !Number.isSafeInteger(byteLength) ||
    pixels.length !== byteLength
  )
    return false;
  // NativeImage bitmap is BGRA. Sample the center of the first/last rows,
  // avoiding fractional-scale blending between the marker and red cell.
  const top = Math.floor(width / 2) * 4;
  const bottom = (height - 1) * width * 4 + top;
  return (
    [239, 205, 171, 255].every((byte, i) => pixels[top + i] === byte) &&
    [0, 0, 255, 255].every((byte, i) => pixels[bottom + i] === byte)
  );
}

export async function assertTopPaint(window: BrowserWindow, selector: string) {
  const rect = (await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const bounds = element.getBoundingClientRect();
    return {x: Math.ceil(bounds.x) + 20, y: Math.ceil(bounds.y), width: 1, height: 3};
  })()`)) as { x: number; y: number; width: number; height: number };
  await waitFor(async () => {
    const image = await window.webContents.capturePage(rect);
    // Select the same representation for dimensions and bytes. Scale factor 1
    // does not normalize captured device pixels to the requested DIP rectangle.
    return hasThemeTopPaint(
      image.getSize(1),
      image.toBitmap({ scaleFactor: 1 }),
    );
  }, "Chromium pixels show the 1px accent above opaque first-row cell paint");
}

async function exerciseHiddenDividers(s: ReturnType<typeof createScene>) {
  const {
    contents,
    evaluate,
    until,
    key,
    paint,
    point,
    idle,
    grid,
    changed,
    hosted,
  } = s;
  for (const [index, selector] of dividers.entries()) {
    const element = `document.querySelector(${JSON.stringify(selector)})`;
    await idle();
    const p = await point(selector);
    contents.sendInputEvent({ type: "mouseMove", ...p });
    await until(`${element}.matches(':hover')`);
    assert.equal(
      await paint(selector),
      hidden,
      "Null also hides hovered paint",
    );
    const before = grid();
    // A text field carries focus-visible when focus is moved by script in
    // pointerdown. Blur it first to isolate non-keyboard decorative paint.
    if (hosted) contents.focus();
    await evaluate("document.activeElement.blur()");
    contents.sendInputEvent({
      type: "mouseDown",
      button: "left",
      clickCount: 1,
      ...p,
    });
    await until(`${element}.classList.contains('dragging')`);
    const moved = {
      x: p.x + (index === 1 ? 0 : -40),
      y: p.y + (index === 1 ? 40 : 0),
    };
    contents.sendInputEvent({
      type: "mouseMove",
      ...moved,
      modifiers: ["leftbuttondown"],
    });
    await waitFor(
      () => changed(before),
      "Hidden divider drag refits actual PTY grids",
    );
    if (await evaluate<boolean>(`${element}.matches(':focus-visible')`)) {
      // Panel pointerdown explicitly focuses the separator; Chromium can keep
      // keyboard-visible focus from the preceding text field. That feedback is
      // required, not decorative paint. Also observe drag without focus.
      assert.equal(await paint(selector), "rgb(240, 240, 255)", selector);
      await evaluate(`${element}.blur()`);
    }
    assert.equal(
      await evaluate(`${element}.classList.contains('dragging')`),
      true,
    );
    assert.equal(
      await paint(selector),
      hidden,
      `Null drag without keyboard focus: ${selector}`,
    );
    contents.sendInputEvent({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      ...moved,
    });
    await until(`!${element}.classList.contains('dragging')`);
    // Chromium receives Tab from an existing control. Programmatic focus then
    // selects each separator in that keyboard modality (not OS tab traversal).
    await focusThemeSeparator(
      contents,
      selector,
      hosted ? ".auxiliary-hide" : undefined,
    );
    assert.equal(await paint(selector), "rgb(240, 240, 255)");
    const keyboardGrid = grid();
    key(index === 1 ? "Up" : "Left");
    await waitFor(
      () => changed(keyboardGrid),
      "Keyboard resize of hidden divider refits PTYs",
    );
    assert.equal(await evaluate(`document.activeElement === ${element}`), true);
    assert.equal(await paint(selector), "rgb(240, 240, 255)");
    const focusedPoint = await point(selector);
    contents.sendInputEvent({
      type: "mouseDown",
      button: "left",
      clickCount: 1,
      ...focusedPoint,
    });
    await until(`${element}.classList.contains('dragging')`);
    // Chromium may switch modality on mouseDown; restore keyboard modality
    // during captured drag to exercise simultaneous dragging/focus-visible.
    await focusThemeSeparator(
      contents,
      selector,
      hosted ? ".auxiliary-hide" : undefined,
    );
    assert.equal(
      await evaluate(
        `${element}.matches(':focus-visible') && ${element}.classList.contains('dragging')`,
      ),
      true,
    );
    assert.equal(await paint(selector), "rgb(240, 240, 255)");
    contents.sendInputEvent({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      ...focusedPoint,
    });
    await idle();
    assert.equal(await paint(selector), hidden, "Focus loss restores opt-out");
    assert.equal(
      await evaluate(`${element}.getAttribute('role')`),
      "separator",
    );
  }
}
