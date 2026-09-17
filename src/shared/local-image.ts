export const MAX_LOCAL_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_LOCAL_IMAGE_SIDE = 8192;
export const MAX_LOCAL_IMAGE_PIXELS = 16_000_000;
export const MAX_LOCAL_IMAGE_URL_LENGTH = 32_768;

export type LocalImageMime = "image/png" | "image/jpeg";

export interface LocalImageData {
  readonly name: string;
  readonly mime: LocalImageMime;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export type LocalImageRequest =
  | { readonly source: "picker" }
  | { readonly source: "file-url"; readonly url: string };

export function isLocalImageRequest(
  value: unknown,
): value is LocalImageRequest {
  if (!isRecord(value)) return false;
  if (value.source === "picker") return Object.keys(value).length === 1;
  return (
    value.source === "file-url" &&
    Object.keys(value).length === 2 &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    value.url.length <= MAX_LOCAL_IMAGE_URL_LENGTH
  );
}

export function isLocalImageData(value: unknown): value is LocalImageData {
  if (!isRecord(value) || Object.keys(value).length !== 5) return false;
  const { name, mime, width, height, data } = value;
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_LOCAL_IMAGE_URL_LENGTH &&
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
