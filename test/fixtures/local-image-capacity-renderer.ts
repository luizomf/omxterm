import { createLocalImagePreview } from "../../src/renderer/local-image-preview";

const terminal = document.querySelector<HTMLTextAreaElement>("textarea")!;
const activeUrls = new Set<string>();
const create = URL.createObjectURL.bind(URL);
const revoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = create(blob);
  activeUrls.add(url);
  return url;
};
URL.revokeObjectURL = (url) => {
  activeUrls.delete(url);
  revoke(url);
};
const preview = createLocalImagePreview(document, {
  loadImage: window.omxterm.terminal.loadLocalImage,
  focusTerminal: () => terminal.focus(),
});
const state = () => {
  const dialog = document.querySelector("dialog")!;
  const image = dialog.querySelector("img")!;
  const rect = image.getBoundingClientRect();
  return {
    open: dialog.open,
    width: image.naturalWidth,
    height: image.naturalHeight,
    visible: !image.hidden && rect.width > 0 && rect.height > 0,
    hasSource: image.hasAttribute("src"),
    activeUrls: activeUrls.size,
    terminalFocused: document.activeElement === terminal,
    error: dialog.querySelector("p")!.textContent,
  };
};
declare global {
  var __capacity: {
    open(path: string): Promise<ReturnType<typeof state>>;
    dismiss(): ReturnType<typeof state>;
    disposeDuringDecode(path: string): Promise<ReturnType<typeof state> | null>;
  };
}
globalThis.__capacity = {
  async open(path) {
    await preview.open({ source: "native-path", path });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return state();
  },
  dismiss() {
    document.querySelector<HTMLButtonElement>("dialog button")!.click();
    return state();
  },
  async disposeDuringDecode(path) {
    // Pause the real decode only after Chromium has completed it. Disposal must
    // release its source and make the later completion unable to show a dialog.
    const decode = HTMLImageElement.prototype.decode;
    let reached!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      reached();
      await gate;
    };
    const pending = preview.open({ source: "native-path", path });
    await ready;
    preview.dispose();
    release();
    await pending;
    HTMLImageElement.prototype.decode = decode;
    return document.querySelector("dialog") === null && activeUrls.size === 0
      ? null
      : state();
  },
};
window.addEventListener("pagehide", () => preview.dispose(), { once: true });
