import type { Translator } from "../shared/i18n";

export interface PaletteEntry {
  readonly label: string;
  readonly section: string;
  readonly run: () => void;
}

export interface CommandPalette {
  toggle(): void;
  dispose(): void;
}

const MAX_RESULTS = 50;

// Characters of `query` in order within `text`, case-insensitive; higher
// scores favor consecutive runs and word starts. Undefined when it misses.
export function fuzzyScore(query: string, text: string): number | undefined {
  const needle = query.trim().toLowerCase();
  if (needle === "") return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  let position = -1;
  let previous = -2;
  for (const character of needle) {
    position = haystack.indexOf(character, position + 1);
    if (position < 0) return undefined;
    if (position === previous + 1) score += 3;
    if (position === 0 || /[\s:/._-]/u.test(haystack[position - 1]!))
      score += 2;
    score += 1;
    previous = position;
  }
  return score - haystack.length / 100;
}

// A searchable list of application actions and launches. Enter or a click
// runs the highlighted entry after the palette closes, so focus is back on
// the terminal before the action runs.
export function createCommandPalette(
  document: Document,
  options: {
    readonly translator: Translator;
    readonly entries: () => Promise<readonly PaletteEntry[]>;
  },
): CommandPalette {
  const t = options.translator.t.bind(options.translator);
  let dialog: HTMLDialogElement | undefined;
  let closeOpen: (() => void) | undefined;

  const open = async () => {
    const entries = await options.entries();
    if (dialog) return;
    const element = document.createElement("dialog");
    dialog = element;
    element.className = "omx-modal command-palette";
    element.setAttribute("aria-label", t("palette.label"));
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = t("palette.placeholder");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "command-palette-list");
    const list = document.createElement("ul");
    list.id = "command-palette-list";
    list.setAttribute("role", "listbox");
    const empty = document.createElement("p");
    empty.className = "sessions-empty";
    empty.textContent = t("palette.empty");
    element.append(input, list, empty);
    const previous = document.activeElement as HTMLElement | null;
    let shown: PaletteEntry[] = [];
    let active = 0;

    const close = (entry?: PaletteEntry) => {
      if (dialog !== element) return;
      dialog = undefined;
      if (element.open) element.close();
      element.remove();
      previous?.focus?.();
      entry?.run();
    };
    closeOpen = () => close();
    const highlight = (index: number) => {
      active = Math.max(0, Math.min(index, shown.length - 1));
      [...list.children].forEach((item, position) =>
        item.setAttribute("aria-selected", String(position === active)),
      );
      const current = list.children[active];
      if (current) {
        input.setAttribute("aria-activedescendant", current.id);
        current.scrollIntoView?.({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    };
    const render = () => {
      shown = entries
        .map((entry) => ({
          entry,
          score: fuzzyScore(input.value, `${entry.label} ${entry.section}`),
        }))
        .filter((match) => match.score !== undefined)
        .sort((a, b) => b.score! - a.score!)
        .slice(0, MAX_RESULTS)
        .map((match) => match.entry);
      list.replaceChildren(
        ...shown.map((entry, index) => {
          const item = document.createElement("li");
          item.id = `command-palette-${index}`;
          item.setAttribute("role", "option");
          const label = document.createElement("span");
          label.textContent = entry.label;
          const section = document.createElement("span");
          section.className = "command-palette-section";
          section.textContent = entry.section;
          item.append(label, section);
          item.addEventListener("mousedown", (event) => event.preventDefault());
          item.addEventListener("click", () => close(entry));
          return item;
        }),
      );
      empty.hidden = shown.length > 0;
      highlight(0);
    };
    input.addEventListener("input", render);
    element.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        highlight(active + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        close(shown[active]);
      }
      event.stopPropagation();
    });
    element.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    element.addEventListener("click", (event) => {
      if (event.target === element) close();
    });
    document.body.append(element);
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    render();
    input.focus();
  };

  return {
    toggle() {
      if (dialog) closeOpen?.();
      else void open().catch(() => {});
    },
    dispose() {
      dialog?.remove();
      dialog = undefined;
    },
  };
}
