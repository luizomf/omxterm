import type { CommandDefinition } from "../commands";
import { POSIX, WINDOWS, text, choice, command } from "./helpers";

export const ARCHIVES_COMMANDS: readonly CommandDefinition[] = [
  // Archives
  command({
    id: "builtin_compress",
    name: "Compress",
    description: "Create an archive from files and folders.",
    category: "Archives",
    platforms: POSIX,
    requires: ["tar"],
    template: "{format} {output} {input}",
    fields: [
      choice("format", "Format", [
        ["tar -cJvf", "tar.xz"],
        ["tar -czvf", "tar.gz"],
        ["tar -cjvf", "tar.bz2"],
        ["tar --zstd -cvf", "tar.zst"],
        ["tar -cvf", "tar (no compression)"],
        ["zip -r", "zip"],
      ]),
      {
        id: "input",
        label: "Files and folders",
        type: "text_area",
        required: true,
        perLine: true,
        hint: "One path per line.",
      },
      text("output", "Archive name", {
        defaultValue: "archive.tar.xz",
        required: true,
      }),
    ],
  }),
  command({
    id: "builtin_extract",
    name: "Extract",
    description: "Extract a tar archive (gz, bz2, xz and zst are detected).",
    category: "Archives",
    platforms: POSIX,
    requires: ["tar"],
    template: "tar -xvf {input} {output}",
    fields: [
      {
        id: "input",
        label: "Archive",
        type: "file_path",
        required: true,
        placeholder: "archive.tar.xz",
      },
      {
        id: "output",
        label: "Destination folder",
        type: "directory_path",
        prefix: "-C ",
        hint: "Leave empty for the current folder.",
      },
    ],
  }),
  command({
    id: "extract_zip",
    name: "Extract ZIP",
    description: "Extract a ZIP archive.",
    category: "Archives",
    platforms: POSIX,
    requires: ["unzip"],
    template: "unzip {input} {output}",
    fields: [
      {
        id: "input",
        label: "Archive",
        type: "file_path",
        required: true,
        placeholder: "archive.zip",
      },
      {
        id: "output",
        label: "Destination folder",
        type: "directory_path",
        prefix: "-d ",
      },
    ],
  }),
  command({
    id: "win_compress",
    name: "Compress",
    description: "Create a ZIP archive from files and folders.",
    category: "Archives",
    platforms: WINDOWS,
    template: "Compress-Archive -Path {input} -DestinationPath {output}",
    fields: [
      { id: "input", label: "File or folder", type: "text", required: true },
      text("output", "Archive name", {
        defaultValue: "archive.zip",
        required: true,
      }),
    ],
  }),
  command({
    id: "win_extract",
    name: "Extract ZIP",
    description: "Extract a ZIP archive.",
    category: "Archives",
    platforms: WINDOWS,
    template: "Expand-Archive -Path {input} {output}",
    fields: [
      { id: "input", label: "Archive", type: "file_path", required: true },
      {
        id: "output",
        label: "Destination folder",
        type: "directory_path",
        prefix: "-DestinationPath ",
      },
    ],
  }),
];
