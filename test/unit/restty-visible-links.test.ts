// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { installResttyVisibleLinks } from "../../src/terminal-surface/restty-visible-links";

describe("Restty visible-link gestures", () => {
  it("preserves stationary pointer through internal IME focus and clears external focus", () => {
    const root = document.createElement("main");
    root.className = "restty-terminal-surface";
    const canvas = document.createElement("canvas");
    const input = document.createElement("textarea");
    const outside = document.createElement("button");
    canvas.tabIndex = 0;
    root.append(canvas, input);
    document.body.append(root, outside);
    const hover = vi.fn();
    const controller = installResttyVisibleLinks(
      canvas,
      {
        getVisibleLinkAtClientPoint: () => ({
          id: "1",
          url: "/tmp/a.png",
          cells: [1, 2],
        }),
        setVisibleLinkHover: hover,
      },
      vi.fn(),
      "MacIntel",
    );
    canvas.focus();
    canvas.dispatchEvent(pointer("pointermove", {}));
    input.focus();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
    );
    expect(hover).toHaveBeenLastCalledWith([1, 2]);
    outside.focus();
    expect(hover).toHaveBeenLastCalledWith(null);
    controller.dispose();
    root.remove();
    outside.remove();
  });

  it("suppresses cues during host preview activity and unsubscribes on disposal", () => {
    const canvas = document.createElement("canvas");
    let enabled = true;
    let invalidate = () => {};
    const unsubscribe = vi.fn();
    const hover = vi.fn();
    const controller = installResttyVisibleLinks(
      canvas,
      {
        getVisibleLinkAtClientPoint: () => ({
          id: "1",
          url: "/tmp/a.png",
          cells: [1],
        }),
        setVisibleLinkHover: hover,
      },
      vi.fn(),
      "MacIntel",
      {
        isEnabled: () => enabled,
        subscribe(listener) {
          invalidate = listener;
          return unsubscribe;
        },
      },
    );
    canvas.dispatchEvent(pointer("pointermove", { metaKey: true }));
    expect(hover).toHaveBeenLastCalledWith([1]);
    enabled = false;
    invalidate();
    canvas.dispatchEvent(pointer("pointermove", { metaKey: true }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
    );
    expect(hover).toHaveBeenLastCalledWith(null);
    enabled = true;
    invalidate();
    canvas.dispatchEvent(pointer("pointermove", { metaKey: true }));
    expect(hover).toHaveBeenLastCalledWith([1]);
    controller.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("underlines only a stationary pointer destination while the platform modifier is held", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const setVisibleLinkHover = vi.fn();
    const request = vi.fn();
    const controller = installResttyVisibleLinks(
      canvas,
      {
        getVisibleLinkAtClientPoint: () => ({
          id: "web-1",
          url: "https://example.test/image.png",
          cells: [4, 5, 6],
        }),
        setVisibleLinkHover,
      },
      request,
      "MacIntel",
    );

    canvas.dispatchEvent(pointer("pointermove", {}));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Meta", metaKey: true }),
    );
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith([4, 5, 6]);
    expect(request).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta" }));
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }),
    );
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    expect(request).not.toHaveBeenCalled();

    controller.dispose();
    canvas.remove();
  });

  it("clears hover state without swallowing lifecycle or unrelated input", async () => {
    const surface = document.createElement("main");
    surface.className = "terminal-surface";
    const canvas = document.createElement("canvas");
    surface.append(canvas);
    document.body.append(surface);
    const setVisibleLinkHover = vi.fn();
    const interaction = {
      getVisibleLinkAtClientPoint: vi.fn(() => ({
        id: "web-1",
        url: "https://example.test",
        cells: [1, 2],
      })),
      setVisibleLinkHover,
    };
    const request = vi.fn();
    const keyObserver = vi.fn();
    window.addEventListener("keydown", keyObserver);
    const controller = installResttyVisibleLinks(
      canvas,
      interaction,
      request,
      "Linux x86_64",
    );

    canvas.dispatchEvent(pointer("pointermove", { ctrlKey: true }));
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith([1, 2]);
    controller.invalidate();
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    canvas.dispatchEvent(pointer("pointermove", { ctrlKey: true }));
    window.dispatchEvent(new Event("resize"));
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    canvas.dispatchEvent(pointer("pointermove", { ctrlKey: true }));
    canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    canvas.dispatchEvent(pointer("pointermove", { ctrlKey: true }));

    surface.hidden = true;
    await vi.waitFor(() =>
      expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null),
    );
    const key = new KeyboardEvent("keydown", { key: "Control", ctrlKey: true });
    window.dispatchEvent(key);
    expect(setVisibleLinkHover).toHaveBeenLastCalledWith(null);
    expect(keyObserver).toHaveBeenCalledOnce();
    expect(key.defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();

    controller.dispose();
    const callsAfterDispose = setVisibleLinkHover.mock.calls.length;
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }),
    );
    expect(setVisibleLinkHover).toHaveBeenCalledTimes(callsAfterDispose);
    window.removeEventListener("keydown", keyObserver);
    surface.remove();
  });

  it("gives modified local-file activation precedence over application mouse reporting", () => {
    const canvas = document.createElement("canvas");
    const request = vi.fn();
    const mouseReports = vi.fn();
    canvas.addEventListener("pointerdown", mouseReports);
    canvas.addEventListener("pointerup", mouseReports);
    const remove = installResttyVisibleLinks(
      canvas,
      {
        getVisibleLinkAtClientPoint: () => ({
          id: "local-1",
          url: "file:///tmp/image.png",
          cells: [1],
        }),
        setVisibleLinkHover: vi.fn(),
      },
      request,
      "MacIntel",
    );

    canvas.dispatchEvent(pointer("pointerdown", { metaKey: true, buttons: 1 }));
    canvas.dispatchEvent(pointer("pointerup", { metaKey: true, buttons: 0 }));
    expect(request).toHaveBeenCalledExactlyOnceWith("file:///tmp/image.png");
    expect(mouseReports).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointer("pointerdown", { buttons: 1 }));
    canvas.dispatchEvent(pointer("pointerup", { buttons: 0 }));
    expect(request).toHaveBeenCalledOnce();
    expect(mouseReports).toHaveBeenCalledTimes(2);
    remove.dispose();
  });

  it("keeps the existing modified HTTP gesture unchanged off macOS", () => {
    const canvas = document.createElement("canvas");
    const request = vi.fn();
    const remove = installResttyVisibleLinks(
      canvas,
      {
        getVisibleLinkAtClientPoint: () => ({
          id: "web-1",
          url: "https://example.test/image.png",
          cells: [1],
        }),
        setVisibleLinkHover: vi.fn(),
      },
      request,
      "Linux x86_64",
    );
    canvas.dispatchEvent(pointer("pointerdown", { ctrlKey: true, buttons: 1 }));
    canvas.dispatchEvent(pointer("pointerup", { ctrlKey: true, buttons: 0 }));
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "https://example.test/image.png",
    );
    remove.dispose();
  });
});

function pointer(
  type: "pointerdown" | "pointerup" | "pointermove",
  overrides: PointerEventInit,
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 10,
    clientY: 10,
    ...overrides,
  });
}
