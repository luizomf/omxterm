import type { CommandDefinition } from "../commands";
import {
  LINUX,
  WINDOWS,
  text,
  choice,
  command,
  PACMAN_ACTIONS,
} from "./helpers";

export const PACKAGES_COMMANDS: readonly CommandDefinition[] = [
  // Packages
  command({
    id: "builtin_pacman",
    name: "Pacman",
    description: "Install, remove, search and update Arch Linux packages.",
    category: "Packages",
    platforms: LINUX,
    requires: ["pacman"],
    template: "sudo pacman {action} {package}",
    fields: [
      choice("action", "Action", PACMAN_ACTIONS, "-S"),
      text("package", "Package", {
        placeholder: "firefox (optional for updates)",
      }),
    ],
  }),
  command({
    id: "apt",
    name: "APT",
    description:
      "Install, remove, search and update Debian or Ubuntu packages.",
    category: "Packages",
    platforms: LINUX,
    requires: ["apt"],
    template: "sudo apt {action} {package}",
    fields: [
      choice("action", "Action", [
        ["install", "Install"],
        ["remove", "Remove"],
        ["purge", "Remove with configuration"],
        ["update", "Refresh package lists"],
        ["upgrade", "Upgrade installed packages"],
        ["search", "Search"],
        ["show", "Show information"],
        ["autoremove", "Remove unneeded packages"],
      ]),
      text("package", "Package", {
        placeholder: "optional for update and upgrade",
      }),
    ],
  }),
  command({
    id: "dnf",
    name: "DNF",
    description: "Install, remove, search and update Fedora packages.",
    category: "Packages",
    platforms: LINUX,
    requires: ["dnf"],
    template: "sudo dnf {action} {package}",
    fields: [
      choice("action", "Action", [
        ["install", "Install"],
        ["remove", "Remove"],
        ["upgrade", "Upgrade"],
        ["search", "Search"],
        ["info", "Show information"],
        ["autoremove", "Remove unneeded packages"],
      ]),
      text("package", "Package", { placeholder: "optional for upgrade" }),
    ],
  }),
  command({
    id: "brew",
    name: "Homebrew",
    description: "Install, remove, search and update Homebrew packages.",
    category: "Packages",
    platforms: ["darwin", "linux"],
    requires: ["brew"],
    template: "brew {action} {package}",
    fields: [
      choice("action", "Action", [
        ["install", "Install"],
        ["uninstall", "Remove"],
        ["upgrade", "Upgrade"],
        ["update", "Refresh Homebrew"],
        ["search", "Search"],
        ["info", "Show information"],
        ["list", "List installed"],
      ]),
      text("package", "Package", {
        placeholder: "optional for update, upgrade and list",
      }),
    ],
  }),
  command({
    id: "winget",
    name: "winget",
    description: "Install, remove, search and upgrade Windows applications.",
    category: "Packages",
    platforms: WINDOWS,
    requires: ["winget"],
    template: "winget {action} {package}",
    fields: [
      choice("action", "Action", [
        ["install", "Install"],
        ["uninstall", "Remove"],
        ["upgrade", "Upgrade"],
        ["upgrade --all", "Upgrade everything"],
        ["search", "Search"],
        ["show", "Show information"],
        ["list", "List installed"],
      ]),
      text("package", "Package", {
        placeholder: "optional for list and upgrade --all",
      }),
    ],
  }),
];
