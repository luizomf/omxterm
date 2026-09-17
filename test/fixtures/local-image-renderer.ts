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
  };
}

globalThis.__localImagePreviewProbe = {
  async open(data) {
    selected = { ...data, data: new Uint8Array(data.data) };
    await preview.open();
    return metrics();
  },
  dismiss() {
    document.querySelector<HTMLButtonElement>("dialog button")!.click();
    return metrics();
  },
};
window.addEventListener("pagehide", () => preview.dispose(), { once: true });
