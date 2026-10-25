import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Menu, type BrowserWindow, type KeyboardInputEvent } from "electron";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
} from "../../src/main/application-menu";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { installApplicationMenu } from "../../src/main/native-application-menu";
import { createSettingsService } from "../../src/main/settings-service";
import { startSettings } from "../../src/main/settings-wiring";
import { ipcMain } from "electron";
import type { LaunchRequest } from "../../src/main/launch-request";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
} from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  type ActiveUserConfiguration,
} from "../../src/main/user-configuration-reloader";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { explicitFixtureReadyMarker } from "./restty-host-platform";

export const SHORTCUT_CAPTURE_FLAG = "--fixture-shortcut-capture";
const PTY_PREFIX = "__SHORTCUT_PTY__";
const ESCAPE = "\u001b[27;1:1u\u001b[27;1:3u";

// A real raw native PTY child reports every received byte, not an Adapter tap
// that withholds input. Only fixture-generated input is used in this scenario.
export function shortcutCaptureLaunchRequest(): Extract<
  LaunchRequest,
  { kind: "explicit-command" }
> {
  return {
    kind: "explicit-command",
    executable: "/usr/bin/python3",
    arguments: [
      "-u",
      "-c",
      [
        "import os, tty",
        "tty.setraw(0)",
        `os.write(1, ${JSON.stringify(explicitFixtureReadyMarker + "\n\u001b[?1004l\u001b[>3u\u001b[?u")}.encode())`,
        "while True:",
        "    data = os.read(0, 4096)",
        "    if not data: break",
        `    os.write(1, (${JSON.stringify(PTY_PREFIX)} + data.hex() + '\\n').encode())`,
      ].join("\n"),
    ],
  };
}

export function createShortcutPtyObservation() {
  let tail = "";
  let input = "";
  return {
    observe(data: string) {
      tail += data;
      assert.ok(
        tail.length <= 65_536,
        "Native shortcut output exceeded its fixture budget",
      );
      let end: number;
      while ((end = tail.indexOf("\n")) !== -1) {
        const line = tail.slice(0, end).replace(/\r$/u, "");
        tail = tail.slice(end + 1);
        const start = line.indexOf(PTY_PREFIX);
        if (start === -1) continue;
        const hex = line.slice(start + PTY_PREFIX.length);
        assert.match(hex, /^(?:[a-f0-9]{2})+$/u);
        input += Buffer.from(hex, "hex").toString("latin1");
        assert.ok(
          input.length <= 16_384,
          "Native shortcut input exceeded its fixture budget",
        );
      }
    },
    input: () => input,
  };
}

