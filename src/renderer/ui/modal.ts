export type ModalActionKind = "primary" | "danger" | "default";

export interface ModalAction<Value> {
  readonly label: string;
  readonly value: Value;
  readonly kind?: ModalActionKind;
}

export interface ModalOptions<Value> {
  readonly title: string;
  readonly body?: HTMLElement | string;
  readonly actions: readonly ModalAction<Value>[];
  readonly className?: string;
  // Called before a non-cancel action resolves; return false to stay open.
  readonly beforeResolve?: (value: Value) => boolean | Promise<boolean>;
  readonly initialFocus?: HTMLElement;
}

// A native modal <dialog> owned by OMXTerm chrome. Escape and the backdrop
// cancel (resolve undefined); focus returns to the previous element.
export function openModal<Value>(
  document: Document,
  options: ModalOptions<Value>,
): Promise<Value | undefined> {
  const dialog = document.createElement("dialog");
  dialog.className = `omx-modal ${options.className ?? ""}`.trim();
  const titleId = `omx-modal-title-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const heading = document.createElement("h2");
  heading.id = titleId;
  heading.textContent = options.title;
  const content = document.createElement("div");
  content.className = "omx-modal-body";
  if (typeof options.body === "string") {
    const paragraph = document.createElement("p");
    paragraph.textContent = options.body;
    content.append(paragraph);
  } else if (options.body) content.append(options.body);
  const footer = document.createElement("div");
  footer.className = "omx-modal-actions";
  dialog.append(heading, content, footer);
  const previous = document.activeElement as HTMLElement | null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Value | undefined) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      previous?.focus?.();
      resolve(value);
    };
    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.className = `omx-button omx-button-${action.kind ?? "default"}`;
      button.addEventListener("click", () => {
        void (async () => {
          if (
            action.kind !== undefined &&
            action.kind !== "default" &&
            options.beforeResolve &&
            !(await options.beforeResolve(action.value))
          )
            return;
          finish(action.value);
        })();
      });
      footer.append(button);
    }
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(undefined);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(undefined);
    });
    // Enter in a single-line field submits with the primary action.
    dialog.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "Enter" &&
        target instanceof HTMLInputElement &&
        target.type !== "checkbox"
      ) {
        event.preventDefault();
        footer.querySelector<HTMLButtonElement>(".omx-button-primary")?.click();
      }
      event.stopPropagation();
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    (
      options.initialFocus ??
      dialog.querySelector<HTMLElement>(
        "input, select, textarea, .omx-button-primary, button",
      )
    )?.focus();
  });
}

export async function confirmAction(
  document: Document,
  options: {
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
    readonly danger?: boolean;
  },
): Promise<boolean> {
  const result = await openModal(document, {
    title: options.title,
    body: options.message,
    actions: [
      { label: options.cancelLabel, value: false },
      {
        label: options.confirmLabel,
        value: true,
        kind: options.danger ? "danger" : "primary",
      },
    ],
  });
  return result === true;
}

export async function promptText(
  document: Document,
  options: {
    readonly title: string;
    readonly label: string;
    readonly value?: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
    readonly validate?: (value: string) => string | undefined;
  },
): Promise<string | undefined> {
  const field = document.createElement("label");
  field.className = "omx-field";
  const caption = document.createElement("span");
  caption.textContent = options.label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = options.value ?? "";
  const error = document.createElement("span");
  error.className = "omx-field-error";
  error.setAttribute("role", "alert");
  field.append(caption, input, error);
  const result = await openModal(document, {
    title: options.title,
    body: field,
    initialFocus: input,
    actions: [
      { label: options.cancelLabel, value: false },
      { label: options.confirmLabel, value: true, kind: "primary" },
    ],
    beforeResolve: () => {
      const message = options.validate?.(input.value);
      error.textContent = message ?? "";
      return message === undefined;
    },
  });
  return result === true ? input.value.trim() : undefined;
}
