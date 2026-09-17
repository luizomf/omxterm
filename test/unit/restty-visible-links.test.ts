// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { installResttyVisibleLinks } from "../../src/terminal-surface/restty-visible-links";

describe("Restty visible-link gestures", () => {
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
        }),
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
    remove();
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
        }),
      },
      request,
      "Linux x86_64",
    );
    canvas.dispatchEvent(pointer("pointerdown", { ctrlKey: true, buttons: 1 }));
    canvas.dispatchEvent(pointer("pointerup", { ctrlKey: true, buttons: 0 }));
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "https://example.test/image.png",
    );
    remove();
  });
});

function pointer(
  type: "pointerdown" | "pointerup",
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
