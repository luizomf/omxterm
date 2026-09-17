// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalImagePreview } from "../../src/renderer/local-image-preview";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../../src/shared/local-image";

const image: LocalImageData = {
  name: "synthetic.png",
  mime: "image/png",
  width: 1,
  height: 1,
  data: new Uint8Array([1]),
};

function setup(
  loadImage: (
    source?: LocalImageActivation,
  ) => Promise<LocalImageData | null> = async () => image,
) {
  document.body.replaceChildren();
  if (!("decode" in HTMLImageElement.prototype))
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: async () => undefined,
    });
  if (!("showModal" in HTMLDialogElement.prototype))
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {},
    });
  if (!("close" in HTMLDialogElement.prototype))
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {},
    });
  const activeUrls = new Set<string>();
  let sequence = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const value = `blob:synthetic-${++sequence}`;
    activeUrls.add(value);
    return value;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((value) => {
    activeUrls.delete(value);
  });
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  const closeEvents: Array<() => void> = [];
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    if (!this.open) return;
    this.open = false;
    closeEvents.push(() => this.dispatchEvent(new Event("close")));
  });
  const focusTerminal = vi.fn();
  const loadImageMock = vi.fn(loadImage);
  const preview = createLocalImagePreview(document, {
    loadImage: loadImageMock,
    focusTerminal,
  });
  return {
    preview,
    loadImage: loadImageMock,
    focusTerminal,
    activeUrls,
    closeEvents,
    dialog: document.querySelector("dialog")!,
    element: document.querySelector("img")!,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("local image preview overlay", () => {
  it("releases bytes synchronously and ignores stale close events after reopening", async () => {
    const view = setup();
    await view.preview.open();
    expect(view.dialog.open).toBe(true);
    expect(view.activeUrls.size).toBe(1);

    view.dialog.querySelector("button")!.click();
    expect(view.dialog.open).toBe(false);
    expect(view.element.hasAttribute("src")).toBe(false);
    expect(view.activeUrls.size).toBe(0);
    expect(view.focusTerminal).toHaveBeenCalledOnce();

    await view.preview.open({
      source: "native-path",
      path: "/tmp/second.png",
    });
    const current = view.element.src;
    for (const dispatch of view.closeEvents) dispatch();
    expect(view.dialog.open).toBe(true);
    expect(view.element.src).toBe(current);
    expect(view.activeUrls.has(current)).toBe(true);
    expect(view.loadImage.mock.calls).toEqual([
      [undefined],
      [{ source: "native-path", path: "/tmp/second.png" }],
    ]);

    view.preview.dispose();
    expect(view.activeUrls.size).toBe(0);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("keeps cancellation, failures, and late picker/decode results inert after disposal", async () => {
    const cancelled = setup(vi.fn(async () => null));
    await cancelled.preview.open();
    expect(cancelled.dialog.open).toBe(false);
    expect(cancelled.focusTerminal).toHaveBeenCalledOnce();
    cancelled.preview.dispose();

    const failed = setup(
      vi.fn(async () => Promise.reject(new Error("private path"))),
    );
    await failed.preview.open({
      source: "file-url",
      url: "file:///private/path.png",
    });
    expect(failed.dialog.open).toBe(true);
    expect(failed.dialog.textContent).toContain("Could not preview this image");
    expect(failed.dialog.textContent).not.toContain("private path");
    failed.preview.dispose();

    let resolveSelection!: (value: LocalImageData) => void;
    const late = setup(
      vi.fn(
        () =>
          new Promise<LocalImageData>((resolve) => {
            resolveSelection = resolve;
          }),
      ),
    );
    const opening = late.preview.open();
    late.preview.dispose();
    resolveSelection(image);
    await opening;
    expect(late.activeUrls.size).toBe(0);
    expect(late.focusTerminal).not.toHaveBeenCalled();

    let finishDecode!: () => void;
    const decoding = setup();
    vi.mocked(HTMLImageElement.prototype.decode).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve;
        }),
    );
    const decodeOpening = decoding.preview.open();
    await Promise.resolve();
    expect(decoding.activeUrls.size).toBe(1);
    decoding.preview.dispose();
    finishDecode();
    await decodeOpening;
    expect(decoding.activeUrls.size).toBe(0);
    expect(decoding.dialog.open).toBe(false);
  });

  it("dismisses on Escape and backdrop while restoring the live selected terminal", async () => {
    const view = setup();
    await view.preview.open();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    view.dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(view.dialog.open).toBe(false);

    await view.preview.open();
    vi.spyOn(view.dialog, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 200,
      top: 100,
      bottom: 200,
      width: 100,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    view.dialog.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    expect(view.dialog.open).toBe(false);
    expect(view.focusTerminal).toHaveBeenCalledTimes(2);
    view.preview.dispose();
  });
});
