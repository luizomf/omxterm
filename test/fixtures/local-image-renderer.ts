import { createLocalImagePreview } from "../../src/renderer/local-image-preview";
import type { LocalImageData } from "../../src/shared/local-image";

let selected: LocalImageData | null = null;
const terminalInput = document.querySelector<HTMLTextAreaElement>("textarea")!;
const preview = createLocalImagePreview(document, {
  loadImage: async () => selected,
  focusTerminal: () => terminalInput.focus(),
});
const metrics = () => {
  const dialog = document.querySelector("dialog")!;
  const image = dialog.querySelector("img")!;
  return {
    open: dialog.open,
    decoded: image.naturalWidth === 1 && image.naturalHeight === 1,
    hasSource: image.hasAttribute("src"),
    terminalFocused: document.activeElement === terminalInput,
  };
};

declare global {
  var __localImagePreviewProbe: {
    open(
      data: Omit<LocalImageData, "data"> & { data: number[] },
    ): Promise<ReturnType<typeof metrics>>;
    dismiss(): ReturnType<typeof metrics>;
    openGenerated(width: number, height: number): Promise<void>;
    layout(): { contained: boolean; proportional: boolean; visible: boolean };
  };
}

globalThis.__localImagePreviewProbe = {
  async open(data) {
    selected = { ...data, data: new Uint8Array(data.data) };
    await preview.open();
    return metrics();
  },
  async openGenerated(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!)),
    );
    selected = {
      name: "generated.png",
      mime: "image/png",
      width,
      height,
      data: new Uint8Array(await blob.arrayBuffer()),
    };
    await preview.open();
  },
  layout() {
    const dialog = document.querySelector("dialog")!;
    const image = dialog.querySelector("img")!;
    const bounds = dialog.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    return {
      contained:
        rect.left >= bounds.left + parseFloat(style.paddingLeft) + 1 &&
        rect.right <= bounds.right - parseFloat(style.paddingRight) - 1 + 0.1 &&
        rect.top >= bounds.top + parseFloat(style.paddingTop) + 1 &&
        rect.bottom <=
          bounds.bottom - parseFloat(style.paddingBottom) - 1 + 0.1 &&
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth &&
        bounds.bottom <= innerHeight,
      proportional:
        Math.abs(
          rect.width / rect.height - image.naturalWidth / image.naturalHeight,
        ) < 0.02,
      visible: rect.width > 0 && rect.height > 0,
    };
  },
  dismiss() {
    document.querySelector<HTMLButtonElement>("dialog button")!.click();
    return metrics();
  },
};
window.addEventListener("pagehide", () => preview.dispose(), { once: true });