async function waitFor(
  check: () => boolean | Promise<boolean>,
  label: string,
  limit = 5_000,
) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Native shortcut phase timed out: ${label}`);
}

interface ShortcutCaptureOptions {
  readonly root: string;
  readonly window: BrowserWindow;
  readonly router: TerminalIpcRouter;
  readonly application: TerminalApplication<BrowserWindow>;
  readonly apply: (state: ActiveUserConfiguration, committed: boolean) => void;
  readonly input: () => string;
  readonly quitConfirmations: () => number;
  readonly control: "none" | "repeat" | "release";
}

async function createCaptureRouting(options: ShortcutCaptureOptions) {
  const { window, application } = options;
  const contents = window.webContents;
  const directory = path.join(options.root, "shortcut-xdg", "omxterm");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "config.json");
  const original = '{ "version": 1 }\n';
  await writeFile(file, original);
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: path.dirname(directory) },
    homeDirectory: options.root,
    platform: process.platform,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  let install = () => {};
  const reloader = createUserConfigurationReloader({
    initial: {
      configuration: {
        ...DEFAULT_USER_CONFIGURATION,
        keybinds: terminalDefaultKeybinds(process.platform),
      },
      userFileErrors: [],
    },
    load: () => loadUserConfiguration(loadOptions),
    apply(state, committed) {
      options.apply(state, committed);
      install();
    },
  });
  let actionCount = 0;
  let menuCount = 0;
  let starts = 0;
  const unexpected = () => assert.fail("Unexpected native shortcut action");
  const actions = {
    newWindow: unexpected,
    closeSelectedWindow: unexpected,
    newTabInSelectedWindow: unexpected,
    closeSelectedTab: unexpected,
    selectNextTab: unexpected,
    selectPreviousTab: unexpected,
    selectTabInSelectedWindow: unexpected,
    requestQuit() {
      actionCount += 1;
      void application.requestQuit();
    },
    toggleSelectedFullScreen() {
      actionCount += 1;
      application.toggleSelectedFullScreen();
    },
    toggleSelectedAlwaysOnTop: unexpected,
    toggleSelectedDevTools: unexpected,
    zoomInSelectedWindow: unexpected,
    zoomOutSelectedWindow: unexpected,
    resetSelectedWindowZoom: unexpected,
    copySelectedTerminal: unexpected,
    pasteSelectedTerminal: unexpected,
    selectAllSelectedTerminal: unexpected,
    findInSelectedTerminal: unexpected,
    toggleSelectedSnippets: unexpected,
    toggleSelectedTabBar: unexpected,
    toggleSelectedTitleBar: unexpected,
    reloadUserConfiguration: unexpected,
    openLocalImage: unexpected,
    showAbout: unexpected,
    showSettings: unexpected,
    splitSelectedPane: unexpected,
    closeSelectedPane: unexpected,
    focusSelectedPane: unexpected,
    equalizeSelectedPanes: unexpected,
  };
  const invocations = terminalActionInvocations(actions);
  install = () => {
    installApplicationMenu(
      terminalApplicationMenuTemplate(
        "OMXTerm",
        {
          ...actions,
          requestQuit() {
            menuCount += 1;
            actions.requestQuit();
          },
          toggleSelectedFullScreen() {
            menuCount += 1;
            actions.toggleSelectedFullScreen();
          },
        },
        reloader.current().configuration.keybinds,
      ),
    );
  };
  install();
  const capture = createKeybindCapture(process.platform);
  deliverKeybindsFromKeyEvents(
    contents,
    () => reloader.current().configuration.keybinds,
    (action) => invocations[action](),
    process.platform,
    {
      release: capture.release,
      intercept(target, event) {
        // Deliberate negative controls weaken only fixture composition. The same
        // production capture/delivery/menu/renderer/PTY paths otherwise execute.
        if (options.control === "repeat" && event.isAutoRepeat) return false;
        if (options.control === "release" && event.type === "keyUp")
          return false;
        return capture.intercept(target, event);
      },
    },
  );
  const releaseCapture = () => capture.release(contents);
  window.on("blur", releaseCapture);
  const settings = startSettings({
    ipcMain,
    isTrustedSender: options.router.isTrustedSender,
    service: createSettingsService({
      loadOptions,
      reload: () => reloader.reload(),
    }),
    selectedContents: () => contents,
    capture: {
      set(target, request) {
        capture.set(target, request);
        if (request.active) starts += 1;
      },
    },
  });
  return {
    file,
    original,
    show: settings.show,
    starts: () => starts,
    actions: () => actionCount,
    menus: () => menuCount,
    dispose() {
      settings.dispose();
      window.removeListener("blur", releaseCapture);
      releaseCapture();
    },
  };
}

export async function exerciseShortcutCapture(options: ShortcutCaptureOptions) {
  const routing = await createCaptureRouting(options);
  const { window, input } = options;
  const contents = window.webContents;
  const evaluate = <T>(script: string) =>
    contents.executeJavaScript(script, true) as Promise<T>;
  const button = `document.querySelector('[data-action="find"] .settings-shortcut-record')`;
  const status = "document.querySelector('.settings-status').textContent";
  const send = (
    type: KeyboardInputEvent["type"],
    keyCode: string,
    modifiers: KeyboardInputEvent["modifiers"] = [],
  ) => contents.sendInputEvent({ type, keyCode, modifiers });
  const open = async () => {
    window.focus();
    routing.show();
    await waitFor(
      () =>
        evaluate<boolean>(
          "!!document.querySelector('#settings-tab-shortcuts')",
        ),
      "Settings loaded",
    );
    await evaluate("document.querySelector('#settings-tab-shortcuts').click()");
  };
  const record = async () => {
    const previous = routing.starts();
    await evaluate(`${button}.click()`);
    await waitFor(
      () => routing.starts() === previous + 1,
      "native capture started",
    );
  };
  const close = async () => {
    await evaluate("document.querySelector('.settings-close').click()");
    await waitFor(
      () =>
        evaluate<boolean>(
          "!document.querySelector('.settings-dialog') && document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
        ),
      "terminal focus returned",
    );
  };
  const sample = () => ({
    bytes: input().length,
    actions: routing.actions(),
    menu: routing.menus(),
    quit: options.quitConfirmations(),
    fullScreen: window.isFullScreen(),
  });
  const phases: string[] = [];
  const finishSample = async (
    before: ReturnType<typeof sample>,
    phase: string,
  ) => {
    send("keyDown", "Escape");
    send("keyUp", "Escape");
    await waitFor(
      () => input().length >= before.bytes + ESCAPE.length,
      `${phase} native PTY control`,
    );
    assert.equal(
      input().slice(before.bytes),
      ESCAPE,
      `${phase}: captured gesture leaked to the actual PTY`,
    );
    assert.equal(
      routing.actions(),
      before.actions,
      `${phase}: application action invoked during capture`,
    );
    assert.equal(
      routing.menus(),
      before.menu,
      `${phase}: native menu callback invoked during capture`,
    );
    assert.equal(
      options.quitConfirmations(),
      before.quit,
      `${phase}: actual Quit lifecycle entered`,
    );
    assert.equal(
      window.isFullScreen(),
      before.fullScreen,
      `${phase}: actual fullscreen changed`,
    );
    phases.push(phase);
  };
  try {
    await waitFor(
      () => input() === "\u001b[?3u",
      "raw child Kitty event-reporting handshake",
    );
    for (const [phase, key, modifiers] of [
      ["held-fullscreen", "F11", []],
      ["held-quit", "Q", ["control", "alt", "shift"]],
    ] as const) {
      const before = sample();
      await open();
      await record();
      send("keyDown", key, [...modifiers]);
      await waitFor(
        () =>
          evaluate<boolean>(
            `${button}.textContent === 'Record' && document.querySelector('.settings-status').classList.contains('error')`,
          ),
        `${phase} collision result`,
      );
      assert.match(
        await evaluate<string>(status),
        /keybinds\.find: conflicts with/u,
      );
      await close();
      send("keyDown", key, [...modifiers, "isautorepeat"]);
      send("keyDown", key, [...modifiers, "isautorepeat"]);
      send("keyUp", key, [...modifiers]);
      await finishSample(before, phase);
    }
    {
      const before = sample();
      await open();
      await record();
      send("keyDown", "Control", ["control"]);
      send("keyDown", "A");
      send("keyDown", "B");
      await waitFor(
        () => evaluate<boolean>(`${status}.includes('not supported')`),
        "invalid overlap reported",
      );
      await evaluate(`${button}.click()`);
      await close();
      for (const key of ["A", "B", "Control"]) {
        send("keyDown", key, ["isautorepeat"]);
        send("keyUp", key);
      }
      await finishSample(before, "overlapping-invalid-modifier");
    }
    {
      const before = sample();
      await open();
      await record();
      send("keyDown", "Escape");
      await waitFor(
        () => evaluate<boolean>(`${status} === 'Recording cancelled.'`),
        "lost release cancellation",
      );
      await close();
      // Deliberately omit the old Escape release. finishSample is a fresh press.
      await finishSample(before, "missing-release-fresh-press");
    }
    {
      const before = sample();
      await open();
      await record();
      assert.equal(
        await evaluate<boolean>(`document.activeElement === ${button}`),
        false,
        "Record unexpectedly focused before page-departure control",
      );
      await evaluate("document.querySelector('#settings-tab-general').click()");
      assert.equal(await evaluate<string>(status), "Recording cancelled.");
      await close();
      await finishSample(before, "page-departure-without-blur");
    }
    {
      const before = sample();
      await open();
      await record();
      window.blur();
      await waitFor(() => !window.isFocused(), "native window blur");
      await waitFor(
        () => evaluate<boolean>(`${status} === 'Recording cancelled.'`),
        "window blur cancellation",
      );
      window.focus();
      await close();
      await finishSample(before, "window-blur");
    }
    {
      const before = sample();
      await open();
      await record();
      const start = Date.now();
      await waitFor(
        () =>
          evaluate<boolean>(
            `${status} === 'Recording cancelled.' && ${button}.textContent === 'Record'`,
          ),
        "real no-input timeout",
        35_000,
      );
      assert.ok(
        Date.now() - start >= 29_900,
        "Capture ended before its timeout",
      );
      await close();
      await finishSample(before, "real-timeout");
    }
    // Positive controls prove the actual effect/callback observations are live.
    const priorActions = routing.actions();
    send("keyDown", "F11");
    send("keyUp", "F11");
    await waitFor(
      () => window.isFullScreen(),
      "normal F11 enters actual fullscreen",
    );
    send("keyDown", "F11");
    send("keyUp", "F11");
    await waitFor(
      () => !window.isFullScreen(),
      "normal F11 restores actual fullscreen",
    );
    assert.equal(routing.actions(), priorActions + 2);
    assert.equal(
      routing.menus(),
      0,
      "Main delivery also dispatched a native menu accelerator",
    );
    const quit = Menu.getApplicationMenu()!.items[0]!.submenu!.items.find(
      (item) =>
        item.accelerator === terminalDefaultKeybinds(process.platform).quit,
    )!;
    assert.ok(quit, "Real native Quit item missing");
    const previousQuit = options.quitConfirmations();
    const clickQuit = quit.click as () => void;
    clickQuit();
    await waitFor(
      () => options.quitConfirmations() === previousQuit + 1,
      "real native Quit callback enters guarded lifecycle",
    );
    assert.equal(routing.menus(), 1);
    assert.equal(routing.actions(), priorActions + 3);
    assert.equal(
      await readFile(routing.file, "utf8"),
      routing.original,
      "Capture probes changed configuration",
    );
    phases.push("normal-action-menu-controls");
    return {
      phases,
      actualRawPty: true,
      syntheticInput: true,
      physicalLayout: false,
      unchangedConfiguration: true,
    };
  } finally {
    routing.dispose();
  }
}
