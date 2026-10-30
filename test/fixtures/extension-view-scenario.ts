/* eslint-disable max-lines -- One supervised composition owns the real PTY, Settings, child views and pin through failure. */
import assert from "node:assert/strict";
import {
  type BrowserWindow,
  type WebContents,
  type WebContentsView,
  ipcMain,
  clipboard,
} from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { registerExtensionViewScheme } from "../../src/main/extension-view-host";
import { startExtensionViewHost } from "../../src/main/extension-view-ipc";
import {
  createCoreActionCatalog,
  coreActionForKeyboardInput,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";
import { installApplicationMenu } from "../../src/main/native-application-menu";
import { startCommandPalette } from "../../src/main/command-palette";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { hasNativeAltGr } from "../../src/main/keyboard-modifiers";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import { createSettingsExercise } from "./settings-dialog-exercise";
import { createExtensionFixtureResources } from "./extension-view-resources";
import { exerciseExtensionPolicy } from "./extension-view-policy";
import { waitFor } from "./window-chrome-exercise";
import { explicitFixtureReadyMarker } from "./restty-host-platform";

export const extensionViewOnly = process.argv.includes(
  "--fixture-extension-view",
);
// Electron requires this registration before readiness, not inside the exercise.
if (extensionViewOnly) registerExtensionViewScheme();
let output = "";
export function observeExtensionFixtureOutput(data: string) {
  if (extensionViewOnly) output = (output + data).slice(-8192);
}
export function extensionFixtureLaunchRequest() {
  return {
    kind: "explicit-command" as const,
    executable: "/bin/sh",
    arguments: [
      "-c",
      `stty -echo || exit 1; printf '${explicitFixtureReadyMarker}\\n'; while IFS= read -r line; do printf '__EXT_ACK__%s\\n' "$line"; done`,
    ],
  };
}

// eslint-disable-next-line max-lines-per-function -- One ordered native lifecycle; helpers must not obscure ownership and retirement assertions.
export async function exerciseExtensionViews(options: {
  window: BrowserWindow;
  root: string;
  application: TerminalApplication<BrowserWindow>;
  router: TerminalIpcRouter;
  apply: Parameters<typeof createSettingsExercise>[3];
  showAbout(): void;
  ownPalette(manager: ReturnType<typeof startCommandPalette>): void;
  ownClipboard(
    route: (action: "copy" | "paste" | "selectAll") => boolean,
  ): void;
}) {
  const { window, application } = options;
  const core = window.webContents;
  const js = <T = unknown>(expression: string) =>
    core.executeJavaScript(expression) as Promise<T>;
  const until = (expression: string) =>
    waitFor(() => js<boolean>(expression), expression);
  const key = (contents: WebContents, keyCode: string) => {
    contents.sendInputEvent({ type: "keyDown", keyCode });
    contents.sendInputEvent({ type: "keyUp", keyCode });
  };
  const settings = createSettingsExercise(
    options.root,
    options.router,
    () => window,
    options.apply,
  );
  const resources = await createExtensionFixtureResources(options.root);
  const states: string[] = [];
  const pids: Array<{ id: string; pid: number }> = [];
  const keybinds: string[] = [];
  const unexpected = () => assert.fail("Unexpected composition fixture action");
  const catalog = createCoreActionCatalog(
    "OMXTerm",
    {
      ...application,
      zoomInSelectedWindow: unexpected,
      zoomOutSelectedWindow: unexpected,
      resetSelectedWindowZoom: unexpected,
      copySelectedTerminal: () => application.clipboardSelectedWindow("copy"),
      pasteSelectedTerminal: () => application.clipboardSelectedWindow("paste"),
      selectAllSelectedTerminal: () =>
        application.clipboardSelectedWindow("select-all"),
      findInSelectedTerminal: unexpected,
      reloadUserConfiguration: unexpected,
      openLocalImage: unexpected,
      showAbout: options.showAbout,
      showSettings: settings.show,
      showCommandPalette: () => palette.show(),
    },
    { ...terminalDefaultKeybinds(process.platform), commandPalette: "F6" },
  );
  const menu = installApplicationMenu(
    coreActionMenuTemplate("OMXTerm", catalog),
  );
  const palette = startCommandPalette({
    ipcMain,
    isTrustedSender: options.router.isTrustedSender,
    selectedContents: () => (window.isFocused() ? core : undefined),
    catalog: () => catalog,
  });
  options.ownPalette(palette);
  // Reserve 128 DIP for chrome, then intersect the real slot and viewport.
  const approvedSlot = () => {
    const [width, height] = window.getContentSize();
    return { x: 0, y: 128, width: width!, height: Math.max(0, height! - 128) };
  };
  const host = startExtensionViewHost({
    owner: window,
    preloadPath: path.join(options.root, "extension-view.cjs"),
    resources: resources.resources,
    contentSlot: approvedSlot,
    ipcMain,
    onRendererProcess: (id, pid) => pids.push({ id, pid }),
    onState: (state) => states.push(state),
    onKeybind(event, input, owner) {
      assert.equal(owner, window);
      if (input.type !== "keyDown" && input.type !== "rawKeyDown") return;
      const action = coreActionForKeyboardInput(
        catalog,
        { ...input, altGr: hasNativeAltGr(input) },
        process.platform,
      );
      if (!action) return;
      event.preventDefault();
      keybinds.push(input.key);
      action.invoke();
    },
  });
  options.ownClipboard(host.clipboard);
  const evidence = process.env.OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR;
  const captures: string[] = [];
  const capture = async (name: string, contents: WebContents) => {
    if (!evidence) return;
    await mkdir(evidence, { recursive: true });
    await writeFile(
      path.join(evidence, name),
      (await contents.capturePage()).toPNG(),
    );
    captures.push(name);
  };
  const select = async (index: number) => {
    application.selectTabInSelectedWindow(index);
    await until(
      `document.querySelectorAll('#tab-strip [role=tab]')[${index - 1}]?.getAttribute('aria-selected') === 'true'`,
    );
  };
  const terminalRoundTrip = async (text: string, selectFirst = true) => {
    if (selectFirst) await select(1);
    await until("!!document.activeElement?.closest('.terminal-surface')");
    await core.insertText(text);
    key(core, "Enter");
    await waitFor(
      () => output.includes(`__EXT_ACK__${text}`),
      "same real PTY acknowledged input",
    );
  };
  try {
    window.focus();
    await waitFor(() => window.isFocused(), "focused composition owner");
    await js("window.__windowChromeHostReady()");
    await waitFor(
      () => output.includes(explicitFixtureReadyMarker),
      "original PTY ready",
    );
    await until("!!document.querySelector('.terminal-surface canvas')");
    const corePid = core.getOSProcessId();
    await js(
      "window.__extensionOriginalCanvas = document.querySelector('.terminal-surface canvas')",
    );
    assert.equal(await js("!!window.__extensionOriginalCanvas"), true);
    // A single terminal intentionally has no rendered tab-strip button.
    await terminalRoundTrip("before-views", false);
    settings.show();
    await until("!!document.querySelector('.settings-dialog input')");
    await js(`(() => {
      [...document.querySelectorAll('.settings-dialog button')].find(button => button.textContent === 'Config File').click();
      const field = document.querySelector('.settings-config-file textarea');
      field.value = 'synthetic retained raw draft'; field.dispatchEvent(new Event('input')); field.focus(); field.setSelectionRange(2, 7);
      window.__extensionSettingsField = field;
    })()`);
    const a = await host.open({
      entryResource: "index.html",
      title: "Captured A one",
    });
    const first = window.contentView.children.at(-1) as WebContentsView;
    const firstContents = first.webContents; // Retain before native view closure.
    const b = await host.open({
      entryResource: "index.html",
      title: "Captured A two",
    });
    const second = window.contentView.children.at(-1) as WebContentsView;
    const secondContents = second.webContents;
    await firstContents.executeJavaScript(
      "localStorage.setItem('captured-version', 'A')",
    );
    await resources.replaceCurrent();
    const retainedStorage = await Promise.all(
      [firstContents, secondContents].map(
        (child) =>
          child.executeJavaScript(
            "localStorage.getItem('captured-version')",
          ) as Promise<string | null>,
      ),
    );
    assert.deepEqual(retainedStorage, ["A", "A"]);
    assert.notEqual(a.id, b.id);
    assert.equal(firstContents.session, secondContents.session);
    assert.equal(
      new URL(firstContents.getURL()).host,
      new URL(secondContents.getURL()).host,
    );
    assert.equal(new URL(firstContents.getURL()).protocol, "omx-extension:");
    await until(
      "document.querySelectorAll('#tab-strip [role=tab]').length === 4",
    );
    const titles = await js<string[]>(
      "[...document.querySelectorAll('#tab-strip [role=tab]')].map(tab => tab.textContent)",
    );
    assert.ok(titles[2]!.includes(a.title) && titles[3]!.includes(b.title));
    assert.deepEqual(
      await js(
        "[...document.querySelectorAll('.hosted-content-tab')].map(e => e.querySelector('.hosted-content-slot').children.length)",
      ),
      [0, 0],
    );
    for (const child of [firstContents, secondContents]) {
      assert.notEqual(child.getOSProcessId(), corePid);
      assert.ok(child.getOSProcessId() > 0);
      assert.equal(
        await child.executeJavaScript(
          "document.querySelector('h1').textContent",
        ),
        "Captured A",
      );
    }
    const focus = async (
      index: number,
      view: WebContentsView,
      contents: WebContents,
    ) => {
      await select(index);
      await waitFor(
        () => view.getVisible() && contents.isFocused(),
        "selected native child focused",
      );
      await contents.executeJavaScript(
        "document.querySelector('#draft').focus()",
      );
    };
    await focus(3, first, firstContents);
    key(firstContents, "End");
    firstContents.sendInputEvent({ type: "char", keyCode: "x" });
    await waitFor(
      async () =>
        (
          await (firstContents.executeJavaScript(
            "document.querySelector('#draft').value",
          ) as Promise<string>)
        ).endsWith("x"),
      "native field typing",
    );
    const clickEditing = (label: string) => {
      const item = menu.items
        .flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.label === label);
      assert.ok(item, `native editing menu ${label}`);
      const click = item.click as (
        item: Electron.MenuItem,
        owner: BrowserWindow,
        event: object,
      ) => void;
      click(item, window, {});
    };
    clipboard.writeText("synthetic native paste");
    clickEditing(catalog.selectAll.label);
    clickEditing(catalog.paste.label);
    await waitFor(
      async () =>
        (await firstContents.executeJavaScript(
          "document.querySelector('#draft').value",
        )) === "synthetic native paste",
      "native menu paste routes to child",
    );
    clickEditing(catalog.selectAll.label);
    clipboard.writeText("copy must replace this sentinel");
    clickEditing(catalog.copy.label);
    await waitFor(
      () => clipboard.readText() === "synthetic native paste",
      "native menu copy routes to child",
    );
    await focus(4, second, secondContents);
    assert.equal(first.getVisible(), false);
    await focus(3, first, firstContents);
    assert.equal(second.getVisible(), false);
    assert.equal(
      await firstContents.executeJavaScript(
        "document.querySelector('#draft').value",
      ),
      "synthetic native paste",
    );
    await terminalRoundTrip("with-live-views");
    assert.equal(first.getVisible(), false);
    assert.equal(second.getVisible(), false);
    await focus(3, first, firstContents);
    const bounds = first.getBounds();
    const approved = approvedSlot();
    assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.y >= approved.y);
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= approved.width);
    assert.ok(bounds.y + bounds.height <= approved.y + approved.height);
    const slot = await js<Electron.Rectangle>(
      "(() => { const r = document.querySelector('.hosted-content-tab:not([hidden]) .hosted-content-slot').getBoundingClientRect(); return {x:r.x, y:r.y, width:r.width, height:r.height}; })()",
    );
    assert.ok(bounds.x >= Math.floor(slot.x) && bounds.y >= Math.floor(slot.y));
    assert.ok(bounds.x + bounds.width <= Math.ceil(slot.x + slot.width));
    assert.ok(bounds.y + bounds.height <= Math.ceil(slot.y + slot.height));
    await capture("selected-child.png", firstContents);
    await capture("host-tabs.png", core);
    const policy = await exerciseExtensionPolicy(firstContents);

    // Focused child -> actual matcher -> catalog -> palette -> About action.
    // Renderer instrumentation observes the completed real hide IPC before DOM.
    key(firstContents, "F6");
    await until("!!document.querySelector('.command-palette input')");
    assert.equal(first.getVisible(), false);
    assert.equal(second.getVisible(), false);
    await until(
      "document.querySelector('.command-palette').contains(document.activeElement)",
    );
    key(core, "Escape");
    await until("!document.querySelector('.command-palette')");
    await waitFor(
      () => first.getVisible() && firstContents.isFocused(),
      "palette cancellation restores only selected child",
    );
    assert.equal(second.getVisible(), false);
    key(firstContents, "F6");
    await until("!!document.querySelector('.command-palette input')");
    await js(
      `(() => { const input = document.querySelector('.command-palette input'); input.value = ${JSON.stringify(catalog.about.label)}; input.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
    key(core, "Enter");
    await until("!!document.querySelector('.about-dialog[open]')");
    assert.equal(first.getVisible(), false);
    assert.equal(second.getVisible(), false);
    await until(
      "document.querySelector('.about-dialog').contains(document.activeElement)",
    );
    await capture("about-host-only.png", core);
    key(core, "Escape");
    await until("!document.querySelector('.about-dialog[open]')");
    await waitFor(
      () => first.getVisible() && firstContents.isFocused(),
      "only selected child restored after About",
    );
    assert.equal(second.getVisible(), false);
    assert.deepEqual(keybinds, ["F6", "F6"]);
    assert.equal(
      await firstContents.executeJavaScript("receipts.keys.includes('F6')"),
      false,
    );
    await select(2);
    await until(
      "document.querySelector('.settings-dialog').closest('[hidden]') === null",
    );
    assert.equal(first.getVisible(), false);
    assert.equal(second.getVisible(), false);
    assert.deepEqual(
      await js(
        "[window.__extensionSettingsField === document.querySelector('.settings-config-file textarea'), window.__extensionSettingsField.value, window.__extensionSettingsField.selectionStart, window.__extensionSettingsField.selectionEnd]",
      ),
      [true, "synthetic retained raw draft", 2, 7],
    );
    const overlays = await js<
      Array<{
        modal: string;
        hiddenAcknowledged: boolean;
        hideRevision: number;
      }>
    >("window.__extensionOverlayReceipts");
    assert.ok(overlays.length >= 2);
    assert.ok(
      overlays.every(
        (receipt) => receipt.hiddenAcknowledged && receipt.hideRevision > 0,
      ),
    );
    await focus(3, first, firstContents);
    let crash: Electron.RenderProcessGoneDetails | undefined;
    firstContents.once("render-process-gone", (_event, details) => {
      crash = details;
    });
    firstContents.forcefullyCrashRenderer();
    await waitFor(
      () => states.includes("retiring"),
      "crash retires captured epoch",
    );
    const retirement = await host.retire();
    assert.deepEqual(retirement, { status: "settled" });
    assert.ok(crash, "actual child renderer failure receipt");
    assert.ok(firstContents.isDestroyed() && secondContents.isDestroyed());
    assert.ok(
      !window.contentView.children.includes(first) &&
        !window.contentView.children.includes(second),
    );
    await until(
      "document.querySelectorAll('.hosted-content-tab').length === 0",
    );
    await terminalRoundTrip("after-crash");
    assert.equal(core.getOSProcessId(), corePid);
    assert.equal(
      await js(
        "window.__extensionOriginalCanvas === document.querySelector('.terminal-surface canvas')",
      ),
      true,
    );
    await assert.rejects(
      host.open({
        entryResource: "index.html",
        title: "Retired epoch cannot reopen",
      }),
    );
    await select(2);
    assert.deepEqual(
      await js(
        "[window.__extensionSettingsField === document.querySelector('.settings-config-file textarea'), window.__extensionSettingsField.value]",
      ),
      [true, "synthetic retained raw draft"],
    );
    await select(1);
    const resourceReceipts = await resources.assertRetired();
    // Resource settlement alone is not presentation usability: #746 left a
    // failure latch while the original Surface and PTY continued to work.
    const replacement = await resources.openReplacement();
    const recoveryHost = startExtensionViewHost({
      owner: window,
      preloadPath: path.join(options.root, "extension-view.cjs"),
      resources: replacement.resources,
      contentSlot: approvedSlot,
      ipcMain,
    });
    try {
      await recoveryHost.open({
        entryResource: "index.html",
        title: "Replacement B",
      });
      const fresh = window.contentView.children.at(-1) as WebContentsView;
      const contents = fresh.webContents;
      await waitFor(
        () => fresh.getVisible() && contents.isFocused(),
        "replacement epoch presented after crash",
      );
      assert.equal(
        await contents.executeJavaScript(
          "document.querySelector('h1').textContent",
        ),
        "Latest B",
      );
      assert.equal(
        await js(
          "[...document.querySelectorAll('[role=status]')].some(element => !element.hidden && element.textContent.includes('Hosted content could not'))",
        ),
        false,
      );
      palette.show();
      await until("!!document.querySelector('.command-palette input')");
      assert.equal(fresh.getVisible(), false);
      assert.equal(
        await js(
          "window.__extensionOverlayReceipts.at(-1)?.hiddenAcknowledged",
        ),
        true,
      );
      key(core, "Escape");
      await until("!document.querySelector('.command-palette')");
      await waitFor(
        () => fresh.getVisible() && contents.isFocused(),
        "replacement restored after overlay",
      );
      assert.deepEqual(await recoveryHost.retire(), { status: "settled" });
      assert.equal(contents.isDestroyed(), true);
      await until(
        "document.querySelectorAll('.hosted-content-tab').length === 0",
      );
      await terminalRoundTrip("after-replacement");
    } finally {
      await recoveryHost.retire();
    }
    assert.equal(replacement.releases(), 1);
    const postCrashRecovery = {
      replacementPresented: true,
      overlayHiddenAndRestored: true,
      replacementReleased: replacement.releases(),
      originalPtyContinued: true,
    };
    const result = {
      extensionViews: "production-composition-verified",
      corePid,
      pids,
      bounds,
      approved,
      slot,
      titles,
      policy,
      overlays,
      states,
      retirement,
      postCrashRecovery,
      crash,
      destroyedViews: [
        firstContents.isDestroyed(),
        secondContents.isDestroyed(),
      ],
      resourceReceipts,
      retainedStorage,
      captures,
      input: "synthetic-chromium-and-native-editing-APIs-not-physical",
      limits: [
        "main-death-surviving-browser-unqualified",
        "no-per-view-PID-uniqueness-promise",
        "screenshots-not-OS-compositor-proof",
        "service-worker-failure-cause-unqualified",
        "download-policy-not-exercised",
        "held-read-draining-headless-only",
      ],
    };
    if (evidence)
      await writeFile(
        path.join(evidence, "composition.json"),
        JSON.stringify(result, null, 2),
      );
    return result;
  } catch (error) {
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await writeFile(
        path.join(evidence, "composition-failure.json"),
        JSON.stringify(
          {
            states,
            pids,
            captures,
            error: String(error),
            presentation: await js("window.__extensionPresentationReceipts"),
            layout: await js(
              "[...document.querySelectorAll('.hosted-content-tab')].map(e => ({ hidden:e.hidden, bounds:e.querySelector('.hosted-content-slot').getBoundingClientRect().toJSON() }))",
            ),
            views: window.contentView.children.map((view) => ({
              bounds: view.getBounds(),
              visible: view.getVisible(),
            })),
          },
          null,
          2,
        ),
      ).catch(() => {});
    }
    throw error;
  } finally {
    await host.retire();
    options.ownClipboard(() => false);
    settings.dispose();
    palette.dispose();
  }
}
