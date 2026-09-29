import { UNSUPPORTED_LOCAL_IMAGE_FORMAT } from "../shared/local-image";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";

const PREVIEW_ERROR =
  "Could not preview this image. Choose a static PNG/JPEG up to 16 MiB, 8192 per side and 16 million pixels.";

export interface LocalImagePreview {
  isActive(): boolean;
  open(source?: LocalImageActivation): Promise<void>;
  dispose(): void;
}

export function createLocalImagePreview(
  document: Document,
  options: {
    readonly loadImage: (
      source?: LocalImageActivation,
    ) => Promise<LocalImageData | null>;
    readonly focusTerminal: () => void;
    readonly onActivityChange?: () => void;
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
    options.onActivityChange?.();
    if (wasOpen && !disposed) options.focusTerminal();
  };
  const show = () => {
    if (!dialog.open) dialog.showModal();
    closeButton.focus();
  };
  const showError = (failure: unknown) => {
    clear();
    error.textContent =
      failure instanceof Error &&
      failure.message.includes(UNSUPPORTED_LOCAL_IMAGE_FORMAT)
        ? UNSUPPORTED_LOCAL_IMAGE_FORMAT
        : PREVIEW_ERROR;
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
    isActive: () => !disposed && (opening || dialog.open),
    async open(source) {
      if (disposed || opening || dialog.open) return;
      opening = true;
      options.onActivityChange?.();
      try {
        const selected = await options.loadImage(source);
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
      } catch (failure) {
        if (!disposed) showError(failure);
      } finally {
        opening = false;
        options.onActivityChange?.();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      if (dialog.open) dialog.close();
      dialog.remove();
      options.onActivityChange?.();
    },
  };
}
