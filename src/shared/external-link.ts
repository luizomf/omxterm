export function isValidExternalLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /[\s\p{Cc}\p{Cf}\\]/u.test(value) ||
    (!value.startsWith("http://") && !value.startsWith("https://"))
  )
    return false;
  try {
    const parsed = new URL(value);
    const authority = value
      .slice(value.startsWith("https://") ? 8 : 7)
      .split(/[/?#]/u, 1)[0]!;
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      authority.length > 0 &&
      parsed.host.length > 0
    );
  } catch {
    return false;
  }
}
