// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fixture, settle } from "../fixtures/companion-content";
import {
  cleanupSnippetsWindows,
  snippetsWindow,
} from "../fixtures/snippets-window";

afterEach(cleanupSnippetsWindows);

it("applies side through live configuration to retained native and built-in views", async () => {
  const f = await fixture();
  f.open("files");
  await settle();
  const slot = f.root.querySelector<HTMLElement>(".companion-native-slot")!;
  vi.spyOn(slot, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x:
          f.root.parentElement!.dataset.auxiliaryPanelSide === "left"
            ? 12
            : 712,
        y: 80,
        width: 256,
        height: 400,
      }) as DOMRect,
  );
  let frame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  f.setSide("left");
  frame(0);
  await settle();
  expect(f.root.querySelector(".companion-native-slot")).toBe(slot);
  expect(f.bridge.present).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: "files",
      activeId: "files",
      focus: false,
      bounds: { x: 12, y: 80, width: 256, height: 400 },
    }),
  );
  expect(f.bridge.close).not.toHaveBeenCalled();
  expect(f.adapters).toHaveBeenCalledOnce();
  f.settingsOpen();
  await settle();
  f.setSide("right");
  frame(0);
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.bridge.present).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: null }),
  );
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.querySelector(".companion-native-slot")).toBe(slot);
  expect(f.bridge.present).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: "files",
      bounds: { x: 712, y: 80, width: 256, height: 400 },
    }),
  );
  f.toggle();
  await settle();
  const input = f.root.querySelector<HTMLInputElement>("input")!;
  input.value = "draft";
  input.focus();
  const loads = f.load.mock.calls.length;
  f.setSide("left");
  frame(0);
  await settle();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("draft");
  expect(f.load).toHaveBeenCalledTimes(loads);
  expect(f.adapters).toHaveBeenCalledOnce();
});

it("initializes left placement while empty and does not reopen a hidden panel", async () => {
  const f = await snippetsWindow({}, true, "left");
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("left");
  expect(f.root.hidden).toBe(true);
  f.toggle();
  await settle();
  f.panelToggle();
  await settle();
  f.setSide("right");
  expect(f.root.hidden).toBe(true);
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("right");
});
