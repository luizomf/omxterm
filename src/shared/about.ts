export const aboutIpc = {
  open: "about:open",
  info: "about:info",
  openLink: "about:open-link",
} as const;

// The About dialog's links; main owns the addresses.
export const ABOUT_LINKS = ["website", "issues", "license"] as const;
export type AboutLink = (typeof ABOUT_LINKS)[number];

export interface AboutInfo {
  readonly name: string;
  readonly version: string;
  readonly authors: readonly string[];
  readonly copyleft: string;
  readonly website: string;
}

export const isAboutLink = (value: unknown): value is AboutLink =>
  typeof value === "string" &&
  (ABOUT_LINKS as readonly string[]).includes(value);

const isShortText = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256;

export function isAboutInfo(value: unknown): value is AboutInfo {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Record<string, unknown>;
  return (
    isShortText(info.name) &&
    isShortText(info.version) &&
    isShortText(info.copyleft) &&
    isShortText(info.website) &&
    Array.isArray(info.authors) &&
    info.authors.length <= 32 &&
    info.authors.every(isShortText)
  );
}
