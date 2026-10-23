import type { FileEntry } from "../../shared/file-browser";
import type { Translator } from "../../shared/i18n";
import type { MenuPosition } from "../tab-strip";
import { icon } from "../ui/icons";

export interface FilesListHandlers {
  activate(entry: FileEntry): void;
  goUp(): void;
  trash(entries: readonly FileEntry[]): void;
  rename(entry: FileEntry): void;
  clipboard(action: "copy" | "cut" | "paste"): void;
  menu(entries: readonly FileEntry[], position: MenuPosition): void;
  // A printable key typed on the list starts filtering.
  typeAhead(text: string): void;
}

export interface FilesList {
  readonly element: HTMLElement;
  render(entries: readonly FileEntry[]): void;
  selected(): FileEntry[];
  focus(): void;
}

export function isDirectoryLike(entry: FileEntry): boolean {
  return (
    entry.kind === "directory" ||
    (entry.kind === "symlink" && entry.targetKind === "directory")
  );
}

// Folders first, then names in the user's collation.
export function sortEntries(
  entries: readonly FileEntry[],
  compare: (first: string, second: string) => number,
): FileEntry[] {
  return [...entries].sort(
    (first, second) =>
      Number(isDirectoryLike(second)) - Number(isDirectoryLike(first)) ||
      compare(first.name, second.name),
  );
}

export function formatSize(bytes: number, translator: Translator): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${translator.formatNumber(value, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

// A listbox of entries with multiple selection: click, Ctrl/Cmd+click and
// Shift+click select; arrows move; Enter opens; Backspace goes up; Delete
// trashes; F2 renames; Ctrl/Cmd+C, X and V copy, cut and paste.
export function createFilesList(
  document: Document,
  translator: Translator,
  handlers: FilesListHandlers,
): FilesList {
  const t = translator.t.bind(translator);
  const element = document.createElement("div");
  element.className = "files-list";
  element.setAttribute("role", "listbox");
  element.setAttribute("aria-multiselectable", "true");
  element.setAttribute("aria-label", t("files.items"));
  element.tabIndex = 0;
  let entries: FileEntry[] = [];
  let rows: HTMLElement[] = [];
  const selected = new Set<number>();
  let cursor = 0;
  let anchor = 0;

  const paint = () => {
    rows.forEach((row, index) => {
      row.setAttribute("aria-selected", String(selected.has(index)));
      row.classList.toggle("cursor", index === cursor);
    });
    const current = rows[cursor];
    if (current) {
      element.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView?.({ block: "nearest" });
    } else element.removeAttribute("aria-activedescendant");
  };
  const move = (index: number, extend: boolean, toggle = false) => {
    if (rows.length === 0) return;
    cursor = Math.max(0, Math.min(rows.length - 1, index));
    if (toggle) {
      if (selected.has(cursor)) selected.delete(cursor);
      else selected.add(cursor);
      anchor = cursor;
    } else if (extend) {
      selected.clear();
      const [from, to] = [Math.min(anchor, cursor), Math.max(anchor, cursor)];
      for (let item = from; item <= to; item += 1) selected.add(item);
    } else {
      selected.clear();
      selected.add(cursor);
      anchor = cursor;
    }
    paint();
  };
  const chosen = () =>
    [...selected].sort((a, b) => a - b).map((index) => entries[index]!);

  const row = (entry: FileEntry, index: number) => {
    const item = document.createElement("div");
    item.className = "files-row";
    item.id = `files-row-${index}`;
    item.setAttribute("role", "option");
    const directory = isDirectoryLike(entry);
    const glyph = icon(
      document,
      directory ? "files" : entry.kind === "symlink" ? "link" : "file",
    );
    const name = document.createElement("span");
    name.className = "files-name";
    name.textContent = entry.name;
    name.title = entry.name;
    const size = document.createElement("span");
    size.className = "files-size";
    size.textContent = directory ? "" : formatSize(entry.size, translator);
    const modified = document.createElement("span");
    modified.className = "files-modified";
    modified.textContent = translator.formatDate(entry.modified, {
      dateStyle: "short",
      timeStyle: "short",
    });
    item.append(glyph, name, size, modified);
    if (directory) item.classList.add("directory");
    if (entry.name.startsWith(".")) item.classList.add("hidden-file");
    item.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      move(index, event.shiftKey, event.ctrlKey || event.metaKey);
    });
    item.addEventListener("dblclick", () => handlers.activate(entry));
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!selected.has(index)) move(index, false);
      element.focus();
      handlers.menu(chosen(), { x: event.clientX, y: event.clientY });
    });
    return item;
  };

  const openMenu = () => {
    const box = rows[cursor]?.getBoundingClientRect();
    handlers.menu(chosen(), { x: box?.left ?? 0, y: box?.bottom ?? 0 });
  };
  const selectAll = () => {
    rows.forEach((_row, index) => selected.add(index));
    paint();
  };
  // Plain keys; Shift extends the selection for the movement keys.
  const keys: Readonly<Record<string, (extend: boolean) => void>> = {
    ArrowDown: (extend) => move(cursor + 1, extend),
    ArrowUp: (extend) => move(cursor - 1, extend),
    Home: (extend) => move(0, extend),
    End: (extend) => move(rows.length - 1, extend),
    Enter: () => {
      const current = entries[cursor];
      if (current) handlers.activate(current);
    },
    Backspace: () => handlers.goUp(),
    Delete: () => selected.size > 0 && handlers.trash(chosen()),
    F2: () => {
      const current = entries[cursor];
      if (current) handlers.rename(current);
    },
    ContextMenu: openMenu,
  };
  const commandKeys: Readonly<Record<string, () => void>> = {
    a: selectAll,
    c: () => handlers.clipboard("copy"),
    x: () => handlers.clipboard("cut"),
    v: () => handlers.clipboard("paste"),
  };

  element.addEventListener("keydown", (event) => {
    const command = event.ctrlKey || event.metaKey;
    const run = command
      ? commandKeys[event.key.toLowerCase()]
      : event.shiftKey && event.key === "F10"
        ? openMenu
        : keys[event.key];
    if (run) run(event.shiftKey);
    else if (event.key.length === 1 && !command && !event.altKey)
      handlers.typeAhead(event.key);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });

  return {
    element,
    render(next) {
      const previous = new Set(chosen().map((entry) => entry.name));
      entries = [...next];
      rows = entries.map(row);
      selected.clear();
      entries.forEach((entry, index) => {
        if (previous.has(entry.name)) selected.add(index);
      });
      cursor = Math.min(cursor, Math.max(0, rows.length - 1));
      element.replaceChildren(...rows);
      if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "files-empty";
        empty.textContent = t("files.empty");
        element.append(empty);
      }
      paint();
    },
    selected: chosen,
    focus: () => element.focus(),
  };
}
