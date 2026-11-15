// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { BrowserWindow, Event, Input } from "electron";
import {
  createCoreActionCatalog,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import {
  deliverExtensionKeybind,
  registerWindowActionDelivery,
} from "../../src/main/window-action-delivery";
import { trackTextEntryFocus } from "../../src/main/text-entry-focus";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import {
  isTextEntry,
  reportTextEntryFocus,
} from "../../src/renderer/text-entry-focus";

// The prompt jumps (#1027) take Cmd/Ctrl+Shift+Up/Down from the terminal, but
// a focused text field keeps them for selecting to the start or end.
function catalogFor(platform: string, invoke: (call: string) => void) {
  const actions = new Proxy({} as TerminalApplicationMenuActions, {
    get:
      (_target, name) =>
      (...args: unknown[]) =>
        invoke([String(name), ...args].join(" ")),
  });
  return createCoreActionCatalog(
    "OMXTerm",
    actions,
    terminalDefaultKeybinds(platform),
  );
}

function delivery(platform: string, editing: () => boolean) {
  const invoke = vi.fn();
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    isDestroyed: () => false,
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isFocused: () => true,
    getNativeWindowHandle: () => Buffer.alloc(8),
  }) as unknown as BrowserWindow;
  const catalog = catalogFor(platform, invoke);
  registerWindowActionDelivery(
    window,
    () => catalog,
    createKeybindCapture(platform),
    () => undefined,
    { platform },
    editing,
  );
  const press = (key: string, modifiers: Record<string, boolean>) => {
    let prevented = false;
    const event = {
      get defaultPrevented() {
        return prevented;
      },
      preventDefault: vi.fn(() => {
        prevented = true;
      }),
    };
    contents.emit("before-input-event", event, {
      type: "keyDown",
      key,
      code: "",
      control: false,
      meta: false,
      alt: false,
      shift: false,
      ...modifiers,
    });
    return event;
  };
  return { invoke, press };
}

it.each([
  ["darwin", { meta: true, shift: true }],
  ["linux", { control: true, shift: true }],
  ["win32", { control: true, shift: true }],
])(
  "leaves the prompt-jump chords to a focused text field on %s",
  (platform, modifiers) => {
    let editing = false;
    const { invoke, press } = delivery(platform, () => editing);
    expect(press("ArrowUp", modifiers).preventDefault).toHaveBeenCalled();
    expect(press("ArrowDown", modifiers).preventDefault).toHaveBeenCalled();
    expect(invoke.mock.calls).toEqual([
      ["jumpToPromptInSelectedTerminal previous"],
      ["jumpToPromptInSelectedTerminal next"],
    ]);

    editing = true;
    for (const key of ["ArrowUp", "ArrowDown"])
      expect(press(key, modifiers).preventDefault).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(2);
    // Other shortcuts still run from a field.
    const find = platform === "darwin" ? { meta: true } : modifiers;
    expect(press("f", find).preventDefault).toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith("findInSelectedTerminal");
  },
);

it("treats fields as text entry, but not the terminal's own input", () => {
  document.body.innerHTML = `
    <div class="restty-terminal-surface">
      <textarea id="ime"></textarea>
      <div role="search"><input id="find" type="search"></div>
    </div>
    <textarea id="snippet"></textarea>
    <input id="name" type="text">
    <input id="locked" type="text" readonly>
    <input id="check" type="checkbox">
    <div id="rich" contenteditable="true"></div>
    <button id="button">OK</button>`;
  const entry = (id: string) => isTextEntry(document.getElementById(id));
  expect(entry("ime")).toBe(false);
  expect(entry("find")).toBe(true);
  expect(entry("snippet")).toBe(true);
  expect(entry("name")).toBe(true);
  expect(entry("locked")).toBe(false);
  expect(entry("check")).toBe(false);
  expect(entry("button")).toBe(false);
  expect(isTextEntry(null)).toBe(false);

  const report = vi.fn();
  const stop = reportTextEntryFocus(document, report);
  document.getElementById("ime")!.focus();
  document.getElementById("name")!.focus();
  document.getElementById("snippet")!.focus();
  document.getElementById("ime")!.focus();
  document.getElementById("name")!.focus();
  document.getElementById("name")!.blur();
  stop();
  document.getElementById("name")!.focus();
  expect(report.mock.calls).toEqual([[true], [false], [true], [false]]);
});

it("keeps only its own page's reports and starts over on reload", () => {
  const listeners = new Map<string, (...args: never[]) => void>();
  const ipc = {
    on: vi.fn((channel: string, listener: (...args: never[]) => void) =>
      listeners.set(channel, listener),
    ),
    removeListener: vi.fn(),
  };
  const contents = {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
    on: (event: string, listener: () => void) => listeners.set(event, listener),
  };
  const focus = trackTextEntryFocus(contents, ipc);
  const receive = listeners.get(terminalIpc.textEntryFocus)! as (
    event: unknown,
    value: unknown,
  ) => void;
  const own = { sender: contents, senderFrame: contents.mainFrame };
  receive({ sender: {}, senderFrame: {} }, true);
  receive({ sender: contents, senderFrame: {} }, true);
  receive(own, "yes");
  expect(focus.editing()).toBe(false);
  receive(own, true);
  expect(focus.editing()).toBe(true);
  listeners.get("did-start-loading")!();
  expect(focus.editing()).toBe(false);
  listeners.get("destroyed")!();
  expect(ipc.removeListener).toHaveBeenCalledWith(
    terminalIpc.textEntryFocus,
    receive,
  );
});

it("leaves the prompt-jump chords to an extension view's own fields", () => {
  const invoke = vi.fn();
  const catalog = catalogFor("linux", invoke);
  const owner = Object.assign(new EventEmitter(), {
    isFocused: () => true,
    webContents: Object.assign(new EventEmitter(), { send: vi.fn() }),
    getNativeWindowHandle: () => Buffer.alloc(8),
  }) as unknown as BrowserWindow;
  const press = (key: string) => {
    const event = { defaultPrevented: false, preventDefault: vi.fn() };
    deliverExtensionKeybind(
      catalog,
      event as unknown as Event,
      {
        type: "keyDown",
        key,
        code: "",
        control: true,
        shift: true,
        alt: false,
        meta: false,
      } as Input,
      owner,
      createKeybindCapture("linux"),
      { optionIdentity: { platform: "linux" } },
    );
    return event.preventDefault;
  };
  expect(press("ArrowUp")).not.toHaveBeenCalled();
  expect(press("ArrowDown")).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(press("F")).toHaveBeenCalled();
  expect(invoke.mock.calls).toEqual([["findInSelectedTerminal"]]);
});
