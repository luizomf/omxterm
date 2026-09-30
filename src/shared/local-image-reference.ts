import { MAX_LOCAL_IMAGE_SOURCE_LENGTH } from "./local-image";

export interface LocalImageReference {
  readonly path: string;
  readonly kind: "absolute" | "home" | "relative";
  readonly fallbackPath?: string;
}

const locationSuffix = /:[1-9][0-9]*(?::[1-9][0-9]*)?$/u;

// This is a visible-reference grammar, not shell parsing. Quotes preserve their
// contents literally; only a location suffix outside quotes is decoration.
export function parseLocalImageReference(
  value: string,
): LocalImageReference | undefined {
  if (
    !value ||
    value.length > MAX_LOCAL_IMAGE_SOURCE_LENGTH ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    return undefined;
  let literal = value;
  let quoted = false;
  if (value[0] === "'" || value[0] === '"') {
    const end = value.indexOf(value[0], 1);
    if (end < 0) return undefined;
    const remainder = value.slice(end + 1);
    if (remainder && !/^:[1-9][0-9]*(?::[1-9][0-9]*)?$/u.test(remainder))
      return undefined;
    literal = value.slice(1, end);
    quoted = true;
  } else if (/\s/u.test(value) && !isWholeLineAbsoluteImageReference(value))
    return undefined;
  const kind = referenceKind(literal);
  if (!kind) return undefined;
  const withoutSuffix = literal.replace(locationSuffix, "");
  return {
    path: literal,
    kind,
    ...(!quoted &&
    withoutSuffix !== literal &&
    !/:[0-9]+$/u.test(withoutSuffix) &&
    referenceKind(withoutSuffix) === kind
      ? { fallbackPath: withoutSuffix }
      : {}),
  };
}

// A conservative lexical cue for a path printed alone. This never searches the
// filesystem to separate prose or neighboring references from a filename.
export function isWholeLineAbsoluteImageReference(value: string): boolean {
  return (
    referenceKind(value) === "absolute" &&
    value.includes(" ") &&
    !value.endsWith(" ") &&
    !/[^\S ]/u.test(value) &&
    /\.(?:png|jpe?g)(?::[1-9][0-9]*(?::[1-9][0-9]*)?)?$/iu.test(value) &&
    !/ +(?:\/|[a-z]:[\\/]|~(?:[ /]|$)|\.{1,2}[\\/]|['"]|https?:\/\/|file:\/\/\/)/iu.test(
      value,
    ) &&
    !/\.(?:png|jpe?g|webp)(?::[1-9][0-9]*(?::[1-9][0-9]*)?)? +/iu.test(value)
  );
}

function referenceKind(value: string): LocalImageReference["kind"] | undefined {
  if (!value || value.startsWith("//") || value.startsWith("\\"))
    return undefined;
  if (value.startsWith("/") || /^[a-z]:[\\/]/iu.test(value)) return "absolute";
  if (value === "~" || value.startsWith("~/")) return "home";
  if (value.startsWith("~") || /^[a-z][a-z0-9+.-]*:/iu.test(value))
    return undefined;
  if (/^\.\.?[\\/]/u.test(value)) return "relative";
  // Bare relative image names are opt-in lexical cues, not format proof.
  if (
    /^[^'"=()[\]{}:]+\.(?:png|jpe?g|webp)(?::[1-9][0-9]*(?::[1-9][0-9]*)?)?$/iu.test(
      value,
    )
  )
    return "relative";
  return undefined;
}
