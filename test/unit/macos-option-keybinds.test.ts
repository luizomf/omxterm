import { EventEmitter } from "node:events";
import type { BrowserWindow, Event, Input } from "electron";
import { expect, it, vi } from "vitest";
import {
  createCoreActionCatalog,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import {
  deliverExtensionKeybind,
  registerWindowActionDelivery,
} from "../../src/main/window-action-delivery";
import type { OptionShortcutIdentity } from "../../src/main/macos-option-shortcut";
import {
  canonicalAccelerator,
  terminalDefaultKeybinds,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

it.each([..."0123456789"])(
  "treats Option digit %s and its keypad pair as macOS-only collisions",
  (digit) => {
    expect(canonicalAccelerator(`Option+num${digit}`, "darwin")).toBe(
      canonicalAccelerator(`Alt+${digit}`, "darwin"),
    );
    for (const platform of ["linux", "win32"])
      expect(canonicalAccelerator(`Alt+num${digit}`, platform)).not.toBe(
        canonicalAccelerator(`Alt+${digit}`, platform),
      );
    for (const modifier of ["Alt+Shift", "Control+Alt", "Command+Alt", "AltGr"])
      expect(
        canonicalAccelerator(`${modifier}+num${digit}`, "darwin"),
      ).not.toBe(canonicalAccelerator(`${modifier}+${digit}`, "darwin"));
  },
);

type Route = "core" | "child";

function harness(
  bindings: Partial<TerminalKeybinds> = { find: "Alt+A" },
  resolve: (
    handle: Buffer,
    code: string,
    characters: string,
  ) => string | null = () => "a",
  platform = "darwin",
  available = true,
) {
  const find = vi.fn();
  const newTab = vi.fn();
  const tool = vi.fn();
  const other = vi.fn();
  const contents = Object.assign(new EventEmitter(), { send: vi.fn() });
  const handle = Buffer.alloc(8, 1);
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isFocused: () => true,
    getNativeWindowHandle: () => handle,
  }) as unknown as BrowserWindow;
  const capture = createKeybindCapture(platform);
  const actions = new Proxy(
    {
      findInSelectedTerminal: find,
      newTabInSelectedWindow: newTab,
    } as unknown as TerminalApplicationMenuActions,
    { get: (target, key): unknown => Reflect.get(target, key) ?? other },
  );
  const catalog = () =>
    createCoreActionCatalog(
      "OMXTerm",
      actions,
      { ...terminalDefaultKeybinds(platform), ...bindings },
      undefined,
      [
        {
          id: "omxterm.files.open",
          extension: true,
          shortcut: "toggleFiles",
          label: "Files",
          accelerator: null,
          palette: true,
          invoke: tool,
        },
      ],
    );
  const native = { resolve: vi.fn(resolve) };
  const optionIdentity: OptionShortcutIdentity = available
    ? { platform, native }
    : { platform };
  registerWindowActionDelivery(
    window,
    catalog,
    capture,
    () => undefined,
    optionIdentity,
  );
  function send(route: Route, overrides: Record<string, unknown> = {}) {
    const input = {
      type: "keyDown",
      key: "å",
      code: "KeyA",
      alt: true,
      control: false,
      shift: false,
      meta: false,
      isAutoRepeat: false,
      isComposing: false,
      _modifiers: 4,
      location: 0,
      modifiers: [],
      ...overrides,
    } as unknown as Input;
    const event = { preventDefault: vi.fn(), defaultPrevented: false };
    if (route === "core") contents.emit("before-input-event", event, input);
    else
      deliverExtensionKeybind(
        catalog(),
        event as unknown as Event,
        input,
        window,
        capture,
        { optionIdentity },
      );
    return { event, input };
  }
  return { find, newTab, tool, other, contents, handle, capture, native, send };
}

it.each(["core", "child"] as const)(
  "delivers the current French layout identity through %s without changing the original event",
  (route) => {
    const f = harness({ find: "Alt+Q" }, () => "q");
    const { event, input } = f.send(route, { key: "‡" });
    expect(f.native.resolve).toHaveBeenCalledWith(f.handle, "KeyA", "‡");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(f.find).toHaveBeenCalledOnce();
    expect(input.key).toBe("‡");
  },
);

