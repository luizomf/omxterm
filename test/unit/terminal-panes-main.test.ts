import { describe, expect, it, vi } from "vitest";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
} from "../../src/main/application-menu";
import {
  startTerminalApplication,
  type NativeTerminalWindow,
} from "../../src/main/terminal-application";
import { createTabSelection } from "../../src/main/terminal-tab-selection";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import { createWorkingDirectoryTracker } from "../../src/main/terminal-working-directories";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";

function nativeWindow(): NativeTerminalWindow {
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
  };
}

async function application(busy: { focused: boolean; tab: boolean }) {
  const window = nativeWindow();
  const sendTabCommand =
    vi.fn<
      (window: NativeTerminalWindow, command: TerminalTabCommand) => void
    >();
  const showCloseTabConfirmation = vi.fn(async () => true);
  const showClosePaneConfirmation = vi.fn(async () => true);
  const app = startTerminalApplication({
    createWindow: () => ({
      window,
      sessionActivity: {
        hasBusySelectedSession: () => busy.tab,
        hasBusyFocusedSession: () => busy.focused,
        hasBusySession: () => busy.tab,
      },
      load: async () => {},
    }),
    getSelectedWindow: () => window,
    showQuitConfirmation: vi.fn(async () => true),
    showCloseWindowConfirmation: vi.fn(async () => true),
    showCloseTabConfirmation,
    showClosePaneConfirmation,
    showSessionFailure: vi.fn(async () => {}),
    sendFontZoom: vi.fn(),
    sendClipboardAction: vi.fn(),
    sendSnippetsToggle: vi.fn(),
    sendTabBarToggle: vi.fn(),
    sendAuxiliaryPanelToggle: vi.fn(),
    sendFind: vi.fn(),
    sendTitleBarToggle: vi.fn(),
    sendLocalImageOpen: vi.fn(),
    toggleDeveloperTools: vi.fn(),
    sendTabCommand,
    quit: vi.fn(),
  });
  await app.newWindow();
  sendTabCommand.mockClear();
  return {
    app,
    window,
    sendTabCommand,
    showCloseTabConfirmation,
    showClosePaneConfirmation,
  };
}

describe("pane actions in main", () => {
  it("closes an idle focused pane at once, even in a busy tab", async () => {
    const view = await application({ focused: false, tab: true });
    await view.app.closeSelectedPane();
    expect(view.showClosePaneConfirmation).not.toHaveBeenCalled();
    expect(view.sendTabCommand).toHaveBeenCalledExactlyOnceWith(view.window, {
      action: "close-pane",
    });
  });

  it("confirms a busy focused pane with the captured pane", async () => {
    const view = await application({ focused: true, tab: true });
    view.showClosePaneConfirmation.mockResolvedValueOnce(false);
    await view.app.closeSelectedPane();
    await view.app.closeSelectedPane();
    expect(view.showClosePaneConfirmation).toHaveBeenCalledTimes(2);
    expect(view.showCloseTabConfirmation).not.toHaveBeenCalled();
    expect(
      view.sendTabCommand.mock.calls.map(([, command]) => command),
    ).toEqual([
      { action: "prepare-close-pane" },
      { action: "resolve-close-pane", confirmed: false },
      { action: "prepare-close-pane" },
      { action: "resolve-close-pane", confirmed: true },
    ]);
  });

  it("asks once for Close Tab when any of its panes is busy", async () => {
    const view = await application({ focused: false, tab: true });
    await view.app.closeSelectedTab();
    expect(view.showCloseTabConfirmation).toHaveBeenCalledOnce();
    expect(view.showClosePaneConfirmation).not.toHaveBeenCalled();
  });

  it("sends split, focus and equalize commands to the selected window", async () => {
    const view = await application({ focused: false, tab: false });
    view.app.splitSelectedPane("down");
    view.app.focusSelectedPane("left");
    view.app.equalizeSelectedPanes();
    expect(
      view.sendTabCommand.mock.calls.map(([, command]) => command),
    ).toEqual([
      { action: "split", direction: "down" },
      { action: "focus-pane", target: "left" },
      { action: "equalize-panes" },
    ]);
  });
});

describe("tab selection busy counts", () => {
  function selection(busy: readonly string[]) {
    const sessions = new Map(
      ["s1", "s2", "s3"].map((id) => [id, { id }] as const),
    );
    const onSessionSelected = vi.fn();
    const reject = vi.fn();
    return {
      reject,
      onSessionSelected,
      sessions,
      ...createTabSelection({
        routed: (id) => sessions.get(id),
        current: (id) => sessions.get(id),
        isBusy: (state) => busy.includes(state.id),
        hasBusySession: () => busy.length > 0,
        reject,
        onSessionSelected,
      }),
    };
  }

  it("counts every pane of the selected tab and the focused pane alone", () => {
    const view = selection(["s1"]);
    view.tabSelected({ sessionId: "s2", tabSessionIds: ["s1", "s2"] });
    expect(view.onSessionSelected).toHaveBeenCalledWith("s2");
    expect(view.hasBusySelectedSession()).toBe(true);
    expect(view.hasBusyFocusedSession()).toBe(false);
    view.tabSelected({ sessionId: "s3" });
    expect(view.hasBusySelectedSession()).toBe(false);
  });

  it("ignores ended panes and rejects malformed selections", () => {
    const view = selection(["s2"]);
    view.tabSelected({ sessionId: "s1", tabSessionIds: ["s1", "s2"] });
    view.sessions.delete("s2");
    expect(view.hasBusySelectedSession()).toBe(false);
    view.tabSelected({ sessionId: "s1", tabSessionIds: ["s2"] });
    expect(view.reject).toHaveBeenCalledOnce();
  });
});

