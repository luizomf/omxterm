import { UNSUPPORTED_LOCAL_IMAGE_FORMAT } from "../shared/local-image";
import type { Translator } from "../shared/i18n";
import { fileDetails } from "./files/file-peek-card";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";

const PREVIEW_ERROR =
  "Could not preview this image. The file may be unavailable, invalid or over the static PNG/JPEG limits (64 MiB, 8192 per side, 32 million pixels).";

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
  const info = document.createElement("div");
  info.className = "local-image-preview-info";
  info.hidden = true;
  // Click toggles between fitting the window and the actual size.
  image.addEventListener("click", () => dialog.classList.toggle("actual-size"));
  dialog.append(closeButton, image, error, info);
  document.body.append(dialog);

  let objectUrl: string | undefined;
  let opening = false;
  let disposed = false;

  const clear = () => {
    image.removeAttribute("src");
    image.hidden = true;
    info.hidden = true;
    info.replaceChildren();
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
  const title = document.createElement("p");
  title.className = "file-peek-name";
  title.textContent = image.name;
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
    title,
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
