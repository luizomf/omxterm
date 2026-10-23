import {
  shellForPlatform,
  type CommandLibraryDocument,
} from "../../shared/commands";
import type { Translator } from "../../shared/i18n";
import type {
  CommandsBridge,
  SessionsBridge,
} from "../../shared/terminal-bridge";
import { showContextMenu, type ContextMenuItem } from "../ui/context-menu";
import { confirmAction } from "../ui/modal";
import {
  catalogEntries,
  categories,
  commandsForPlatform,
  localizeCommand,
  requiredTools,
  type CatalogEntry,
} from "./command-catalog";
import { editCommand } from "./command-editor";
import { openCommandForm, type CommandRun } from "./command-form";

// How a menu item runs a command, overriding the form's own buttons.
type CommandDirect = "insert" | "run" | "multiple";

export interface CommandsPanelOptions {
  readonly translator: Translator;
  readonly bridge: CommandsBridge;
  readonly chooseFile: SessionsBridge["chooseFile"];
  // Types the command into the focused pane; Run also presses Enter.
  readonly run: (command: CommandRun) => void;
  readonly notify: (message: string) => void;
}

export interface CommandsPanel {
  readonly element: HTMLElement;
  activate(): void;
  dispose(): void;
}

export function createCommandsPanel(
  document: Document,
  options: CommandsPanelOptions,
): CommandsPanel {
  const { translator } = options;
  const t = translator.t.bind(translator);
  let library: CommandLibraryDocument = {
    custom: [],
    favorites: [],
    hidden: [],
  };
  let platform = "linux";
  let availability: Record<string, boolean> = {};
  let filter = "all";
  let showHidden = false;
  let disposed = false;

  const element = document.createElement("section");
  element.className = "commands-panel";
  element.setAttribute("aria-label", t("sidebar.commands"));
  const toolbar = document.createElement("div");
  toolbar.className = "sessions-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = t("commands.search");
  search.setAttribute("aria-label", t("commands.search"));
  const add = iconButton(document, "+", t("commands.new"));
  const more = iconButton(document, "⋯", t("commands.showHidden"));
  toolbar.append(search, add, more);
  const filters = document.createElement("select");
  filters.className = "commands-filter";
  filters.setAttribute("aria-label", t("commands.field.category"));
  const list = document.createElement("div");
  list.className = "sessions-list commands-list";
  list.setAttribute("role", "list");
  const empty = document.createElement("p");
  empty.className = "sessions-empty";
  element.append(toolbar, filters, list, empty);

  const commands = () =>
    commandsForPlatform(platform, library).map((command) =>
      localizeCommand(command, translator.locale),
    );

  const renderFilters = () => {
    const values: Array<[string, string]> = [
      ["all", t("commands.all")],
      ["favorites", t("commands.favorites")],
      ["custom", t("commands.custom")],
      ...categories(commands(), translator.compare).map(
        (category): [string, string] => [category, category],
      ),
    ];
    filters.replaceChildren(
      ...values.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    filters.value = values.some(([value]) => value === filter) ? filter : "all";
  };

  // One form at a time: a second click while a form is open does nothing.
  let formOpen = false;
  const open = async (entry: CatalogEntry, direct?: CommandDirect) => {
    if (formOpen) return;
    formOpen = true;
    const result = await openCommandForm(
      document,
      {
        translator,
        shell: shellForPlatform(platform),
        missing: entry.missing,
        chooseFile: options.chooseFile,
      },
      entry.command,
    ).finally(() => {
      formOpen = false;
    });
    if (result)
      options.run(
        direct
          ? {
              text: result.text,
              submit: direct !== "insert",
              ...(direct === "multiple" ? { multiple: true } : {}),
            }
          : result,
      );
  };

  const menu = (entry: CatalogEntry, position: { x: number; y: number }) => {
    const { command } = entry;
    const failed = (cause: unknown) =>
      options.notify(
        t("sessions.operationFailed", {
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    const items: ContextMenuItem[] = [
      { label: t("commands.insert"), action: () => void open(entry, "insert") },
      { label: t("commands.run"), action: () => void open(entry, "run") },
      {
        label: t("commands.runMultiple"),
        action: () => void open(entry, "multiple"),
      },
      { separator: true },
      {
        label: entry.favorite
          ? t("commands.unfavorite")
          : t("commands.favorite"),
        action: () =>
          void options.bridge
            .setFavorite(command.id, !entry.favorite)
            .catch(failed),
      },
      {
        label: command.builtin ? t("common.duplicate") : `${t("common.edit")}…`,
        action: () =>
          void editCommand(
            document,
            { translator, save: options.bridge.save },
            command,
            command.builtin === true,
          ).catch(failed),
      },
      { separator: true },
      command.builtin
        ? {
            label: entry.hidden ? t("commands.restore") : t("commands.hide"),
            action: () =>
              void options.bridge
                .setHidden(command.id, !entry.hidden)
                .catch(failed),
          }
        : {
            label: t("common.delete"),
            danger: true,
            action: () =>
              void confirmAction(document, {
                title: t("common.delete"),
                message: t("commands.deleteConfirm", { name: command.name }),
                confirmLabel: t("common.delete"),
                cancelLabel: t("common.cancel"),
                danger: true,
              })
                .then((confirmed) =>
                  confirmed ? options.bridge.delete(command.id) : undefined,
                )
                .catch(failed),
          },
    ];
    showContextMenu(document, position, items);
  };

  const render = () => {
    if (disposed) return;
    const entries = catalogEntries(
      commands(),
      library,
      availability,
      { search: search.value, filter, showHidden },
      translator.compare,
    );
    list.replaceChildren(
      ...entries.map((entry) =>
        commandRow(document, t, entry, {
          open: (direct) => void open(entry, direct),
          menu: (position) => menu(entry, position),
        }),
      ),
    );
    empty.hidden = entries.length > 0;
    empty.textContent =
      search.value.trim() === "" ? t("commands.empty") : t("common.noResults");
  };

  const refresh = async () => {
    platform = await options.bridge.platform();
    library = await options.bridge.list();
    availability = await options.bridge.availability(
      requiredTools(commandsForPlatform(platform, library)),
    );
    renderFilters();
    render();
  };

  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    list.querySelector<HTMLElement>(".sessions-row")?.focus();
  });
  filters.addEventListener("change", () => {
    filter = filters.value;
    render();
  });
  add.addEventListener("click", () => {
    void editCommand(document, { translator, save: options.bridge.save }).catch(
      (cause: unknown) => options.notify(String(cause)),
    );
  });
  more.addEventListener("click", () => {
    showHidden = !showHidden;
    more.setAttribute("aria-pressed", String(showHidden));
    render();
  });
  const removeChanged = options.bridge.onChanged((document) => {
    library = document;
    renderFilters();
    render();
  });
  void refresh().catch((cause: unknown) => options.notify(String(cause)));

  return {
    element,
    activate() {
      void refresh().catch((cause: unknown) => options.notify(String(cause)));
      search.focus();
    },
    dispose() {
      disposed = true;
      removeChanged();
      element.remove();
    },
  };
}

// One command in the list: click or Enter opens its form; the context menu
// key, Shift+F10 or a right click opens its menu; arrows move between rows.
function commandRow(
  document: Document,
  t: Translator["t"],
  entry: CatalogEntry,
  actions: {
    readonly open: (direct?: CommandDirect) => void;
    readonly menu: (position: { x: number; y: number }) => void;
  },
): HTMLElement {
  const item = document.createElement("div");
  item.className = "sessions-row command";
  item.tabIndex = 0;
  item.setAttribute("role", "listitem");
  if (entry.missing.length > 0 || entry.hidden)
    item.classList.add("unavailable");
  const star = document.createElement("span");
  star.className = "commands-star";
  star.setAttribute("aria-hidden", "true");
  star.textContent = entry.favorite ? "★" : "";
  const text = document.createElement("span");
  text.className = "sessions-text";
  const name = document.createElement("span");
  name.className = "sessions-name";
  name.textContent = entry.command.name;
  const detail = document.createElement("span");
  detail.className = "sessions-subtitle";
  detail.textContent =
    entry.missing.length > 0
      ? t("commands.unavailable", { tools: entry.missing.join(", ") })
      : entry.command.description || entry.command.template;
  text.append(name, detail);
  item.append(star, text);
  item.title = entry.command.template;
  item.setAttribute(
    "aria-label",
    `${entry.command.name}. ${detail.textContent}`,
  );
  item.addEventListener("click", () => actions.open());
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      actions.open();
    } else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      const rectangle = item.getBoundingClientRect();
      actions.menu({ x: rectangle.left + 16, y: rectangle.bottom });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const sibling =
        event.key === "ArrowDown"
          ? item.nextElementSibling
          : item.previousElementSibling;
      (sibling as HTMLElement | null)?.focus();
    }
  });
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    actions.menu({ x: event.clientX, y: event.clientY });
  });
  return item;
}

function iconButton(
  document: Document,
  glyph: string,
  label: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "omx-icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}
