export const MAX_INSERTED_PATHS = 256;
export const MAX_INSERTED_PATH_LENGTH = 32_768;
export const MAX_INSERTED_PATHS_LENGTH = 1_048_576;

export type FilePathPlatform = "darwin" | "linux" | "win32";

export function isFilePathPlatform(value: string): value is FilePathPlatform {
  return value === "darwin" || value === "linux" || value === "win32";
}

export interface NativeClipboardReader {
  availableFormats(): string[];
  readText(): string;
  readBuffer(format: string): Buffer;
}

export function formatFilePathInsertion(
  values: readonly unknown[],
  platform: FilePathPlatform,
): string {
  const paths = validateFilePaths(values, platform);
  if (!paths) return "";
  const quote = platform === "win32" ? quotePowerShellPath : quotePosixPath;
  const insertion = paths.map(quote).join(" ");
  return insertion.length <= MAX_INSERTED_PATHS_LENGTH ? insertion : "";
}

export function readClipboardPathInsertion(
  clipboard: NativeClipboardReader,
  platform: FilePathPlatform,
): string {
  try {
    const text = clipboard.readText();
    if (text.length > 0) return text;
    const formats = new Set(clipboard.availableFormats());
    const paths =
      platform === "darwin"
        ? readMacPaths(clipboard, formats)
        : platform === "linux"
          ? readLinuxPaths(clipboard, formats)
          : readWindowsPaths(clipboard, formats);
    return paths ? formatFilePathInsertion(paths, platform) : "";
  } catch {
    // Clipboard contents are untrusted and can change between format discovery
    // and reading. A malformed or stale file list has no paste side effect.
    return "";
  }
}

function validateFilePaths(
  values: readonly unknown[],
  platform: FilePathPlatform,
): string[] | undefined {
  if (values.length === 0 || values.length > MAX_INSERTED_PATHS) return;
  const paths: string[] = [];
  let aggregateLength = 0;
  for (const value of values) {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_INSERTED_PATH_LENGTH ||
      value.includes("\0") ||
      !(platform === "win32"
        ? isWindowsAbsolutePath(value)
        : value.startsWith("/"))
    )
      return;
    aggregateLength += value.length;
    if (aggregateLength > MAX_INSERTED_PATHS_LENGTH) return;
    paths.push(value);
  }
  return paths;
}

function isWindowsAbsolutePath(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/u.test(value)) return true;
  if (!value.startsWith("\\\\")) return false;
  const withoutPrefix = value.startsWith("\\\\?\\UNC\\")
    ? value.slice(8)
    : value.startsWith("\\\\?\\") || value.startsWith("\\\\.\\")
      ? value.slice(4)
      : value.slice(2);
  const parts = withoutPrefix.split(/[\\/]/u);
  return parts.length >= 2 && parts[0]!.length > 0 && parts[1]!.length > 0;
}

function quotePosixPath(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

function quotePowerShellPath(path: string): string {
  return `'${path.replace(/[\u0027\u2018-\u201b]/gu, "$&$&")}'`;
}

function readLinuxPaths(
  clipboard: NativeClipboardReader,
  formats: ReadonlySet<string>,
): string[] | undefined {
  if (formats.has("x-special/gnome-copied-files")) {
    const records = decodeUtf8(
      clipboard.readBuffer("x-special/gnome-copied-files"),
    ).split(/\r?\n/u);
    if (records.at(-1) === "") records.pop();
    if (
      (records[0] !== "copy" && records[0] !== "cut") ||
      records.length < 2 ||
      records.slice(1).some((record) => record.length === 0)
    )
      return;
    return records.slice(1).map(fileUrlToUnixPath);
  }
  if (!formats.has("text/uri-list")) return;
  const records = decodeUtf8(clipboard.readBuffer("text/uri-list"))
    .split(/\r?\n/u)
    .filter((record) => record.length > 0 && !record.startsWith("#"));
  return records.length > 0 ? records.map(fileUrlToUnixPath) : undefined;
}

function readMacPaths(
  clipboard: NativeClipboardReader,
  formats: ReadonlySet<string>,
): string[] | undefined {
  if (
    !formats.has("text/uri-list") &&
    !formats.has("NSFilenamesPboardType") &&
    !formats.has("public.file-url")
  )
    return;
  const filenamePlist = clipboard.readBuffer("NSFilenamesPboardType");
  if (filenamePlist.length > 0)
    return parseFilenamePlist(decodeUtf8(filenamePlist));
  const fileUrl = clipboard.readBuffer("public.file-url");
  return fileUrl.length > 0
    ? [fileUrlToUnixPath(decodeUtf8(fileUrl))]
    : undefined;
}

function readWindowsPaths(
  clipboard: NativeClipboardReader,
  formats: ReadonlySet<string>,
): string[] | undefined {
  if (!formats.has("FileNameW") && !formats.has("text/uri-list")) return;
  const bytes = clipboard.readBuffer("FileNameW");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_INSERTED_PATH_LENGTH * 2 + 2 ||
    bytes.length % 2 !== 0
  )
    return;
  const decoded = new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  if (!decoded.endsWith("\0")) return;
  const path = decoded.replace(/\0+$/u, "");
  return path.length > 0 && !path.includes("\0") ? [path] : undefined;
}

function decodeUtf8(bytes: Buffer): string {
  if (bytes.length > MAX_INSERTED_PATHS_LENGTH) throw new Error("too large");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function fileUrlToUnixPath(value: string): string {
  const match = /^file:\/\/(?:localhost)?(\/[^?#]*)$/u.exec(value);
  if (!match || /%(?:00|2f)/iu.test(match[1]!))
    throw new Error("invalid file URL");
  return decodeURIComponent(match[1]!);
}

function parseFilenamePlist(value: string): string[] {
  const array =
    /^(?:\uFEFF)?\s*(?:<\?xml[^?]*\?>\s*)?(?:<!DOCTYPE\s+plist\s+PUBLIC\s+"[^"]*"\s+"[^"]*">\s*)?<plist\s+version=["']1\.0["']\s*>\s*<array>([\s\S]*?)<\/array>\s*<\/plist>\s*$/u.exec(
      value,
    )?.[1];
  if (array === undefined) throw new Error("invalid filename plist");
  const paths: string[] = [];
  let offset = 0;
  const item = /\s*<string>([\s\S]*?)<\/string>/gu;
  for (const match of array.matchAll(item)) {
    if (match.index !== offset) throw new Error("invalid filename plist item");
    paths.push(decodeXmlText(match[1]!));
    offset = match.index + match[0].length;
  }
  if (array.slice(offset).trim().length > 0 || paths.length === 0)
    throw new Error("invalid filename plist contents");
  return paths;
}

function decodeXmlText(value: string): string {
  if (value.includes("<")) throw new Error("invalid XML text");
  if (value.replace(/&[^;]+;/gu, "").includes("&"))
    throw new Error("invalid XML entity");
  return value.replace(/&([^;]+);/gu, (entity) => {
    const named: Readonly<Record<string, string>> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    const known = named[entity];
    if (known !== undefined) return known;
    const numeric = /^&#(x[\da-f]+|\d+);$/iu.exec(entity)?.[1];
    if (!numeric) throw new Error("invalid XML entity");
    const hexadecimal = numeric[0]!.toLowerCase() === "x";
    const codePoint = Number.parseInt(
      hexadecimal ? numeric.slice(1) : numeric,
      hexadecimal ? 16 : 10,
    );
    if (!isXml10Character(codePoint)) throw new Error("invalid XML character");
    return String.fromCodePoint(codePoint);
  });
}

function isXml10Character(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}
