import { BUILTIN_COMMANDS } from "../../shared/command-builtins";
import { BUILTIN_COMMANDS_PT_BR } from "../../shared/command-builtins/pt-BR";
import type {
  CommandDefinition,
  CommandLibraryDocument,
  CommandPlatform,
} from "../../shared/commands";
import type { SupportedLocale } from "../../shared/i18n";

export interface CatalogEntry {
  readonly command: CommandDefinition;
  readonly favorite: boolean;
  readonly hidden: boolean;
  // Required programs that were not found on PATH.
  readonly missing: readonly string[];
}

export interface CatalogQuery {
  readonly search: string;
  // "all", "favorites", "custom" or a category name.
  readonly filter: string;
  readonly showHidden: boolean;
}

// Built-in names, descriptions, categories and field labels in the user's
// language; custom commands are shown as their author wrote them.
export function localizeCommand(
  command: CommandDefinition,
  locale: SupportedLocale,
): CommandDefinition {
  if (!command.builtin || locale !== "pt-BR") return command;
  const overlay = BUILTIN_COMMANDS_PT_BR.commands[command.id];
  const category =
    BUILTIN_COMMANDS_PT_BR.categories[command.category] ?? command.category;
  if (!overlay) return { ...command, category };
  return {
    ...command,
    category,
    name: overlay.name,
    description: overlay.description,
    fields: command.fields.map((field) => ({
      ...field,
      label: overlay.fields?.[field.id] ?? field.label,
    })),
  };
}

export function commandsForPlatform(
  platform: string,
  library: CommandLibraryDocument,
): CommandDefinition[] {
  const supported = (command: CommandDefinition) =>
    !command.platforms ||
    command.platforms.includes(platform as CommandPlatform);
  return [...BUILTIN_COMMANDS.filter(supported), ...library.custom];
}

export function requiredTools(
  commands: readonly CommandDefinition[],
): string[] {
  return [...new Set(commands.flatMap((command) => command.requires ?? []))];
}

export function catalogEntries(
  commands: readonly CommandDefinition[],
  library: CommandLibraryDocument,
  availability: Readonly<Record<string, boolean>>,
  query: CatalogQuery,
  compare: (first: string, second: string) => number,
): CatalogEntry[] {
  const search = query.search.trim().toLowerCase();
  return commands
    .map((command) => ({
      command,
      favorite: library.favorites.includes(command.id),
      hidden: library.hidden.includes(command.id),
      missing: (command.requires ?? []).filter(
        (tool) => availability[tool] === false,
      ),
    }))
    .filter((entry) => query.showHidden || !entry.hidden)
    .filter((entry) => {
      if (query.filter === "favorites") return entry.favorite;
      if (query.filter === "custom") return !entry.command.builtin;
      return query.filter === "all" || entry.command.category === query.filter;
    })
    .filter(
      (entry) =>
        search === "" ||
        `${entry.command.name}\n${entry.command.description}\n${entry.command.template}`
          .toLowerCase()
          .includes(search),
    )
    .sort(
      (a, b) =>
        compare(a.command.category, b.command.category) ||
        compare(a.command.name, b.command.name),
    );
}

export function categories(
  commands: readonly CommandDefinition[],
  compare: (first: string, second: string) => number,
): string[] {
  return [...new Set(commands.map((command) => command.category))].sort(
    compare,
  );
}
