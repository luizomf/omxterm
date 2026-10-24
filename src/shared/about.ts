// Adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export const aboutIpc = {
  open: "about:open",
  info: "about:info",
  openLink: "about:open-link",
} as const;

export const ABOUT_LINKS = [
  "website",
  "contributors",
  "issues",
  "license",
] as const;
export type AboutLink = (typeof ABOUT_LINKS)[number];
export interface AboutInfo {
  readonly name: string;
  readonly version: string;
  readonly copyright: string;
}
export interface AboutBridge {
  info(): Promise<AboutInfo>;
  openLink(link: AboutLink): Promise<void>;
  onOpen(listener: () => void): () => void;
}
export const isAboutLink = (value: unknown): value is AboutLink =>
  typeof value === "string" &&
  (ABOUT_LINKS as readonly string[]).includes(value);

export function isAboutInfo(value: unknown): value is AboutInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return [info.name, info.version, info.copyright].every(
    (text) =>
      typeof text === "string" &&
      text.length > 0 &&
      text.length <= 256 &&
      !/[\u0000-\u001f\u007f]/u.test(text),
  );
}
