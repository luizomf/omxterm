import { isFilePath } from "./file-browser";

export const filePeekIpc = { peek: "file-peek:peek" } as const;

export type FilePeekKind =
  "image" | "pdf" | "text" | "directory" | "media" | "document" | "other";

export const FILE_PEEK_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "image/x-icon",
  "image/avif",
] as const;
export type FilePeekImageType = (typeof FILE_PEEK_IMAGE_TYPES)[number];

export const MAX_FILE_PEEK_THUMBNAIL_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_PEEK_TEXT_LENGTH = 16 * 1024;
export const MAX_FILE_PEEK_ENTRIES = 40;

// What hovering a file name in the terminal shows: facts about the file and,
// when one can be made, a picture or the first lines of its content.
export interface FilePeek {
  readonly name: string;
  readonly path: string;
  readonly kind: FilePeekKind;
  readonly size: number;
  readonly modified: number;
  readonly mime?: string;
  readonly executable?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly pages?: number;
  readonly title?: string;
  readonly thumbnail?: {
    readonly mime: FilePeekImageType;
    readonly data: Uint8Array;
  };
  readonly text?: string;
  readonly truncated?: boolean;
  readonly entries?: readonly string[];
  readonly entryCount?: number;
}

const KINDS: readonly FilePeekKind[] = [
  "image",
  "pdf",
  "text",
  "directory",
  "media",
  "document",
  "other",
];

const isShort = (value: unknown, limit = 512) =>
  typeof value === "string" && value.length <= limit;
const isCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);

export function isFilePeek(value: unknown): value is FilePeek {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const peek = value as Record<string, unknown>;
  const thumbnail = peek.thumbnail as Record<string, unknown> | undefined;
  return (
    isShort(peek.name, 4096) &&
    isFilePath(peek.path) &&
    KINDS.includes(peek.kind as FilePeekKind) &&
    isCount(peek.size) &&
    isCount(peek.modified) &&
    optional(peek.mime, (item) => isShort(item, 128)) &&
    optional(peek.executable, (item) => typeof item === "boolean") &&
    optional(peek.width, isCount) &&
    optional(peek.height, isCount) &&
    optional(peek.pages, isCount) &&
    optional(peek.title, (item) => isShort(item)) &&
    optional(
      thumbnail,
      () =>
        typeof thumbnail === "object" &&
        thumbnail !== null &&
        FILE_PEEK_IMAGE_TYPES.includes(thumbnail.mime as FilePeekImageType) &&
        thumbnail.data instanceof Uint8Array &&
        thumbnail.data.byteLength > 0 &&
        thumbnail.data.byteLength <= MAX_FILE_PEEK_THUMBNAIL_BYTES,
    ) &&
    optional(peek.text, (item) => isShort(item, MAX_FILE_PEEK_TEXT_LENGTH)) &&
    optional(peek.truncated, (item) => typeof item === "boolean") &&
    optional(
      peek.entries,
      (item) =>
        Array.isArray(item) &&
        item.length <= MAX_FILE_PEEK_ENTRIES &&
        item.every((entry) => isShort(entry, 1024)),
    ) &&
    optional(peek.entryCount, isCount)
  );
}
