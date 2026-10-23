import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_FILE_PEEK_ENTRIES,
  MAX_FILE_PEEK_THUMBNAIL_BYTES,
  type FilePeek,
  type FilePeekImageType,
  type FilePeekKind,
} from "../shared/file-peek";
import { findExecutable } from "./executable-lookup";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const TEXT_SAMPLE_BYTES = 32 * 1024;
const TEXT_LINES = 40;
const TEXT_LINE_LENGTH = 240;
const THUMBNAIL_SIDE = 360;
const TOOL_TIMEOUT_MS = 4_000;

const IMAGE_TYPES: Readonly<Record<string, FilePeekImageType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
};
const MEDIA = new Set(
  "mp4 mkv webm mov avi m4v mpg mpeg wmv flv mp3 flac ogg oga opus wav m4a aac".split(
    " ",
  ),
);
const DOCUMENTS = new Set(
  "odt ods odp odg doc docx xls xlsx ppt pptx rtf epub cbz cbr djvu".split(" "),
);
const TEXT = new Set(
  (
    "txt md markdown rst json jsonc yaml yml toml ini conf cfg log csv tsv xml " +
    "html htm css scss less js mjs cjs ts tsx jsx py rb go rs c h cc cpp hpp " +
    "java kt kts sh bash zsh fish ps1 bat sql lua php pl r swift dart vue " +
    "svelte env properties gradle cmake mk diff patch srt vtt tex desktop service"
  ).split(" "),
);
const OTHER_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  json: "application/json",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
  odt: "application/vnd.oasis.opendocument.text",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface FilePeekDependencies {
  readonly platform: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  // PNG or JPEG bytes: the decoded size and a PNG scaled to fit `side`.
  readonly decodeImage: (
    bytes: Uint8Array,
    side: number,
  ) =>
    | {
        readonly width: number;
        readonly height: number;
        readonly png: Uint8Array;
      }
    | undefined;
  // macOS and Windows render thumbnails of any file type themselves.
  readonly systemThumbnail?: (
    filePath: string,
    side: number,
  ) => Promise<Uint8Array | undefined>;
}

const extensionOf = (name: string) =>
  name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

function kindOf(extension: string): FilePeekKind {
  if (extension in IMAGE_TYPES) return "image";
  if (extension === "pdf") return "pdf";
  if (MEDIA.has(extension)) return "media";
  if (DOCUMENTS.has(extension)) return "document";
  if (TEXT.has(extension)) return "text";
  return "other";
}

