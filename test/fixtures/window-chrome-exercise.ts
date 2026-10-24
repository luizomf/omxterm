import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import {
  NATIVE_RESPONSE_MS,
  type ChromeNativeExpectation,
} from "./window-policy";
import { windowGridFits } from "./window-grid-fit";

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function recordNativeActions(target: BrowserWindow, peer: BrowserWindow) {
  const calls: { owner: "target" | "peer"; action: string }[] = [];
  const restore: (() => void)[] = [];
  for (const [owner, window] of [
    ["target", target],
    ["peer", peer],
  ] as const) {
    for (const action of [
      "minimize",
      "maximize",
      "unmaximize",
      "restore",
      "close",
      "hide",
      "show",
    ] as const) {
      const native = window[action];
      window[action] = () => {
        calls.push({ owner, action });
        native.call(window);
      };
      restore.push(() => {
        window[action] = native;
      });
    }
  }
  return {
    calls,
    dispose: () => {
      for (const operation of restore) operation();
    },
  };
}

export async function exerciseCustomControlFocus(
  window: BrowserWindow,
  expectation: ChromeNativeExpectation,
  peer: BrowserWindow,
) {
  if (process.platform === "darwin") return;
  assert.notEqual(
    expectation,
    "not-exercised-macos",
    "Missing native comparison for custom controls",
  );
  const recorded = recordNativeActions(window, peer);
  const terminalFocused = async () =>
    (await window.webContents.executeJavaScript(
      "document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
    )) as boolean;
  const healthy = () => {
    assert.ok(
      !window.isDestroyed() &&
        window.isVisible() &&
        !window.isMinimized() &&
        !window.isFullScreen(),
      "Custom control target must remain presented",
    );
  };
  const nativeState = (maximized: boolean) => {
    healthy();
    assert.equal(
      window.isMaximized(),
      maximized,
      "Custom control final native state must match the selected action/branch",
    );
  };
  const denied = expectation === "native-maximize-not-observed";
  try {
    window.focus();
    await waitFor(
      terminalFocused,
      "terminal input focus before window controls",
    );
    nativeState(false);
    assert.deepEqual(
      recorded.calls,
      [],
      "Unexpected native action before custom controls",
    );
    for (const label of denied
      ? ["Maximize", "Maximize"]
      : ["Maximize", "Restore"]) {
      const start: number = recorded.calls.length;
      const intended = label === "Maximize" ? "maximize" : "unmaximize";
      const finalMaximized = !denied && label === "Maximize";
      const finalLabel = finalMaximized ? "Restore" : "Maximize";
      const exactRoute = () => {
        healthy();
        const delta = recorded.calls.slice(start);
        assert.ok(
          delta.every((call) => call.owner === "target"),
          "Custom control invoked wrong native owner",
        );
        assert.ok(
          delta.length <= 1,
          "Custom control duplicated native invocation",
        );
        if (delta.length)
          assert.equal(
            delta[0]!.action,
            intended,
            "Custom control invoked unexpected native action",
          );
        return delta;
      };
      nativeState(label === "Restore");
      const point = (await window.webContents.executeJavaScript(`(() => {
        const bounds = document.querySelector('[aria-label="${label}"]').getBoundingClientRect();
        return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
      })()`)) as { x: number; y: number };
      nativeState(label === "Restore");
      assert.deepEqual(
        recorded.calls.slice(start),
        [],
        "Unexpected native action before custom click",
      );
      window.webContents.sendInputEvent({ type: "mouseMove", ...point });
      for (const type of ["mouseDown", "mouseUp"] as const)
        window.webContents.sendInputEvent({
          type,
          button: "left",
          clickCount: 1,
          ...point,
        });
      await waitFor(
        () => exactRoute().length === 1,
        "custom control invokes intended native action",
      );
      if (denied) {
        const deadline = Date.now() + NATIVE_RESPONSE_MS;
        while (Date.now() < deadline) {
          exactRoute();
          nativeState(false);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      } else {
        await waitFor(() => {
          exactRoute();
          return window.isMaximized() === finalMaximized;
        }, `native ${label} through the custom control`);
      }
      nativeState(finalMaximized);
      exactRoute();
      await waitFor(async () => {
        const present = (await window.webContents.executeJavaScript(
          `!!document.querySelector('[aria-label="${finalLabel}"]')`,
        )) as boolean;
        nativeState(finalMaximized);
        exactRoute();
        return present;
      }, "native maximize state reaches renderer");
      // Sample the fixed label and focus together in the final renderer task,
      // then revalidate native state and all actions after that await.
      const finalRenderer = (await window.webContents.executeJavaScript(`({
        focused: document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement),
        labelPresent: !!document.querySelector('[aria-label="${finalLabel}"]')
      })`)) as { focused: boolean; labelPresent: boolean };
      nativeState(finalMaximized);
      const delta = exactRoute();
      assert.equal(finalRenderer.focused, true, `${label} retains input focus`);
      assert.equal(
        finalRenderer.labelPresent,
        true,
        `${label} final renderer label`,
      );
      assert.deepEqual(
        delta,
        [{ owner: "target", action: intended }],
        "Exact native action route count",
      );
    }
  } finally {
    recorded.dispose();
  }
}

interface Geometry {
  readonly titleHeight: number;
  readonly inset: number;
  readonly tabs: boolean;
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly availableHeight: number;
  readonly availableWidth: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly handle: boolean;
  readonly handleWidth: number;
  readonly handleHeight: number;
  readonly outsideHandle: boolean;
  readonly sameCanvases: boolean;
  readonly theme: string;
  readonly backgroundOpacity: number;
}
const geometryScript = `(() => {
  const row = document.querySelector('.window-title-bar');
  const handle = document.querySelector('.window-drag-handle');
  const canvas = document.querySelector('.terminal-surface:not([hidden]) canvas');
  const hit = document.elementFromPoint(12, 12);
  const container = document.querySelector('.terminal-surface:not([hidden])');
  const bounds = container.getBoundingClientRect();
  const style = getComputedStyle(container);
  return {
    titleHeight: row.getBoundingClientRect().height,
    inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--native-title-inset')),
    tabs: !document.querySelector('#tab-strip').hidden,
    canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
    canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
    availableHeight: bounds.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    availableWidth: bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
    backingWidth: canvas?.width ?? 0,
    backingHeight: canvas?.height ?? 0,
    handle: !handle.hidden,
    handleWidth: handle.getBoundingClientRect().width,
    handleHeight: handle.getBoundingClientRect().height,
    outsideHandle: !handle.contains(hit),
    sameCanvases: (globalThis.chromeCanvases ?? []).every((canvas, index) => document.querySelectorAll('.terminal-surface canvas')[index] === canvas),
    theme: getComputedStyle(document.documentElement).getPropertyValue('--terminal-background').trim(),
    backgroundOpacity: Number(getComputedStyle(document.documentElement).getPropertyValue('--terminal-background-opacity'))
  };
})()`;

export async function exerciseWindowChrome(options: {
  readonly window: BrowserWindow;
  readonly nativeExpectation: ChromeNativeExpectation;
  readonly application: TerminalApplication<BrowserWindow>;
  readonly sessions: readonly LocalTerminalSession[];
  readonly sizes: ReadonlyArray<ReadonlyArray<{ cols: number; rows: number }>>;
  readonly ended: () => number;
  readonly confirmations: () => number;
  readonly cursor: (point: { x: number; y: number }) => void;
  readonly reload: () => void;
  readonly nativeDrag: () => Promise<string>;
  readonly second: () => BrowserWindow;
  readonly backgroundOpacity: (window: BrowserWindow) => number;
  readonly exerciseMenu: () => Promise<string>;
  readonly queryCell: (index: number) => void;
  readonly cells: ReadonlyArray<{ width: number; height: number } | undefined>;
}) {
  const { window, application, sizes, sessions } = options;
  const evaluate = async <T>(script: string): Promise<T> =>
    (await window.webContents.executeJavaScript(script, true)) as T;
  const geometry = () => evaluate<Geometry>(geometryScript);
  await waitFor(
    () => sessions.length === 1 && (sizes[0]?.length ?? 0) > 0,
    "first real Surface and PTY",
  );
  application.newTabInSelectedWindow();
  await waitFor(
    () => sessions.length === 2 && (sizes[1]?.length ?? 0) > 0,
    "second real Surface and PTY",
  );
  await evaluate(
    "globalThis.chromeCanvases = [...document.querySelectorAll('.terminal-surface canvas')]; globalThis.chromeDocumentToken = {};",
  );
  // Allow the real ResizeObserver and Restty resize grace to settle before
  // comparing counts; no synthetic Surface or PTY replaces the production path.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const windowId = window.id;
  const contentsId = window.webContents.id;
  const ownedSessions = [...sessions];
  const hiddenSizeCount = sizes[0]!.length;
  const first = await geometry();
  const titlePixels = process.platform === "darwin" ? 30 : 34;
  assert.equal(first.titleHeight, process.platform === "darwin" ? 0 : 34);
  assert.equal(first.inset, process.platform === "darwin" ? 30 : 0);
  assert.equal(first.tabs, true);
  const rows = sizes[1]!.at(-1)!.rows;
  application.toggleSelectedTitleBar();
  await waitFor(
    async () =>
      (await geometry()).canvasHeight === first.canvasHeight + titlePixels &&
      sizes[1]!.at(-1)!.rows > rows,
    "title removal refits the existing visible PTY",
  );
  const noTitle = await geometry();
  assert.equal(noTitle.titleHeight, 0);
  assert.equal(noTitle.inset, 0);
  assert.equal(sizes[0]!.length, hiddenSizeCount);
  const visibleResizeCount = sizes[1]!.length;
  const bounds = window.getContentBounds();
  options.cursor({ x: bounds.x + 1, y: bounds.y + 149 });
  await waitFor(
    async () => (await geometry()).handle,
    "whole-width hover reveal",
  );
  const hovered = await geometry();
  assert.equal(hovered.handleWidth, 90);
  assert.equal(hovered.handleHeight, 14);
  assert.equal(hovered.outsideHandle, true);
  assert.equal(hovered.canvasHeight, noTitle.canvasHeight);
  options.cursor({ x: bounds.x + bounds.width - 1, y: bounds.y + 150 });
  await waitFor(async () => !(await geometry()).handle, "hover exit");
  assert.equal(sizes[1]!.length, visibleResizeCount);
  // Exercise real native transitions, not synthetic renderer fullscreen state.
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const currentBounds = window.getContentBounds();
    options.cursor({ x: currentBounds.x + 1, y: currentBounds.y + 149 });
    await waitFor(
      async () => (await geometry()).handle,
      "pre-fullscreen hover",
    );
    window.setFullScreen(true);
    await waitFor(() => window.isFullScreen(), "native fullscreen entry");
    await waitFor(
      async () => !(await geometry()).handle,
      "fullscreen suppresses handle",
    );
    assert.equal((await geometry()).titleHeight, 0);
    assert.equal((await geometry()).inset, 0);
    window.setFullScreen(false);
    await waitFor(() => !window.isFullScreen(), "native fullscreen exit");
    await waitFor(async () => {
      // Some compositors restore bounds after their fullscreen state changes.
      // Keep the probe inside the current native content, not stale geometry.
      const restoredBounds = window.getContentBounds();
      options.cursor({ x: restoredBounds.x + 1, y: restoredBounds.y + 149 });
      return (await geometry()).handle;
    }, "hover handle restored after native fullscreen exit");
    options.cursor({ x: -100_000, y: -100_000 });
    await waitFor(
      async () => !(await geometry()).handle,
      "post-fullscreen hover exit",
    );
    assert.equal(sizes[0]!.length, hiddenSizeCount);
    assert.equal((await geometry()).sameCanvases, true);
    assert.deepEqual(sessions, ownedSessions);
    assert.equal(options.ended(), 0);
  }
  const nativeHandleDrag = await options.nativeDrag();
  application.toggleSelectedTabBar();
  await waitFor(
    async () =>
      !(await geometry()).tabs &&
      (await geometry()).canvasHeight > noTitle.canvasHeight,
    "tab removal without title reveal",
  );
  assert.equal(sizes[0]!.length, hiddenSizeCount);
  assert.equal((await geometry()).inset, 0);
  application.toggleSelectedTitleBar();
  application.toggleSelectedTabBar();
  await waitFor(
    async () =>
      (await geometry()).canvasHeight === first.canvasHeight &&
      (await geometry()).tabs,
    "restored chrome geometry",
  );
  window.setFullScreen(true);
  await waitFor(() => window.isFullScreen(), "visible-title fullscreen entry");
  await waitFor(async () => {
    const current = await geometry();
    return current.titleHeight === 0 && current.inset === 0 && !current.handle;
  }, "fullscreen suppresses chosen visible title");
  window.setFullScreen(false);
  await waitFor(() => !window.isFullScreen(), "visible-title fullscreen exit");
  await waitFor(async () => {
    const current = await geometry();
    return (
      current.titleHeight === first.titleHeight &&
      current.inset === first.inset &&
      current.canvasHeight === first.canvasHeight &&
      !current.handle
    );
  }, "fullscreen exit restores chosen visible title and geometry");
  options.reload();
  await waitFor(
    async () => (await geometry()).theme === "#123456",
    "live theme reload",
  );
  const reloaded = await geometry();
  assert.equal(reloaded.canvasHeight, first.canvasHeight);
  assert.equal(reloaded.tabs, true);
  assert.equal(reloaded.sameCanvases, true);
  assert.equal(reloaded.backgroundOpacity, options.backgroundOpacity(window));
  assert.equal(sizes[0]!.length, hiddenSizeCount);
  assert.equal(window.id, windowId);
  assert.equal(window.webContents.id, contentsId);
  assert.deepEqual(sessions, ownedSessions);
  assert.equal(options.ended(), 0);
  await evaluate("window.omxterm.terminal.windowChrome('close')");
  await waitFor(
    () => options.confirmations() === 1,
    "app control reaches guarded busy close",
  );
  assert.equal(window.isDestroyed(), false);
  assert.equal(options.ended(), 0);
  await application.newWindow();
  await waitFor(
    () => sessions.length === 3 && (sizes[2]?.length ?? 0) > 0,
    "new window consumes reloaded defaults",
  );
  const future = (await options
    .second()
    .webContents.executeJavaScript(geometryScript, true)) as Geometry;
  assert.equal(future.inset, 0);
  assert.equal(future.titleHeight, 0);
  assert.equal(future.tabs, false);
  assert.equal(
    future.backgroundOpacity,
    options.backgroundOpacity(options.second()),
  );
  // Tiling may resize the first native window when the second opens. Its
  // Surface and real PTY must fit the new bounds, not a stale initial height.
  options.queryCell(1);
  await waitFor(
    () => options.cells[1] !== undefined,
    "native Surface cell report",
  );
  const fitsNativeBounds = async () => {
    const current = await geometry();
    const cell = options.cells[1]!;
    const grid = sizes[1]!.at(-1)!;
    const [width, height] = window.getContentSize();
    return (
      Math.abs(current.viewportWidth - width!) <= 1 &&
      Math.abs(current.viewportHeight - height!) <= 1 &&
      Math.abs(current.canvasWidth - current.availableWidth) <= 1 &&
      Math.abs(current.canvasHeight - current.availableHeight) <= 1 &&
      windowGridFits(
        { width: current.backingWidth, height: current.backingHeight },
        cell,
        grid,
      )
    );
  };
  await waitFor(
    fitsNativeBounds,
    "Surface and PTY fit actual native bounds after second window",
  );
  assert.equal(sizes[0]!.length, hiddenSizeCount);
  await exerciseCustomControlFocus(
    window,
    options.nativeExpectation,
    options.second(),
  );
  await waitFor(
    fitsNativeBounds,
    "Surface and PTY fit native bounds after custom controls",
  );
  const menu = await options.exerciseMenu();
  assert.equal(window.id, windowId);
  assert.equal(window.webContents.id, contentsId);
  assert.deepEqual(sessions.slice(0, 2), ownedSessions);
  assert.equal((await geometry()).sameCanvases, true);
  assert.equal(options.ended(), 0);
  const isolation = await evaluate<{ node: boolean; isolated: boolean }>(
    "({node: typeof require === 'undefined', isolated: typeof process === 'undefined'})",
  );
  assert.equal(isolation.node, true);
  assert.equal(isolation.isolated, true);
  return {
    platform: process.platform,
    nativeExpectation: options.nativeExpectation,
    nativeGeometryVerified: true,
    menu,
    titlePixels,
    sameWindowAndContents: true,
    sameCanvasesAndSessions: true,
    hiddenGeometryPreserved: true,
    selectedPtyRefitted: true,
    hoverGeometryUnchanged: true,
    fullscreenHandleRestored: true,
    nativeHandleDrag,
    guardedBusyClose: true,
    reloadPreservedChoices: true,
    futureDefaults: true,
    isolated: true,
  };
}
