export const UNSUPPORTED_LOCAL_IMAGE_FORMAT =
  "Unsupported image format. Choose a static PNG or JPEG; WebP is not supported.";

export const MAX_LOCAL_IMAGE_BYTES = 64 * 1024 * 1024;
export const MAX_LOCAL_IMAGE_SIDE = 8192;
export const MAX_LOCAL_IMAGE_PIXELS = 32_000_000;
export const MAX_LOCAL_IMAGE_SOURCE_LENGTH = 32_768;

export type LocalImageMime = "image/png" | "image/jpeg";

export interface LocalImageData {
  readonly name: string;
  readonly mime: LocalImageMime;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  // Facts about the file the preview shows, for its details and actions.
  readonly path?: string;
  readonly size?: number;
  readonly modified?: number;
}

export type LocalImageActivation =
  | { readonly source: "file-url"; readonly url: string }
  | { readonly source: "native-path"; readonly path: string }
  | { readonly source: "path-reference"; readonly path: string };

export type LocalImageRequest =
  { readonly source: "picker" } | LocalImageActivation;

export function isLocalImageRequest(
  value: unknown,
): value is LocalImageRequest {
  if (!isRecord(value)) return false;
  if (value.source === "picker") return Object.keys(value).length === 1;
  if (Object.keys(value).length !== 2) return false;
  if (value.source === "file-url")
    return (
      typeof value.url === "string" &&
      value.url.length > 0 &&
      value.url.length <= MAX_LOCAL_IMAGE_SOURCE_LENGTH
    );
  return (
    (value.source === "native-path" || value.source === "path-reference") &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    value.path.length <= MAX_LOCAL_IMAGE_SOURCE_LENGTH
  );
}

export function isLocalImageData(value: unknown): value is LocalImageData {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      [
        "name",
        "mime",
        "width",
        "height",
        "data",
        "path",
        "size",
        "modified",
      ].includes(key),
    )
  )
    return false;
  const { name, mime, width, height, data } = value;
  return (
    hasFileFacts(value) &&
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_LOCAL_IMAGE_SOURCE_LENGTH &&
    (mime === "image/png" || mime === "image/jpeg") &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    Number(width) > 0 &&
    Number(height) > 0 &&
    Number(width) <= MAX_LOCAL_IMAGE_SIDE &&
    Number(height) <= MAX_LOCAL_IMAGE_SIDE &&
    Number(width) * Number(height) <= MAX_LOCAL_IMAGE_PIXELS &&
    data instanceof Uint8Array &&
    data.byteLength > 0 &&
    data.byteLength <= MAX_LOCAL_IMAGE_BYTES
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The optional path, size and modification time of the previewed file.
function hasFileFacts(value: Record<string, unknown>): boolean {
  const { path, size, modified } = value;
  const isCount = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0;
  return (
    (path === undefined ||
      (typeof path === "string" &&
        path.length > 0 &&
        path.length <= MAX_LOCAL_IMAGE_SOURCE_LENGTH &&
        !path.includes("\0"))) &&
    (size === undefined || isCount(size)) &&
    (modified === undefined || isCount(modified))
  );
}