describe("working directory tracker", () => {
  const tracker = (directories: readonly string[] = ["/srv/project"]) =>
    createWorkingDirectoryTracker({
      platform: "linux",
      hostName: () => "workstation",
      isDirectory: (path) => directories.includes(path),
    });

  it("inherits only a validated, still existing local OSC 7 report", () => {
    const view = tracker();
    view.observe("s1", "out\u001b]7;file://workstation/srv/project\u0007$ ");
    expect(view.inherited("s1")).toBe("/srv/project");
    expect(view.inherited("s2")).toBeUndefined();
    expect(view.inherited(undefined)).toBeUndefined();
    view.observe("s2", "\u001b]7;file:///srv/removed\u001b\\");
    expect(view.inherited("s2")).toBeUndefined();
  });

  it("joins reports split across output chunks, with either terminator", () => {
    const view = tracker(["/srv/project", "/srv/other"]);
    for (const chunk of ["x\u001b", "]7", ";file:///srv/pro", "ject", "\u0007"])
      view.observe("s1", chunk);
    expect(view.inherited("s1")).toBe("/srv/project");
    view.observe("s1", "\u001b]7;file:///srv/other\u001b");
    view.observe("s1", "\\done");
    expect(view.inherited("s1")).toBe("/srv/other");
  });

  it("invalidates the previous cwd when an oversized report's terminator arrives later", () => {
    const view = tracker();
    view.observe("s1", "\u001b]7;file:///srv/project\u0007");
    view.observe("s1", `\u001b]7;file://remote/${"a".repeat(5_000)}`);
    view.observe("s1", "\u0007");
    expect(view.inherited("s1")).toBeUndefined();
    view.observe("s1", "\u001b]7;file:///srv/project\u001b\\");
    expect(view.inherited("s1")).toBe("/srv/project");
  });

  it("accepts an exact-bound report with ST split across chunks and consumes oversized bodies as one report", () => {
    const directory = "/" + "a".repeat(4_088);
    const view = tracker([directory, "/srv/project"]);
    const uri = `file://${directory}`;
    expect(uri.length).toBe(4_096);
    view.observe("s1", `\u001b]7;${uri}\u001b`);
    view.observe("s1", "\\");
    expect(view.inherited("s1")).toBe(directory);
    view.observe("s1", `\u001b]7;${uri}x`);
    // A nested-looking report is still inside the rejected control, not new cwd.
    view.observe("s1", "\u001b]7;file:///srv/project\u0007");
    expect(view.inherited("s1")).toBeUndefined();
    view.observe("s1", "\u001b]7;file:///srv/project\u0007");
    expect(view.inherited("s1")).toBe("/srv/project");
  });

  it("drops remote, malformed and unbounded reports and forgets ended sessions", () => {
    const view = tracker();
    view.observe("s1", "\u001b]7;file:///srv/project\u0007");
    view.observe("s1", "\u001b]7;file://remote/srv/project\u0007");
    expect(view.inherited("s1")).toBeUndefined();
    view.observe("s1", "\u001b]7;file:///srv/project\u0007");
    view.observe("s1", "\u001b]7;not-a-file-uri\u0007");
    expect(view.inherited("s1")).toBeUndefined();
    view.observe("s2", `\u001b]7;file:///${"a".repeat(5_000)}`);
    view.observe("s2", "/srv/project\u0007");
    expect(view.inherited("s2")).toBeUndefined();
    view.observe("s3", "\u001b]7;file:///srv/project\u0007");
    view.forget("s3");
    expect(view.inherited("s3")).toBeUndefined();
  });
});

describe("View -> Pane", () => {
  const actions = new Proxy(
    {},
    {
      get: (cache: Record<string, unknown>, key: string) =>
        (cache[key] ??= vi.fn()),
    },
  ) as unknown as Parameters<typeof terminalApplicationMenuTemplate>[1];

  it.each(["darwin", "linux"])(
    "lists pane actions with remappable shortcuts on %s",
    (platform) => {
      const keybinds = terminalDefaultKeybinds(platform);
      const view = terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        keybinds,
      ).find((menu) => menu.label === "View")!;
      const pane = (view.submenu as Electron.MenuItemConstructorOptions[]).find(
        (item) => item.label === "Pane",
      )!;
      const items = (
        pane.submenu as Electron.MenuItemConstructorOptions[]
      ).filter((item) => item.label);
      expect(items.map((item) => item.label)).toEqual([
        "Split Right",
        "Split Down",
        "Focus Next Pane",
        "Focus Previous Pane",
        "Focus Pane Left",
        "Focus Pane Right",
        "Focus Pane Above",
        "Focus Pane Below",
        "Equalize Panes",
        "Close Pane",
      ]);
      expect(items[0]!.accelerator).toBe(keybinds.splitRight);
      items[1]!.click!({} as never, undefined, {} as never);
      expect(actions.splitSelectedPane).toHaveBeenCalledWith("down");
    },
  );

  it("keeps every pane shortcut distinct from the other defaults", () => {
    for (const keybinds of [
      DEFAULT_TERMINAL_KEYBINDS,
      terminalDefaultKeybinds("linux"),
    ]) {
      const values = Object.values(keybinds)
        .filter((value) => value !== null)
        .map((value) => value.toLowerCase());
      expect(new Set(values).size).toBe(values.length);
    }
    const invocations = terminalActionInvocations(actions);
    invocations.focusPaneUp();
    expect(actions.focusSelectedPane).toHaveBeenCalledWith("up");
    invocations.equalizePanes();
    expect(actions.equalizeSelectedPanes).toHaveBeenCalled();
  });
});
