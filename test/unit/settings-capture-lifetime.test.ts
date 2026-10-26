// @vitest-environment jsdom
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { createSettingsService } from "../../src/main/settings-service";
import { startSettings } from "../../src/main/settings-wiring";
import type { IpcHandler } from "../../src/main/terminal-ipc-types";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { createSettingsView as createSettingsDialog } from "../../src/renderer/settings/settings-dialog";
import { settingsIpc } from "../../src/shared/settings";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const release of cleanup.splice(0).reverse()) await release();
  vi.useRealTimers();
  document.body.replaceChildren();
});

async function open() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-capture-lifetime-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "omxterm"));
  const file = path.join(root, "omxterm", "config.json");
  const original = '{ "version": 1 }\n';
  await writeFile(file, original);
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      platform: "linux",
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload: async () => ({ applied: true, notices: [] }),
  });
  const handlers = new Map<string, IpcHandler>();
  const listeners = new Map<
    string,
    Set<(event: unknown, payload: unknown) => void>
  >();
  const queued: [string, unknown][] = [];
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => {
      queued.push([channel, payload]);
    },
  });
  const capture = createKeybindCapture("linux");
  const settings = startSettings({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel) => {
        handlers.delete(channel);
      },
    },
    isTrustedSender: (event) =>
      event.sender === contents && event.senderFrame === contents.mainFrame,
    service,
    selectedContents: () => contents,
    capture,
  });
  cleanup.push(settings.dispose);
  const bridge = createSettingsBridge({
    invoke: async (channel, payload) =>
      handlers.get(channel)!(
        { sender: contents, senderFrame: contents.mainFrame },
        payload,
      ),
    on: (channel, listener) => {
      const current = listeners.get(channel) ?? new Set();
      current.add(listener);
      listeners.set(channel, current);
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener);
    },
  });
  const invokeAction = vi.fn();
  deliverKeybindsFromKeyEvents(
    contents,
    () => terminalDefaultKeybinds("linux"),
    invokeAction,
    "linux",
    capture,
  );
  const dialog = createSettingsDialog(document, bridge, {
    focusTerminal: () => {},
    onActivityChange: () => {},
  });
  cleanup.push(dialog.dispose);
  const show = async () => {
    await dialog.open();
    document
      .querySelector<HTMLButtonElement>("#settings-tab-shortcuts")!
      .click();
  };
  await show();
  const record = (action: string) =>
    document.querySelector<HTMLButtonElement>(
      `.settings-shortcut[data-action="${action}"] .settings-shortcut-record`,
    )!;
  const press = (key: string, input: Record<string, unknown> = {}) =>
    contents.emit(
      "before-input-event",
      { preventDefault() {} },
      {
        type: "keyDown",
        key,
        code: key,
        control: false,
        meta: false,
        alt: false,
        shift: false,
        ...input,
      },
    );
  const flush = () => {
    for (const [channel, payload] of queued.splice(0))
      for (const listener of [...(listeners.get(channel) ?? [])])
        listener({}, payload);
  };
  return { record, press, flush, show, file, original, service, invokeAction };
}

it("reports unsupported native identity truthfully and keeps recording for another key", async () => {
  const view = await open();
  view.record("find").click();
  view.press("<", { code: "IntlBackslash", control: true, shift: true });
  view.flush();
  expect(document.querySelector(".settings-status")!.textContent).toContain(
    "That key combination is not supported.",
  );
  expect(view.record("find").textContent).toBe("Cancel");
  expect(await readFile(view.file, "utf8")).toBe(view.original);
});

it("clears the real dialog's recording prompt when native capture times out", async () => {
  const view = await open();
  vi.useFakeTimers();
  view.record("find").click();
  vi.advanceTimersByTime(30_000);
  view.flush();
  expect(view.record("find").textContent).toBe("Record");
  expect(document.querySelector(".settings-status")!.textContent).toBe(
    "Recording cancelled.",
  );
  view.press("F11");
  expect(view.invokeAction).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
  expect(await readFile(view.file, "utf8")).toBe(view.original);
});

it("returns the native keyboard when an unfocused Record activation leaves the page", async () => {
  const view = await open();
  view.record("find").click();
  document.querySelector<HTMLButtonElement>("#settings-tab-general")!.click();
  view.press("F11");
  view.flush();
  expect(view.invokeAction).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
  expect(await readFile(view.file, "utf8")).toBe(view.original);
});

it.each([
  ["success", "switch"],
  ["cancel", "switch"],
  ["success", "reopen"],
  ["cancel", "reopen"],
])(
  "ignores delayed %s from a retired recording after %s",
  async (outcome, replacement) => {
    const view = await open();
    view.record("find").click();
    view.press(outcome === "success" ? "F2" : "Escape");
    if (replacement === "reopen") {
      document.querySelector<HTMLButtonElement>(".settings-close")!.click();
      await view.show();
    }
    view.record("newTab").click();
    view.flush();
    // A retired native result must neither save a key nor end the new recording.
    await view.service.snapshot();
    expect(view.record("newTab").textContent).toBe("Cancel");
    expect(await readFile(view.file, "utf8")).toBe(view.original);
    expect(view.invokeAction).not.toHaveBeenCalled();
  },
);
