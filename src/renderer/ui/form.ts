// Small accessible form builders shared by sidebar dialogs. Each field has a
// visible label, an optional hint and an error slot announced to assistive
// technology.
export interface FormField<Control extends HTMLElement = HTMLElement> {
  readonly element: HTMLElement;
  readonly control: Control;
  setError(message: string | undefined): void;
  setVisible(visible: boolean): void;
}

let nextId = 0;

export function field<Control extends HTMLElement>(
  document: Document,
  label: string,
  control: Control,
  hint?: string,
): FormField<Control> {
  const element = document.createElement("div");
  element.className = "omx-field";
  // A composite control (path input) labels its first form element.
  const labelled = control.matches("input, select, textarea")
    ? control
    : (control.querySelector<HTMLElement>("input, select, textarea") ??
      control);
  const id = labelled.id || `omx-field-${(nextId += 1)}`;
  labelled.id = id;
  const caption = document.createElement("label");
  caption.htmlFor = id;
  caption.textContent = label;
  const error = document.createElement("span");
  error.className = "omx-field-error";
  error.id = `${id}-error`;
  error.setAttribute("role", "alert");
  element.append(caption, control);
  if (hint) {
    const hintElement = document.createElement("span");
    hintElement.className = "omx-field-hint";
    hintElement.id = `${id}-hint`;
    hintElement.textContent = hint;
    labelled.setAttribute("aria-describedby", hintElement.id);
    element.append(hintElement);
  }
  element.append(error);
  return {
    element,
    control,
    setError(message) {
      error.textContent = message ?? "";
      if (message) labelled.setAttribute("aria-invalid", "true");
      else labelled.removeAttribute("aria-invalid");
    },
    setVisible(visible) {
      element.hidden = !visible;
    },
  };
}

export function textInput(
  document: Document,
  value = "",
  options: { readonly placeholder?: string; readonly type?: string } = {},
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  input.value = value;
  input.spellcheck = false;
  input.autocomplete = "off";
  if (options.placeholder) input.placeholder = options.placeholder;
  return input;
}

export function textArea(
  document: Document,
  value = "",
  rows = 3,
): HTMLTextAreaElement {
  const area = document.createElement("textarea");
  area.value = value;
  area.rows = rows;
  area.spellcheck = false;
  return area;
}

export function selectInput(
  document: Document,
  options: ReadonlyArray<readonly [value: string, label: string]>,
  value: string,
): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }
  select.value = value;
  return select;
}

export function checkbox(
  document: Document,
  label: string,
  checked: boolean,
): { readonly element: HTMLLabelElement; readonly input: HTMLInputElement } {
  const element = document.createElement("label");
  element.className = "omx-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const text = document.createElement("span");
  text.textContent = label;
  element.append(input, text);
  return { element, input };
}

// A text input with a trailing "Browse…" button that fills it.
export function pathInput(
  document: Document,
  value: string,
  browseLabel: string,
  choose: () => Promise<string | null>,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const element = document.createElement("div");
  element.className = "omx-path-input";
  const input = textInput(document, value);
  const browse = document.createElement("button");
  browse.type = "button";
  browse.className = "omx-button";
  browse.textContent = browseLabel;
  browse.addEventListener("click", () => {
    void choose().then((chosen) => {
      if (chosen) input.value = chosen;
    });
  });
  element.append(input, browse);
  return { element, input };
}

export function section(
  document: Document,
  title: string,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "omx-section";
  const legend = document.createElement("legend");
  legend.textContent = title;
  fieldset.append(legend);
  return fieldset;
}

export const lines = (text: string): string[] =>
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
