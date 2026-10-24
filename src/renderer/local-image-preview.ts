import { UNSUPPORTED_LOCAL_IMAGE_FORMAT } from "../shared/local-image";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

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
    readonly language?: RendererLanguage;
  },
): LocalImagePreview {
  const language = options.language ?? englishLanguage;
  const dialog = document.createElement("dialog");
  dialog.className = "local-image-preview";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "local-image-preview-close";
  closeButton.textContent = "×";

  const image = document.createElement("img");
  const error = document.createElement("p");
  error.className = "local-image-preview-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  dialog.append(closeButton, image, error);
  document.body.append(dialog);

  let objectUrl: string | undefined;
  let opening = false;
  let disposed = false;
  // What the dialog currently shows, so its labels follow language changes.
  let shown:
    | { readonly kind: "image"; readonly name: string }
    | { readonly kind: "error"; readonly unsupported: boolean }
    | undefined;
  const unbindLabels = language.bind((t) => {
    closeButton.title = t("preview.closeHint");
    closeButton.setAttribute("aria-label", t("preview.close"));
    if (shown?.kind === "error") {
      dialog.setAttribute("aria-label", t("preview.errorRegion"));
      error.textContent = t(
        shown.unsupported ? "preview.unsupported" : "preview.error",
      );
    } else if (shown?.kind === "image")
      dialog.setAttribute(
        "aria-label",
        t("preview.named", { name: shown.name }),
      );
    else {
      dialog.setAttribute("aria-label", t("preview.region"));
      image.alt = t("preview.image");
    }
  });

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
    shown = undefined;
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
    const unsupported =
      failure instanceof Error &&
      failure.message.includes(UNSUPPORTED_LOCAL_IMAGE_FORMAT);
    shown = { kind: "error", unsupported };
    error.textContent = language.t(
      unsupported ? "preview.unsupported" : "preview.error",
    );
    error.hidden = false;
    dialog.setAttribute("aria-label", language.t("preview.errorRegion"));
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
        shown = { kind: "image", name: selected.name };
        dialog.setAttribute(
          "aria-label",
          language.t("preview.named", { name: selected.name }),
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
      unbindLabels();
      clear();
      if (dialog.open) dialog.close();
      dialog.remove();
      options.onActivityChange?.();
    },
  };
}