const run = (file: string, args: readonly string[]) =>
  new Promise<string | undefined>((resolve) => {
    execFile(
      file,
      args,
      { timeout: TOOL_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// The first lines of a text file, or undefined when it looks binary.
export function textPreview(
  sample: Uint8Array,
  complete: boolean,
): { readonly text: string; readonly truncated: boolean } | undefined {
  if (sample.includes(0)) return undefined;
  const decoded = new TextDecoder("utf-8").decode(sample);
  const replaced = decoded.match(/�/gu)?.length ?? 0;
  if (replaced > Math.max(4, decoded.length / 50)) return undefined;
  const lines = decoded.split(/\r?\n/u);
  if (!complete) lines.pop();
  const shown = lines
    .slice(0, TEXT_LINES)
    .map((line) =>
      line
        .replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
          character === "\t" ? "    " : "",
        )
        .slice(0, TEXT_LINE_LENGTH),
    );
  return {
    text: shown.join("\n"),
    truncated: !complete || lines.length > TEXT_LINES,
  };
}

// A thumbnail a file manager already made (freedesktop thumbnail spec),
// when it is not older than the file.
async function cachedThumbnail(
  filePath: string,
  modified: number,
  dependencies: FilePeekDependencies,
): Promise<Uint8Array | undefined> {
  const cache =
    dependencies.environment.XDG_CACHE_HOME ||
    path.join(dependencies.homeDirectory, ".cache");
  const hash = createHash("md5")
    .update(pathToFileURL(filePath).href)
    .digest("hex");
  for (const size of ["xx-large", "x-large", "large", "normal"]) {
    const candidate = path.join(cache, "thumbnails", size, `${hash}.png`);
    try {
      const info = await stat(candidate);
      if (
        info.mtimeMs + 1000 < modified ||
        info.size > MAX_FILE_PEEK_THUMBNAIL_BYTES
      )
        continue;
      return new Uint8Array(await readFile(candidate));
    } catch {
      // Not cached at this size.
    }
  }
  return undefined;
}

// The first PDF page through poppler's pdftoppm, when it is installed. The
// path is absolute, so it can never be read as an option.
async function pdfPage(
  filePath: string,
  dependencies: FilePeekDependencies,
): Promise<Uint8Array | undefined> {
  const pdftoppm = findExecutable(
    "pdftoppm",
    dependencies.environment,
    dependencies.platform,
  );
  if (!pdftoppm) return undefined;
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-peek-"));
  try {
    const output = path.join(directory, "page");
    const done = await run(pdftoppm, [
      "-png",
      "-f",
      "1",
      "-l",
      "1",
      "-scale-to",
      String(THUMBNAIL_SIDE),
      "-singlefile",
      filePath,
      output,
    ]);
    if (done === undefined) return undefined;
    const bytes = await readFile(`${output}.png`);
    return bytes.byteLength <= MAX_FILE_PEEK_THUMBNAIL_BYTES
      ? new Uint8Array(bytes)
      : undefined;
  } catch {
    return undefined;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function pdfFacts(
  filePath: string,
  dependencies: FilePeekDependencies,
): Promise<{ pages?: number; title?: string }> {
  const pdfinfo = findExecutable(
    "pdfinfo",
    dependencies.environment,
    dependencies.platform,
  );
  const info = pdfinfo ? await run(pdfinfo, [filePath]) : undefined;
  if (!info) return {};
  const pages = Number(/^Pages:[ \t]+(\d+)/mu.exec(info)?.[1]);
  const title = /^Title:[ \t]+(\S.*)$/mu.exec(info)?.[1]?.trim().slice(0, 200);
  return {
    ...(Number.isInteger(pages) && pages > 0 ? { pages } : {}),
    ...(title ? { title } : {}),
  };
}

async function imagePeek(
  filePath: string,
  size: number,
  mime: FilePeekImageType,
  dependencies: FilePeekDependencies,
): Promise<Partial<FilePeek>> {
  if (size > MAX_IMAGE_BYTES) return {};
  const bytes = new Uint8Array(await readFile(filePath));
  if (mime === "image/png" || mime === "image/jpeg") {
    const decoded = dependencies.decodeImage(bytes, THUMBNAIL_SIDE);
    if (decoded)
      return {
        width: decoded.width,
        height: decoded.height,
        thumbnail: { mime: "image/png", data: decoded.png },
      };
  }
  // Other formats are decoded by the window's image element.
  return bytes.byteLength <= MAX_FILE_PEEK_THUMBNAIL_BYTES
    ? { thumbnail: { mime, data: bytes } }
    : {};
}

async function directoryPeek(
  directory: string,
): Promise<Pick<FilePeek, "entries" | "entryCount">> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );
  return {
    entries: names.slice(0, MAX_FILE_PEEK_ENTRIES),
    entryCount: names.length,
  };
}

async function thumbnailFor(
  filePath: string,
  modified: number,
  kind: FilePeekKind,
  dependencies: FilePeekDependencies,
): Promise<Uint8Array | undefined> {
  if (dependencies.systemThumbnail)
    return dependencies.systemThumbnail(filePath, THUMBNAIL_SIDE);
  return (
    (await cachedThumbnail(filePath, modified, dependencies)) ??
    (kind === "pdf" ? await pdfPage(filePath, dependencies) : undefined)
  );
}

// A preview of one local file or folder; undefined when it does not exist.
// Only absolute paths are accepted; nothing here runs or writes the file.
export async function peekFile(
  filePath: string,
  dependencies: FilePeekDependencies,
): Promise<FilePeek | undefined> {
  const pathApi = dependencies.platform === "win32" ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(filePath) || filePath.includes("\0"))
    return undefined;
  const info = await stat(filePath).catch(() => undefined);
  if (!info) return undefined;
  const name = pathApi.basename(filePath) || filePath;
  const base = {
    name,
    path: filePath,
    size: info.size,
    modified: Math.round(info.mtimeMs),
  };
  if (info.isDirectory())
    return {
      ...base,
      kind: "directory",
      ...(await directoryPeek(filePath).catch(() => ({}))),
    };
  if (!info.isFile()) return undefined;
  const extension = extensionOf(name);
  let kind = kindOf(extension);
  const mime = IMAGE_TYPES[extension] ?? OTHER_TYPES[extension];
  const executable =
    dependencies.platform !== "win32" && (info.mode & 0o111) !== 0;
  const facts: Partial<FilePeek> = {
    ...(mime ? { mime } : {}),
    ...(executable ? { executable } : {}),
  };
  if (kind === "image") {
    const image = await imagePeek(
      filePath,
      info.size,
      IMAGE_TYPES[extension]!,
      dependencies,
    ).catch(() => ({}));
    return { ...base, ...facts, kind, ...image };
  }
  if (kind === "text" || kind === "other") {
    const sample = await readHead(filePath, TEXT_SAMPLE_BYTES).catch(
      () => undefined,
    );
    const text = sample
      ? textPreview(sample, info.size <= TEXT_SAMPLE_BYTES)
      : undefined;
    if (text && info.size > 0)
      return { ...base, ...facts, kind: "text", ...text };
    if (kind === "text") kind = "other";
  }
  const thumbnail = await thumbnailFor(
    filePath,
    base.modified,
    kind,
    dependencies,
  ).catch(() => undefined);
  return {
    ...base,
    ...facts,
    kind,
    ...(kind === "pdf" ? await pdfFacts(filePath, dependencies) : {}),
    ...(thumbnail ? { thumbnail: { mime: "image/png", data: thumbnail } } : {}),
  };
}
