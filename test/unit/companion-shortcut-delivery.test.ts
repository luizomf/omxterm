import { EventEmitter } from "node:events";
import type { BrowserWindow, Event, Input } from "electron";
import { expect, it, vi } from "vitest";
import {
  createCoreActionCatalog,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import {
  deliverExtensionKeybind,
  registerWindowActionDelivery,
} from "../../src/main/window-action-delivery";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import {
  terminalDefaultKeybinds,
  type CompanionToolAction,
} from "../../src/shared/terminal-keybinds";

const key = {
  type: "keyDown",
  key: "j",
  code: "KeyJ",
  control: true,
  alt: true,
  shift: false,
  meta: false,
};
function fixture(action: CompanionToolAction = "toggleFiles") {
  const invoke = vi.fn();
  const other = vi.fn();
  let focused = true;
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    isDestroyed: () => false,
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isFocused: () => focused,
  }) as unknown as BrowserWindow;
  const capture = createKeybindCapture(process.platform);
  let available = true;
  let binding: string | null = "Control+Alt+J";
  const catalog = () =>
    createCoreActionCatalog(
      "OMXTerm",
      new Proxy({} as TerminalApplicationMenuActions, { get: () => other }),
      {
        ...terminalDefaultKeybinds(process.platform),
        [action]: binding,
        zoomIn: "Control+Alt+K",
      },
      undefined,
      available
        ? [
            {
              id:
                action === "toggleFiles"
                  ? "omxterm.files.open"
                  : "omxterm.ssh.open",
              extension: true,
              shortcut: action,
              label: "Tool",
              accelerator: null,
              palette: true,
              invoke,
            },
          ]
        : [],
    );
  registerWindowActionDelivery(window, catalog, capture, () => undefined);
  function send(route: "core" | "child", overrides: Partial<Input> = {}) {
    const input = { ...key, ...overrides } as Input;
    let defaultPrevented = false;
    const event = {
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: vi.fn(() => {
        defaultPrevented = true;
      }),
    };
    if (route === "core") contents.emit("before-input-event", event, input);
    else
      deliverExtensionKeybind(
        catalog(),
        event as unknown as Event,
        input,
        window,
        capture,
      );
    return event.preventDefault;
  }
  return {
    invoke,
    other,
    contents,
    window,
    capture,
    send,
    disable: () => {
      available = false;
    },
    unbind: () => {
      binding = null;
    },
    blur: () => {
      focused = false;
      window.emit("blur");
    },
    focus: () => {
      focused = true;
    },
  };
}

it.each(["toggleFiles", "toggleSshConnect"] as const)(
  "%s toggles once per press and consumes held repeats and release",
  (action) => {
    const f = fixture(action);
    expect(f.send("core")).toHaveBeenCalledOnce();
    expect(f.send("core", { isAutoRepeat: true })).toHaveBeenCalledOnce();
    expect(f.invoke).toHaveBeenCalledOnce();
    expect(
      f.send("core", { type: "keyUp", control: false, alt: false }),
    ).toHaveBeenCalledOnce();
    f.send("core");
    expect(f.invoke).toHaveBeenCalledTimes(2);
  },
);

it.each(["core", "child"] as const)(
  "contains a press starting in %s across native focus transfer and disable",
  (from) => {
    const f = fixture();
    const to = from === "core" ? "child" : "core";
    f.send(from);
    f.disable();
    expect(f.send(to, { isAutoRepeat: true })).toHaveBeenCalledOnce();
    expect(
      f.send(to, { type: "keyUp", control: false, alt: false }),
    ).toHaveBeenCalledOnce();
    expect(f.invoke).toHaveBeenCalledOnce();
    expect(f.send(to)).not.toHaveBeenCalled();
  },
);

it("keeps unbound tools out of native child and core delivery", () => {
  const f = fixture();
  f.unbind();
  expect(f.send("core")).not.toHaveBeenCalled();
  expect(f.send("child")).not.toHaveBeenCalled();
  expect(f.invoke).not.toHaveBeenCalled();
});

it("gives Settings recording priority and contains its recorded gesture", () => {
  const f = fixture();
  f.capture.set(f.contents, { captureId: "record-tool", active: true });
  expect(f.send("core")).toHaveBeenCalledOnce();
  expect(f.send("core", { isAutoRepeat: true })).toHaveBeenCalledOnce();
  expect(f.send("core", { type: "keyUp" })).toHaveBeenCalledOnce();
  expect(f.invoke).not.toHaveBeenCalled();
  expect(f.contents.send).toHaveBeenCalledWith(expect.any(String), {
    captureId: "record-tool",
    shortcut: { accelerator: "Control+Alt+J" },
  });
  f.send("child");
  expect(f.invoke).toHaveBeenCalledOnce();
});

it("recovers lost release on a fresh press or window blur, never on child/core focus transfer", () => {
  const f = fixture();
  f.send("child");
  f.send("core"); // fresh nonrepeat down recovers a missing release
  expect(f.invoke).toHaveBeenCalledTimes(2);
  f.blur();
  expect(f.send("child", { isAutoRepeat: true })).not.toHaveBeenCalled();
  f.focus();
  expect(f.send("core", { isAutoRepeat: true })).toHaveBeenCalledOnce();
  expect(f.invoke).toHaveBeenCalledTimes(2); // orphan repeat cannot reopen
  f.send("core", { type: "keyUp" });
  f.send("child");
  expect(f.invoke).toHaveBeenCalledTimes(3);
});

it("keeps gestures window-owned and preserves unrelated repeating actions", () => {
  const a = fixture();
  const b = fixture();
  a.send("child");
  expect(b.send("core", { type: "keyUp" })).not.toHaveBeenCalled();
  b.send("core");
  expect(b.invoke).toHaveBeenCalledOnce();
  for (const route of ["core", "child"] as const) {
    expect(a.send(route, { key: "k", code: "KeyK" })).toHaveBeenCalledOnce();
    expect(
      a.send(route, { key: "k", code: "KeyK", isAutoRepeat: true }),
    ).toHaveBeenCalledOnce();
    expect(
      a.send(route, { key: "k", code: "KeyK", type: "keyUp" }),
    ).not.toHaveBeenCalled();
  }
  expect(a.other).toHaveBeenCalledTimes(4);
  expect(a.invoke).toHaveBeenCalledOnce();
});

it("releases shortcut ownership on renderer replacement", () => {
  const f = fixture();
  f.send("child");
  f.contents.emit("did-start-loading");
  expect(f.send("core", { type: "keyUp" })).not.toHaveBeenCalled();
});
