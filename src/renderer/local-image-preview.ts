import { UNSUPPORTED_LOCAL_IMAGE_FORMAT } from "../shared/local-image";
import type { Translator } from "../shared/i18n";
import { fileDetails } from "./files/file-peek-card";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";

const ENGLISH_LABELS = {
  dialog: "Local image preview",
  close: "Close local image preview",
  closeHint: "Close · Esc",
  image: "Selected local image",
  error: "Local image preview error",
  failed:
    "Could not preview this image. The file may be unavailable, invalid or over the static PNG/JPEG limits (64 MiB, 8192 per side, 32 million pixels).",
  unsupported: UNSUPPORTED_LOCAL_IMAGE_FORMAT,
  zoom: "Click the image to switch between fitting the window and its actual size.",
};

function previewLabels(translator: Translator | undefined) {
  if (!translator) return ENGLISH_LABELS;
  const t = translator.t.bind(translator);
  return {
    dialog: t("imagePreview.dialog"),
    close: t("imagePreview.close"),
    closeHint: t("imagePreview.closeHint"),
    image: t("imagePreview.image"),
    error: t("imagePreview.error"),
    failed: t("imagePreview.failed"),
    unsupported: t("imagePreview.unsupported"),
    zoom: t("imagePreview.zoom"),
  };
}

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
    // Details under the image (dimensions, size, date, path) and actions on
    // the file; absent, the overlay shows the image alone.
    readonly details?: LocalImageDetailsOptions;
    // Translated labels; English when absent.
    readonly translator?: Translator;
  },
): LocalImagePreview {
  const labels = previewLabels(options.translator);
  const dialog = document.createElement("dialog");
  dialog.className = "local-image-preview";
  dialog.setAttribute("aria-label", labels.dialog);

  // Header (name and close button), the image stage, then the details.
  const header = document.createElement("div");
  header.className = "local-image-preview-header";
  const title = document.createElement("p");
  title.className = "local-image-preview-title";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "local-image-preview-close";
  closeButton.textContent = "×";
  closeButton.title = labels.closeHint;
  closeButton.setAttribute("aria-label", labels.close);
  header.append(title, closeButton);

  const stage = document.createElement("div");
  stage.className = "local-image-preview-stage";
  const image = document.createElement("img");
  image.alt = labels.image;
  image.title = labels.zoom;
  const error = document.createElement("p");
  error.className = "local-image-preview-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  stage.append(image, error);
  const info = document.createElement("div");
  info.className = "local-image-preview-info";
  info.hidden = true;
  // Click toggles between fitting the window and the actual size.
  image.addEventListener("click", () => dialog.classList.toggle("actual-size"));
  dialog.append(header, stage, info);
  document.body.append(dialog);

  let objectUrl: string | undefined;
  let opening = false;
  let disposed = false;

  // The image may use the dialog's maximum height minus its header, details
  // and spacing. A percentage cannot express this (the dialog has only a
  // maximum height), so the space is measured and handed to CSS.
  const view = document.defaultView;
  const fitImage = () => {
    if (!dialog.open || !view) return;
    const style = view.getComputedStyle(dialog);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const shown = [header, stage, info].filter((part) => !part.hidden);
    const room =
      px(style.maxHeight) -
      px(style.paddingTop) -
      px(style.paddingBottom) -
      px(style.borderTopWidth) -
      px(style.borderBottomWidth) -
      header.offsetHeight -
      (info.hidden ? 0 : info.offsetHeight) -
      px(style.rowGap) * (shown.length - 1);
    dialog.style.setProperty(
      "--preview-image-max-height",
      `${Math.max(48, Math.floor(room))}px`,
    );
  };
  const resizes =
    view && "ResizeObserver" in view
      ? new view.ResizeObserver(fitImage)
      : undefined;
  resizes?.observe(info);
  resizes?.observe(dialog);
  view?.addEventListener("resize", fitImage);

  const clear = () => {
    image.removeAttribute("src");
    image.hidden = true;
    info.hidden = true;
    info.replaceChildren();
    title.textContent = "";
    dialog.classList.remove("actual-size");
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
    fitImage();
    closeButton.focus();
  };
  const showError = (failure: unknown) => {
    clear();
    error.textContent =
      failure instanceof Error &&
      failure.message.includes(UNSUPPORTED_LOCAL_IMAGE_FORMAT)
        ? labels.unsupported
        : labels.failed;
    error.hidden = false;
    dialog.setAttribute("aria-label", labels.error);
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
        title.textContent = selected.name;
        dialog.setAttribute("aria-label", `${labels.dialog}: ${selected.name}`);
        const bytes = new Uint8Array(selected.data);
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: selected.mime }),
        );
        image.src = objectUrl;
        await image.decode();
        if (disposed) return;
        if (options.details && selected.path) {
          info.replaceChildren(
            ...imageDetails(document, options.details, selected, dismiss),
          );
          info.hidden = false;
        }
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
      resizes?.disconnect();
      view?.removeEventListener("resize", fitImage);
      clear();
      if (dialog.open) dialog.close();
      dialog.remove();
      options.onActivityChange?.();
    },
  };
}

export interface LocalImageDetailsOptions {
  readonly translator: Translator;
  readonly copyPath: (path: string) => Promise<void>;
  readonly insertPath: (path: string) => void;
  readonly open: (path: string) => Promise<unknown>;
  readonly reveal: (path: string) => Promise<unknown>;
}

function imageDetails(
  document: Document,
  details: LocalImageDetailsOptions,
  image: LocalImageData,
  dismiss: () => void,
): HTMLElement[] {
  const t = details.translator.t.bind(details.translator);
  const path = image.path!;
  const status = document.createElement("p");
  status.className = "local-image-preview-status";
  status.setAttribute("role", "status");
  const run = (action: () => Promise<unknown>, done?: string) => () =>
    void action().then(
      () => {
        if (done) status.textContent = done;
      },
      () => {
        status.textContent = t("peek.actionFailed");
      },
    );
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "omx-button";
    element.textContent = label;
    element.addEventListener("click", action);
    return element;
  };
  const actions = document.createElement("div");
  actions.className = "file-peek-actions";
  actions.append(
    button(
      t("files.copyPath"),
      run(() => details.copyPath(path), t("peek.pathCopied")),
    ),
    button(t("peek.insertPath"), () => {
      dismiss();
      details.insertPath(path);
    }),
    button(
      t("files.open"),
      run(() => details.open(path)),
    ),
    button(
      t("files.reveal"),
      run(() => details.reveal(path)),
    ),
  );
  return [
    fileDetails(document, details.translator, {
      path,
      kind: "image",
      mime: image.mime,
      width: image.width,
      height: image.height,
      ...(image.size === undefined ? {} : { size: image.size }),
      ...(image.modified === undefined ? {} : { modified: image.modified }),
    }),
    actions,
    status,
  ];
}
