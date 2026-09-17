export const OSC_HANDLER_PAYLOAD_LIMIT = 10_000_000;

interface OscParser {
  registerOscHandler(
    ident: number,
    handler: (data: string) => boolean | Promise<boolean>,
  ): { dispose(): void };
}

export function registerOsc52Clipboard(
  parser: OscParser,
  writeText: (text: string) => Promise<void>,
  onError?: () => void,
): { dispose(): void } {
  return parser.registerOscHandler(52, async (data) => {
    const text = decodeOsc52Write(data);
    if (text !== undefined) {
      try {
        await writeText(text);
      } catch {
        onError?.();
      }
    }
    return true;
  });
}

export function decodeOsc52Write(data: string): string | undefined {
  if (data.length > OSC_HANDLER_PAYLOAD_LIMIT || !data.startsWith("c;"))
    return undefined;
  const encoded = data.slice(2);
  if (encoded.length === 0 || encoded.length % 4 !== 0 || !isBase64(encoded))
    return undefined;

  try {
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) return undefined;
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function isBase64(value: string): boolean {
  let padding = 0;
  for (
    let index = value.length - 1;
    index >= 0 && value[index] === "=";
    index--
  )
    padding++;
  if (padding > 2) return false;
  const contentLength = value.length - padding;
  for (let index = 0; index < contentLength; index++) {
    const code = value.charCodeAt(index);
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!valid) return false;
  }
  return contentLength > 0;
}
