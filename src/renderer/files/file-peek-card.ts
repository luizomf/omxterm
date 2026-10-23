import type { FilePeek } from "../../shared/file-peek";
import type { MessageKey, Translator } from "../../shared/i18n";
import { formatSize } from "./files-list";

export interface FilePeekActions {
  readonly copyPath: () => void;
  readonly insertPath: () => void;
  readonly open?: () => void;
  readonly reveal: () => void;
  // PNG and JPEG images open in the full Local Image Preview.
  readonly view?: () => void;
}

const KIND_LABELS: Readonly<Record<FilePeek["kind"], MessageKey>> = {
  image: "peek.kind.image",
  pdf: "peek.kind.pdf",
  text: "peek.kind.text",
  directory: "peek.kind.directory",
  media: "peek.kind.media",
  document: "peek.kind.document",
  other: "peek.kind.other",
};

// Name/value rows describing a file, shared by the hover card and the Local
// Image Preview.
export function fileDetails(
  document: Document,
  translator: Translator,
  facts: Partial<Omit<FilePeek, "thumbnail" | "text" | "entries">> & {
    readonly path: string;
  },
): HTMLDListElement {
  const t = translator.t.bind(translator);
  const list = document.createElement("dl");
  list.className = "file-details";
  const row = (label: MessageKey, value: string | undefined) => {
    if (!value) return;
    const name = document.createElement("dt");
    name.textContent = t(label);
    const content = document.createElement("dd");
    content.textContent = value;
    if (label === "peek.path") content.className = "file-details-path";
    list.append(name, content);
  };
  row(
    "peek.type",
    [facts.kind ? t(KIND_LABELS[facts.kind]) : undefined, facts.mime]
      .filter(Boolean)
      .join(" · "),
  );
  if (facts.kind === "directory")
    row(
      "peek.items",
      facts.entryCount === undefined
        ? undefined
        : translator.formatNumber(facts.entryCount),
    );
  else if (facts.size !== undefined)
    row(
      "peek.size",
      facts.size < 1024
        ? formatSize(facts.size, translator)
        : `${formatSize(facts.size, translator)} (${translator.formatNumber(facts.size)} B)`,
    );
  if (facts.width && facts.height)
    row("peek.dimensions", `${facts.width} × ${facts.height} px`);
  if (facts.pages) row("peek.pages", translator.formatNumber(facts.pages));
  if (facts.title) row("peek.title", facts.title);
  if (facts.modified)
    row(
      "peek.modified",
      translator.formatDate(facts.modified, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  if (facts.executable) row("peek.permissions", t("peek.executable"));
  row("peek.path", facts.path);
  return list;
}

function button(
  document: Document,
  label: string,
  action: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "omx-button";
  element.textContent = label;
  element.addEventListener("click", action);
  return element;
}

// The card's content: a picture, the first lines or the first entries, then
// the details and what can be done with the file.
export function filePeekCard(
  document: Document,
  translator: Translator,
  peek: FilePeek,
  actions: FilePeekActions,
): { readonly element: HTMLElement; dispose(): void } {
  const t = translator.t.bind(translator);
  const card = document.createElement("div");
  card.className = `file-peek file-peek-${peek.kind}`;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", peek.name);
  const title = document.createElement("p");
  title.className = "file-peek-name";
  title.textContent = peek.kind === "directory" ? `${peek.name}/` : peek.name;
  card.append(title);
  let objectUrl: string | undefined;
  if (peek.thumbnail) {
    const image = document.createElement("img");
    image.className = "file-peek-image";
    image.alt = peek.name;
    objectUrl = URL.createObjectURL(
      new Blob([new Uint8Array(peek.thumbnail.data)], {
        type: peek.thumbnail.mime,
      }),
    );
    image.src = objectUrl;
    card.append(image);
  } else if (peek.text !== undefined) {
    const text = document.createElement("pre");
    text.className = "file-peek-text";
    text.textContent =
      peek.text === ""
        ? t("peek.empty")
        : peek.truncated
          ? `${peek.text}\n…`
          : peek.text;
    card.append(text);
  } else if (peek.entries) {
    const entries = document.createElement("ul");
    entries.className = "file-peek-entries";
    entries.append(
      ...peek.entries.map((name) => {
        const item = document.createElement("li");
        item.textContent = name;
        return item;
      }),
    );
    if ((peek.entryCount ?? 0) > peek.entries.length) {
      const more = document.createElement("li");
      more.className = "file-peek-more";
      more.textContent = t("peek.more", {
        count: (peek.entryCount ?? 0) - peek.entries.length,
      });
      entries.append(more);
    }
    if (peek.entries.length === 0) {
      const empty = document.createElement("li");
      empty.className = "file-peek-more";
      empty.textContent = t("peek.emptyFolder");
      entries.append(empty);
    }
    card.append(entries);
  }
  card.append(fileDetails(document, translator, peek));
  const buttons = document.createElement("div");
  buttons.className = "file-peek-actions";
  if (actions.view)
    buttons.append(button(document, t("peek.view"), actions.view));
  if (actions.open)
    buttons.append(button(document, t("files.open"), actions.open));
  buttons.append(
    button(document, t("files.copyPath"), actions.copyPath),
    button(document, t("peek.insertPath"), actions.insertPath),
    button(document, t("files.reveal"), actions.reveal),
  );
  card.append(buttons);
  return {
    element: card,
    dispose() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    },
  };
}