it.each(["core", "child"] as const)(
  "samples the selected layout again for each %s gesture",
  (route) => {
    let source: "brazilian" | "french" = "brazilian";
    const f = harness(
      { find: "Alt+A", newTab: "Alt+Q" },
      (_handle, code, characters) => {
        if (code !== "KeyA") return null;
        if (source === "brazilian" && characters === "å") return "a";
        if (source === "french" && characters === "‡") return "q";
        return null;
      },
    );
    expect(f.send(route).event.preventDefault).toHaveBeenCalledOnce();
    source = "french";
    expect(
      f.send(route, { key: "‡" }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    expect(f.find).toHaveBeenCalledOnce();
    expect(f.newTab).toHaveBeenCalledOnce();
    expect(f.native.resolve).toHaveBeenCalledTimes(2);
  },
);

it.each(["core", "child"] as const)(
  "leaves unqualified %s inputs on their old path without a native lookup",
  (route) => {
    const f = harness();
    for (const overrides of [
      { type: "keyUp" },
      { type: "rawKeyDown" },
      { isComposing: true },
      { isComposing: undefined },
      { isAutoRepeat: true },
      { isAutoRepeat: undefined },
      { shift: true },
      { control: true },
      { meta: true },
      { alt: false },
      { _modifiers: undefined },
      { _modifiers: 32768 },
      { _modifiers: NaN },
      { key: "Dead" },
      { key: "Process" },
      { key: "Unidentified" },
      { code: undefined },
      { code: "Semicolon" },
      { code: "Numpad9" },
    ])
      f.send(route, overrides);
    expect(f.native.resolve).not.toHaveBeenCalled();
    expect(f.find).not.toHaveBeenCalled();
  },
);

it.each(["core", "child"] as const)(
  "keeps %s routing unchanged when the native snapshot refuses or throws",
  (route) => {
    for (const resolve of [
      () => null, // includes window, event, characters, modifier and IME-source mismatches
      () => {
        throw new Error("unavailable");
      },
      () => ",", // non-ASCII-letter identity
      () => "9", // wrong domain for a Key position
    ]) {
      const f = harness(undefined, resolve);
      expect(f.send(route).event.preventDefault).not.toHaveBeenCalled();
      expect(f.find).not.toHaveBeenCalled();
    }
  },
);

it.each(["core", "child"] as const)(
  "records Option identity in %s and retains its gesture across routes",
  (route) => {
    const f = harness();
    const otherRoute = route === "core" ? "child" : "core";
    f.capture.set(f.contents, { captureId: "child-capture", active: true });
    expect(f.send(route).event.preventDefault).toHaveBeenCalledOnce();
    expect(f.contents.send).toHaveBeenCalledWith("settings:captured", {
      captureId: "child-capture",
      shortcut: { accelerator: "Alt+A" },
    });
    expect(
      f.send(otherRoute, { isAutoRepeat: true }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    expect(
      f.send(otherRoute, { type: "keyUp", isComposing: true }).event
        .preventDefault,
    ).toHaveBeenCalledOnce();
    expect(f.native.resolve).toHaveBeenCalledOnce();
    expect(f.find).not.toHaveBeenCalled();
  },
);

it("retains old behavior when the optional addon is missing", () => {
  const f = harness(undefined, () => "a", "darwin", false);
  expect(f.send("core").event.preventDefault).not.toHaveBeenCalled();
  expect(f.send("child").event.preventDefault).not.toHaveBeenCalled();
  expect(f.native.resolve).not.toHaveBeenCalled();
  expect(f.find).not.toHaveBeenCalled();
});

it.each(["core", "child"] as const)(
  "retains Option tool gestures starting in %s across focus transfer",
  (from) => {
    const f = harness({ toggleFiles: "Alt+A" });
    const to = from === "core" ? "child" : "core";
    expect(f.send(from).event.preventDefault).toHaveBeenCalledOnce();
    expect(
      f.send(to, { isAutoRepeat: true, isComposing: true }).event
        .preventDefault,
    ).toHaveBeenCalledOnce();
    expect(
      f.send(to, { type: "keyUp", isComposing: true }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    expect(f.tool).toHaveBeenCalledOnce();
    expect(f.native.resolve).toHaveBeenCalledOnce();
    expect(f.send(to).event.preventDefault).toHaveBeenCalledOnce();
    expect(f.tool).toHaveBeenCalledTimes(2);
  },
);

it.each(["linux", "win32"])("never calls the macOS addon on %s", (platform) => {
  const f = harness({ find: "Alt+A" }, () => "a", platform);
  expect(f.send("core").event.preventDefault).not.toHaveBeenCalled();
  expect(f.send("child").event.preventDefault).not.toHaveBeenCalled();
  expect(f.native.resolve).not.toHaveBeenCalled();
});

it.each([..."0123456789"])(
  "matches an injected native top-row digit %s and rejects a different digit",
  (digit) => {
    const f = harness({ find: `Alt+${digit}` }, () => digit);
    expect(
      f.send("core", { key: "¤", code: `Digit${digit}` }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    expect(f.find).toHaveBeenCalledOnce();
    const mismatch = harness({ find: `Alt+${digit}` }, () =>
      digit === "9" ? "8" : "9",
    );
    expect(
      mismatch.send("core", { key: "¤", code: `Digit${digit}` }).event
        .preventDefault,
    ).not.toHaveBeenCalled();
    expect(mismatch.find).not.toHaveBeenCalled();
  },
);

it("preserves keypad priority and menu fallback for individually bound Option digits", () => {
  const topOnly = harness({ find: "Alt+9" }, () => "9");
  expect(
    topOnly.send("core", { key: "ª", code: "Digit9" }).event.preventDefault,
  ).toHaveBeenCalledOnce();
  expect(
    topOnly.send("core", { key: "9", code: "Numpad9" }).event.preventDefault,
  ).toHaveBeenCalledOnce();
  expect(topOnly.find).toHaveBeenCalledTimes(2);
  const keypadOnly = harness({ find: "Alt+num9" }, () => "9");
  expect(
    keypadOnly.send("core", { key: "ª", code: "Digit9" }).event.preventDefault,
  ).not.toHaveBeenCalled();
  expect(
    keypadOnly.send("core", { key: "9", code: "Numpad9" }).event.preventDefault,
  ).toHaveBeenCalledOnce();
  expect(keypadOnly.find).toHaveBeenCalledOnce();
});
