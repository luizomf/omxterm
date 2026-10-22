import type { CommandDefinition } from "../commands";
import { POSIX, WINDOWS, text, toggle, choice, command } from "./helpers";

export const FILES_COMMANDS: readonly CommandDefinition[] = [
  // Files
  command({
    id: "builtin_find",
    name: "Find Files",
    description: "Search for files by name, type, size, age or content.",
    category: "Files",
    platforms: POSIX,
    requires: ["find"],
    template: "find {path} {depth} {name} {type} {size} {modified} {content}",
    fields: [
      {
        id: "path",
        label: "Directory to search",
        type: "directory_path",
        defaultValue: ".",
        required: true,
      },
      toggle("depth", "Search subfolders", "", {
        offValue: "-maxdepth 1",
        defaultValue: true,
      }),
      text("name", "Name pattern", { placeholder: "*.txt", prefix: "-name " }),
      choice("type", "Type", [
        ["", "Any"],
        ["-type f", "Files only"],
        ["-type d", "Folders only"],
        ["-type l", "Symbolic links"],
      ]),
      text("size", "Size", { placeholder: "+100M or -1k", prefix: "-size " }),
      choice("modified", "Modified", [
        ["", "Any time"],
        ["-mmin -60", "In the last hour"],
        ["-mtime -1", "In the last day"],
        ["-mtime -7", "In the last week"],
        ["-mtime -30", "In the last month"],
      ]),
      text("content", "Containing text", {
        prefix: "-exec grep -l ",
        suffix: " {} \\;",
      }),
    ],
  }),
  command({
    id: "builtin_ls",
    name: "List Files",
    description: "List all files in the current folder with details.",
    category: "Files",
    platforms: POSIX,
    requires: ["ls"],
    template: "ls -lah",
  }),
  command({
    id: "win_list_files",
    name: "List Files",
    description:
      "List all files, including hidden ones, in the current folder.",
    category: "Files",
    platforms: WINDOWS,
    template: "Get-ChildItem -Force",
  }),
  command({
    id: "disk_usage",
    name: "Folder Size",
    description: "Show the total size of a folder.",
    category: "Files",
    platforms: POSIX,
    requires: ["du"],
    template: "du -sh {path}",
    fields: [
      {
        id: "path",
        label: "Folder",
        type: "directory_path",
        defaultValue: ".",
      },
    ],
  }),
  command({
    id: "win_folder_size",
    name: "Folder Size",
    description: "Show the total size of a folder in megabytes.",
    category: "Files",
    platforms: WINDOWS,
    template:
      "(Get-ChildItem {path} -Recurse -File -Force | Measure-Object -Sum Length).Sum / 1MB",
    fields: [
      {
        id: "path",
        label: "Folder",
        type: "directory_path",
        defaultValue: ".",
      },
    ],
  }),
];
