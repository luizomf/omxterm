import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { createPaletteTransport } from "../../src/preload/command-palette-bridge";
import { createAboutBridge } from "../../src/preload/about-bridge";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { aboutIpc } from "../../src/shared/about";
import { settingsIpc } from "../../src/shared/settings";
import { paletteIpc } from "../../src/shared/command-palette";
import { terminalIpc } from "../../src/shared/terminal-ipc";

it("reuses validated About/Settings handlers and leaves native delivery unchanged", () => {
  const events = new EventEmitter();
  const { palette, transport } = createPaletteTransport({
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
    invoke: vi.fn(),
  });
  const about = createAboutBridge(transport);
  const settings = createSettingsBridge(transport);
  const opened = vi.fn();
  const configured = vi.fn();
  const removeAbout = about.onOpen(opened);
  const removeSettings = settings.onOpen(configured);
  const send = (token: unknown, channel: string, payload?: unknown) =>
    events.emit(paletteIpc.dispatch, {}, { token, channel, payload });
  send("a", aboutIpc.open);
  expect(opened).not.toHaveBeenCalled();
  palette.setDispatchGuard((token) => token === "a");
  send("b", aboutIpc.open);
  send(42, aboutIpc.open);
  send("a", aboutIpc.open, "invalid");
  send("a", terminalIpc.clipboardAction, "paste");
  expect(opened).not.toHaveBeenCalled();
  send("a", aboutIpc.open);
  send("a", settingsIpc.open);
  expect(opened).toHaveBeenCalledOnce();
  expect(configured).toHaveBeenCalledOnce();
  palette.setDispatchGuard(undefined);
  send("a", aboutIpc.open);
  events.emit(aboutIpc.open, {});
  expect(opened).toHaveBeenCalledTimes(2);
  removeAbout();
  removeSettings();
  expect(events.listenerCount(paletteIpc.dispatch)).toBe(0);
});

it("guards auxiliary panel envelopes and removes both direct and palette subscriptions", () => {
  const events = new EventEmitter();
  const { palette, transport } = createPaletteTransport({
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
    invoke: vi.fn(),
  });
  const listener = vi.fn();
  transport.on(terminalIpc.auxiliaryPanelToggle, listener);
  const send = (token: string) =>
    events.emit(
      paletteIpc.dispatch,
      {},
      { token, channel: terminalIpc.auxiliaryPanelToggle },
    );
  send("current");
  palette.setDispatchGuard((token) => token === "current");
  send("stale");
  expect(listener).not.toHaveBeenCalled();
  send("current");
  expect(listener).toHaveBeenCalledOnce();
  transport.removeListener(terminalIpc.auxiliaryPanelToggle, listener);
  events.emit(terminalIpc.auxiliaryPanelToggle, {});
  send("current");
  expect(listener).toHaveBeenCalledOnce();
  expect(events.listenerCount(paletteIpc.dispatch)).toBe(0);
});

it("validates snapshots and literal invoke arguments and excludes non-action channels", async () => {
  const events = new EventEmitter();
  const invoke = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    token: "a",
    actions: [{ id: "zoom", label: "Zoom", accelerator: null }],
  }));
  const { palette, transport } = createPaletteTransport({
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
    invoke,
  });
  expect((await palette.snapshot()).actions).toHaveLength(1);
  await palette.invoke("a", "zoom");
  expect(invoke).toHaveBeenLastCalledWith(paletteIpc.invoke, "a", "zoom");
  await expect(palette.invoke("", "zoom")).rejects.toThrow();
  invoke.mockResolvedValueOnce({
    token: "a",
    actions: [{ id: "z", label: 42 }],
  });
  await expect(palette.snapshot()).rejects.toThrow();
  const input = vi.fn();
  transport.on(terminalIpc.input, input);
  palette.setDispatchGuard(() => true);
  events.emit(
    paletteIpc.dispatch,
    {},
    { token: "a", channel: terminalIpc.input, payload: "x" },
  );
  expect(input).not.toHaveBeenCalled();
  events.emit(terminalIpc.input, {}, "x");
  expect(input).toHaveBeenCalledOnce();
  transport.removeListener(terminalIpc.input, input);
});
