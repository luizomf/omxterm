import type { CommandDefinition, CommandField } from "../commands";

// Built-in Command Manager templates. The first eight follow AshyTerm's
// built-ins (find, ls, compress, extract, systemctl, journalctl, pacman, ping);
// the rest add equivalents and common tasks for each platform. Every command
// names the platforms it runs on and the programs it needs, so unsupported
// commands are hidden and missing tools are explained instead of failing.
export const POSIX = ["linux", "darwin"] as const;
export const LINUX = ["linux"] as const;
export const MAC = ["darwin"] as const;
export const WINDOWS = ["win32"] as const;
export const ALL = ["linux", "darwin", "win32"] as const;

export const text = (
  id: string,
  label: string,
  extra: Partial<CommandField> = {},
): CommandField => ({
  id,
  label,
  type: "text",
  ...extra,
});
export const number = (
  id: string,
  label: string,
  extra: Partial<CommandField> = {},
): CommandField => ({
  id,
  label,
  type: "number",
  min: 1,
  ...extra,
});
export const toggle = (
  id: string,
  label: string,
  flag: string,
  extra: Partial<CommandField> = {},
): CommandField => ({
  id,
  label,
  type: "switch",
  flag,
  defaultValue: false,
  ...extra,
});
export const choice = (
  id: string,
  label: string,
  options: readonly (readonly [string, string])[],
  defaultValue = options[0]?.[0] ?? "",
): CommandField => ({ id, label, type: "dropdown", options, defaultValue });

export const command = (
  definition: Omit<CommandDefinition, "builtin" | "execution" | "fields"> &
    Partial<Pick<CommandDefinition, "execution" | "fields">>,
): CommandDefinition => ({
  execution:
    definition.fields && definition.fields.length > 0 ? "dialog" : "execute",
  fields: [],
  builtin: true,
  ...definition,
});

export const SYSTEMCTL_ACTIONS = [
  ["status", "Status"],
  ["start", "Start"],
  ["stop", "Stop"],
  ["restart", "Restart"],
  ["enable", "Enable"],
  ["disable", "Disable"],
  ["is-active", "Is active?"],
  ["is-enabled", "Is enabled?"],
  ["list-units --type=service", "List services"],
  ["list-units --type=service --state=running", "List running services"],
  ["list-units --type=service --state=failed", "List failed services"],
] as const;

export const PACMAN_ACTIONS = [
  ["-S", "Install"],
  ["-R", "Remove"],
  ["-Rs", "Remove with unneeded dependencies"],
  ["-Rns", "Remove with dependencies and configuration"],
  ["-Ss", "Search repositories"],
  ["-Si", "Show repository package information"],
  ["-Qi", "Show installed package information"],
  ["-Ql", "List package files"],
  ["-Syu", "Update the system"],
  ["-Syyu", "Force refresh and update"],
  ["-Sc", "Clean old packages from the cache"],
  ["-Scc", "Clean the whole cache"],
  ["-Q", "List installed packages"],
  ["-Qe", "List explicitly installed packages"],
  ["-Qdt", "List orphan packages"],
] as const;
