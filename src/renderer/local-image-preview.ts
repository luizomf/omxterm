import type { LocalImageData } from "../shared/local-image";

const PREVIEW_ERROR =
  "Could not preview this image. Choose a static PNG/JPEG up to 16 MiB, 8192 per side and 16 million pixels.";

export interface LocalImagePreview {
  open(fileUrl?: string): Promise<void>;
  dispose(): void;
}

export function createLocalImagePreview(
  document: Document,
  options: {
    readonly loadImage: (fileUrl?: string) => Promise<LocalImageData | null>;
    readonly focusTerminal: () => void;
  },
): LocalImagePreview {
  const dialog = document.createElement("dialog");
  dialog.className = "local-image-preview";
  dialog.setAttribute("aria-label", "Local image preview");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "local-image-preview-close";
  closeButton.textContent = "×";
  closeButton.title = "Close · Esc";
  closeButton.setAttribute("aria-label", "Close local image preview");

  const image = document.createElement("img");
  image.alt = "Selected local image";
  const error = document.createElement("p");
  error.className = "local-image-preview-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  dialog.append(closeButton, image, error);
  document.body.append(dialog);

  let objectUrl: string | undefined;
  let opening = false;
  let disposed = false;

  const clear = () => {
    image.removeAttribute("src");
    image.hidden = true;
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };
  const dismiss = () => {
    const wasOpen = dialog.open;
    clear();
    error.hidden = true;
    error.textContent = "";
    if (wasOpen) dialog.close();
    if (wasOpen && !disposed) options.focusTerminal();
  };
  const show = () => {
    if (!dialog.open) dialog.showModal();
    closeButton.focus();
  };
  const showError = () => {
    clear();
    error.textContent = PREVIEW_ERROR;
    error.hidden = false;
    dialog.setAttribute("aria-label", "Local image preview error");
    show();
  };

  closeButton.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener("pointerdown", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dismiss();
  });

  return {
    async open(fileUrl) {
      if (disposed || opening || dialog.open) return;
      opening = true;
      try {
        const selected = await options.loadImage(fileUrl);
        if (disposed) return;
        if (!selected) {
          options.focusTerminal();
          return;
        }
        clear();
        error.hidden = true;
        image.hidden = false;
        image.alt = selected.name;
        dialog.setAttribute(
          "aria-label",
          `Local image preview: ${selected.name}`,
        );
        const bytes = new Uint8Array(selected.data);
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: selected.mime }),
        );
        image.src = objectUrl;
        await image.decode();
        if (disposed) return;
        show();
      } catch {
        if (!disposed) showError();
      } finally {
        opening = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      if (dialog.open) dialog.close();
      dialog.remove();
    },
  };
}
