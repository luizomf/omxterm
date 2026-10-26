// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWindow, KeyboardInputEvent } from "electron";
import {
  assertCaptureSample,
  exerciseSettingsTabCapture,
} from "../fixtures/settings-shortcut-oracles";

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(window, "retainedSettingsEditor");
});
const before = { bytes: 6, actions: 2, menu: 1, quit: 0, fullScreen: false };
it("accepts only the exact fenced input and unchanged capture action observations", () => {
  expect(() =>
    assertCaptureSample("prefixESC", before, before, "synthetic", "ESC"),
  ).not.toThrow();
  expect(() =>
    assertCaptureSample("prefixxESC", before, before, "synthetic", "ESC"),
  ).toThrow("leaked to the actual PTY");
  for (const changed of [
    { actions: 3 },
    { menu: 2 },
    { quit: 1 },
    { fullScreen: true },
  ])
    expect(() =>
      assertCaptureSample(
        "prefixESC",
        before,
        { ...before, ...changed },
        "synthetic",
        "ESC",
      ),
    ).toThrow();
});

// External Electron/Chromium port: down/up deliver key transitions, only char
// edits text. This models the diagnosed event contract, not native insertion.
function tabCapture(missingChar = false) {
  document.body.innerHTML =
    '<nav id="tab-strip"><button role="tab">Terminal</button></nav><section class="settings-tab"><button id="settings-tab-config-file">Config File</button><button id="settings-tab-shortcuts">Shortcuts</button><div class="settings-config-file"><textarea></textarea></div><p class="settings-status">Recording cancelled.</p></section><main class="terminal-surface" tabindex="0" hidden></main>';
  const editor = document.querySelector("textarea")!;
  editor.value = '{ "version": 1 }\n';
  const initial = editor.value;
  const settings = document.querySelector<HTMLElement>(".settings-tab")!;
  const terminal = document.querySelector<HTMLElement>(".terminal-surface")!;
  const events: KeyboardInputEvent[] = [];
  const sendInputEvent = vi.fn((event: KeyboardInputEvent) => {
    if (missingChar && event.type === "char") return;
    events.push(event);
    if (event.type === "char")
      editor.setRangeText(
        event.keyCode,
        editor.selectionStart,
        editor.selectionEnd,
        "end",
      );
  });
  document
    .querySelector<HTMLButtonElement>("#tab-strip button")!
    .addEventListener("click", () => {
      settings.hidden = true;
      terminal.hidden = false;
      terminal.focus();
    });
  const finish = vi.fn(async () => {});
  const close = vi.fn(async () => {});
  const record = vi.fn(async () => {});
  const options = {
    window: {
      webContents: {
        executeJavaScript: async (script: string) =>
          window.eval(script) as unknown,
        sendInputEvent,
      },
    } as unknown as BrowserWindow,
    open: async () => {
      settings.hidden = false;
      terminal.hidden = true;
    },
    finish,
    close,
    record,
    waitFor: async (check: () => boolean | Promise<boolean>, label: string) => {
      if (!(await check()))
        throw new Error(`Fixture predicate not satisfied: ${label}`);
    },
  };
  return {
    options,
    editor,
    initial,
    events,
    sendInputEvent,
    finish,
    close,
    record,
  };
}

it.each(["end", "selected-middle"] as const)(
  "requests ordered down/char/up and retains the exact appended draft from %s caret",
  async (position) => {
    const f = tabCapture();
    if (position === "selected-middle")
      f.editor.setSelectionRange(1, 4, "backward");
    await exerciseSettingsTabCapture(f.options);
    expect(f.sendInputEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: "keyDown", keyCode: "X" },
      { type: "char", keyCode: "x" },
      { type: "keyUp", keyCode: "X" },
    ]);
    expect(f.editor.value).toBe(f.initial + "x");
    expect([f.editor.selectionStart, f.editor.selectionEnd]).toEqual([
      f.initial.length + 1,
      f.initial.length + 1,
    ]);
    expect(f.finish).toHaveBeenCalledOnce();
    expect(f.record).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
  },
);

it("rejects changed retained bytes even when the trailing x survives", async () => {
  const f = tabCapture();
  f.finish.mockImplementationOnce(async () => {
    f.editor.value = "different retained draftx";
  });
  await expect(exerciseSettingsTabCapture(f.options)).rejects.toThrow();
  expect(f.finish).toHaveBeenCalledOnce();
  expect(f.close).not.toHaveBeenCalled();
});

it("refuses missing-char delivery before the retained-tab/PTY completion phase", async () => {
  const f = tabCapture(true);
  const unchanged = f.initial + "x"; // A preexisting suffix cannot supply the missing input.
  f.editor.value = unchanged;
  await expect(exerciseSettingsTabCapture(f.options)).rejects.toThrow(
    "graphical field received native input",
  );
  expect(f.events).toEqual([
    { type: "keyDown", keyCode: "X" },
    { type: "keyUp", keyCode: "X" },
  ]);
  expect(f.editor.value).toBe(unchanged);
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.record).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
});
