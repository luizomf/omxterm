import type { ITerminalAddon, Terminal } from "@xterm/xterm";
import { TerminalImageLifecycle } from "./terminal-image-lifecycle";

interface ChafaKittyImageAddonOptions {
  readonly kittySizeLimit: number;
  readonly pixelLimit: number;
}

interface PendingChafaTransmission {
  readonly columns: number;
  readonly expectedBytes: number;
  readonly height: number;
  readonly payloads: string[];
  readonly rows: number;
  readonly width: number;
  encodedCharacters: number;
}

const KITTY_APC_START = "\u001b_G";
const STRING_TERMINATOR = "\u001b\\";
const MAX_PRELUDE_CHARACTERS = 1_024;
const MAX_DISCARDED_CHUNK_CHARACTERS = 4_616;
const REPLAY_CHUNK_CHARACTERS = 4_096;
const ALLOWED_PRELUDE_KEYS = new Set([
  "a",
  "c",
  "f",
  "m",
  "q",
  "r",
  "s",
  "t",
  "v",
]);
const BASE64_VALUE = new Map(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    .split("")
    .map((character, index) => [character, index]),
);

/**
 * Adapts Chafa's metadata-only raw-RGBA prelude to the pinned image addon's
 * payload-first Kitty stream without broadening the addon's protocol surface.
 */
export class ChafaKittyImageAddon implements ITerminalAddon {
  private pending: PendingChafaTransmission | undefined;
  private discardAnonymousPending = false;
  private bufferedInput = "";
  private readonly lifecycle: TerminalImageLifecycle;
  private oversizedApcMode: "discard" | "pass" | undefined;
  private discardAfterOversizedApc = false;
  private oversizedTerminatorPrefix = "";

  constructor(private readonly options: ChafaKittyImageAddonOptions) {
    this.lifecycle = new TerminalImageLifecycle(() =>
      this.releaseTransmission(),
    );
  }

  activate(_terminal: Terminal): void {}

  transform(data: string): string {
    if (data.length === 0) return data;
    let input = this.bufferedInput + data;
    this.bufferedInput = "";
    let output = "";

    if (this.oversizedApcMode) {
      const resumed = this.resumeOversizedApc(input);
      output += resumed.output;
      if (resumed.remainder === undefined) return output;
      input = resumed.remainder;
    }

    while (input.length > 0) {
      const start = input.indexOf(KITTY_APC_START);
      if (start === -1) {
        const [plain, possiblePrefix] = splitPossibleKittyPrefix(input);
        this.lifecycle.observe(plain);
        this.bufferedInput = possiblePrefix;
        return output + plain;
      }

      const plain = input.slice(0, start);
      this.lifecycle.observe(plain);
      output += plain;
      this.lifecycle.reset();

      const boundary = findApcBoundary(input, start + KITTY_APC_START.length);
      if (!boundary) {
        const incomplete = input.slice(start);
        if (incomplete.length <= this.maximumBufferedApcCharacters()) {
          this.bufferedInput = incomplete;
          return output;
        }
        return output + this.beginOversizedApc(incomplete);
      }

      const original = input.slice(start, boundary.sequenceEnd);
      if (boundary.kind === "abort") {
        if (this.pending || this.discardAnonymousPending) {
          this.releaseTransmission();
          output += STRING_TERMINATOR + boundary.abortOutput;
        } else {
          output += original;
        }
        this.lifecycle.observe(boundary.abortOutput);
        input = input.slice(boundary.remainderStart);
        continue;
      }

      const contents = input.slice(
        start + KITTY_APC_START.length,
        boundary.contentEnd,
      );
      // Consumed APCs still end any preceding unfinished OSC/CSI in xterm.
      // ST preserves that parser transition without forwarding image payload.
      output += this.handleKittyApc(contents, original) || STRING_TERMINATOR;
      input = input.slice(boundary.remainderStart);
    }

    return output;
  }

  dispose(): void {
    this.releaseTransmission();
    this.bufferedInput = "";
    this.lifecycle.reset();
    this.oversizedApcMode = undefined;
    this.discardAfterOversizedApc = false;
    this.oversizedTerminatorPrefix = "";
  }

  private handleKittyApc(data: string, original: string): string {
    const separator = data.indexOf(";");
    if (separator === -1) return this.handlePrelude(data, original);

    const controls = parseControls(data.slice(0, separator));
    const more = controls ? parsePositiveOrZero(controls.get("m")) : undefined;
    const isAnonymousChunk = isAnonymousPayloadControls(controls);

    if (!this.pending) {
      if (!this.discardAnonymousPending || !isAnonymousChunk) {
        this.discardAnonymousPending = false;
        return original;
      }
      if (more === 0) this.discardAnonymousPending = false;
      return "";
    }
    if (!isAnonymousChunk) {
      this.releaseTransmission();
      return original;
    }

    const payload = data.slice(separator + 1);
    const maximumEncodedCharacters =
      4 * Math.ceil(this.pending.expectedBytes / 3);
    this.pending.encodedCharacters += payload.length;
    if (
      this.pending.encodedCharacters > maximumEncodedCharacters ||
      this.pending.encodedCharacters >
        Math.ceil((this.options.kittySizeLimit * 4) / 3)
    ) {
      this.pending = undefined;
      this.discardAnonymousPending = more === 1;
      return "";
    }
    if (payload.length === 0) {
      this.pending = undefined;
      this.discardAnonymousPending = more === 1;
      return "";
    }
    appendPayload(this.pending.payloads, payload);
    if (more === 1) return "";

    const completed = this.pending;
    this.pending = undefined;
    if (decodedBase64Length(completed.payloads) !== completed.expectedBytes)
      return "";
    return replay(completed);
  }

  private handlePrelude(data: string, original: string): string {
    const controls = parseControls(data);
    if (!isChafaPreludeCandidate(controls)) {
      this.releaseTransmission();
      return original;
    }

    this.releaseTransmission();
    if (
      !controls ||
      [...controls.keys()].some((key) => !ALLOWED_PRELUDE_KEYS.has(key)) ||
      controls.get("q") !== "2" ||
      (controls.get("t") !== undefined && controls.get("t") !== "d")
    ) {
      this.discardAnonymousPending = true;
      return "";
    }

    const width = parsePositive(controls.get("s"));
    const height = parsePositive(controls.get("v"));
    const columns = parsePositive(controls.get("c"));
    const rows = parsePositive(controls.get("r"));
    if (
      width === undefined ||
      height === undefined ||
      columns === undefined ||
      rows === undefined ||
      width > Math.floor(this.options.pixelLimit / height)
    ) {
      this.discardAnonymousPending = true;
      return "";
    }

    this.pending = {
      columns,
      encodedCharacters: 0,
      expectedBytes: width * height * 4,
      height,
      payloads: [],
      rows,
      width,
    };
    return "";
  }

  private maximumBufferedApcCharacters(): number {
    if (this.pending) {
      const encodedLimit = 4 * Math.ceil(this.pending.expectedBytes / 3);
      return 1_024 + encodedLimit - this.pending.encodedCharacters;
    }
    return this.discardAnonymousPending
      ? MAX_DISCARDED_CHUNK_CHARACTERS
      : MAX_PRELUDE_CHARACTERS;
  }

  private beginOversizedApc(data: string): string {
    const separator = data.indexOf(";");
    const controls = parseControls(
      data.slice(
        KITTY_APC_START.length,
        separator === -1 ? undefined : separator,
      ),
    );
    const unrelated =
      controls !== undefined &&
      !isAnonymousPayloadControls(controls) &&
      !isChafaPreludeCandidate(controls);
    const shouldDiscard =
      !unrelated &&
      (this.pending !== undefined || this.discardAnonymousPending);
    this.releaseTransmission();
    this.oversizedApcMode = shouldDiscard ? "discard" : "pass";
    this.discardAfterOversizedApc = shouldDiscard && controls?.get("m") === "1";
    if (data.endsWith("\u001b")) {
      this.oversizedTerminatorPrefix = "\u001b";
      return shouldDiscard ? STRING_TERMINATOR : data.slice(0, -1);
    }
    return shouldDiscard ? STRING_TERMINATOR : data;
  }

  private resumeOversizedApc(data: string): {
    readonly output: string;
    readonly remainder?: string;
  } {
    const combined = this.oversizedTerminatorPrefix + data;
    const mode = this.oversizedApcMode;
    this.oversizedTerminatorPrefix = "";
    const boundary = findApcBoundary(combined, 0);
    if (!boundary) {
      if (combined.endsWith("\u001b")) {
        this.oversizedTerminatorPrefix = "\u001b";
        return {
          output: mode === "pass" ? combined.slice(0, -1) : "",
        };
      }
      return { output: mode === "pass" ? combined : "" };
    }

    this.oversizedApcMode = undefined;
    this.discardAnonymousPending =
      boundary.kind === "success" && this.discardAfterOversizedApc;
    this.discardAfterOversizedApc = false;
    this.lifecycle.reset();
    if (boundary.kind === "abort") this.lifecycle.observe(boundary.abortOutput);
    return {
      output:
        mode === "pass"
          ? combined.slice(0, boundary.sequenceEnd)
          : boundary.kind === "abort"
            ? boundary.abortOutput
            : "",
      remainder: combined.slice(boundary.remainderStart),
    };
  }

  private releaseTransmission(): void {
    this.pending = undefined;
    this.discardAnonymousPending = false;
  }
}

type ApcBoundary =
  | {
      readonly kind: "success";
      readonly contentEnd: number;
      readonly remainderStart: number;
      readonly sequenceEnd: number;
    }
  | {
      readonly kind: "abort";
      readonly abortOutput: string;
      readonly remainderStart: number;
      readonly sequenceEnd: number;
    };

function findApcBoundary(
  data: string,
  offset: number,
): ApcBoundary | undefined {
  for (let index = offset; index < data.length; index += 1) {
    const code = data.charCodeAt(index);
    if (code === 0x9c)
      return {
        kind: "success",
        contentEnd: index,
        remainderStart: index + 1,
        sequenceEnd: index + 1,
      };
    if (code === 0x18 || code === 0x1a || (code >= 0x80 && code <= 0x9f))
      return {
        kind: "abort",
        abortOutput: data[index]!,
        remainderStart: index + 1,
        sequenceEnd: index + 1,
      };
    if (code !== 0x1b) continue;
    if (index + 1 >= data.length) return undefined;
    if (data[index + 1] === "\\")
      return {
        kind: "success",
        contentEnd: index,
        remainderStart: index + 2,
        sequenceEnd: index + 2,
      };
    return {
      kind: "success",
      contentEnd: index,
      remainderStart: index,
      sequenceEnd: index,
    };
  }
  return undefined;
}

function appendPayload(blocks: string[], payload: string): void {
  let offset = 0;
  const lastIndex = blocks.length - 1;
  if (lastIndex >= 0 && blocks[lastIndex]!.length < REPLAY_CHUNK_CHARACTERS) {
    const available = REPLAY_CHUNK_CHARACTERS - blocks[lastIndex]!.length;
    const appended = Math.min(available, payload.length);
    blocks[lastIndex] = blocks[lastIndex]! + payload.slice(0, appended);
    offset = appended;
  }
  while (offset < payload.length) {
    blocks.push(payload.slice(offset, offset + REPLAY_CHUNK_CHARACTERS));
    offset += REPLAY_CHUNK_CHARACTERS;
  }
}

function replay(completed: PendingChafaTransmission): string {
  const lastIndex = completed.payloads.length - 1;
  return completed.payloads
    .map((payload, index) => {
      const more = index === lastIndex ? 0 : 1;
      const controls =
        index === 0
          ? `a=T,f=32,s=${completed.width},v=${completed.height},c=${completed.columns},r=${completed.rows},m=${more},q=2,t=d`
          : `m=${more},q=2`;
      return `${KITTY_APC_START}${controls};${payload}${STRING_TERMINATOR}`;
    })
    .join("");
}

function splitPossibleKittyPrefix(data: string): readonly [string, string] {
  for (let length = KITTY_APC_START.length - 1; length > 0; length -= 1) {
    const suffix = data.slice(-length);
    if (KITTY_APC_START.startsWith(suffix))
      return [data.slice(0, -length), suffix];
  }
  return [data, ""];
}

function isAnonymousPayloadControls(
  controls: ReadonlyMap<string, string> | undefined,
): boolean {
  return (
    controls !== undefined &&
    [...controls.keys()].every((key) => key === "m" || key === "q") &&
    (controls.get("q") === undefined || controls.get("q") === "2") &&
    (controls.get("m") === "0" || controls.get("m") === "1")
  );
}

function isChafaPreludeCandidate(
  controls: ReadonlyMap<string, string> | undefined,
): boolean {
  return (
    controls?.get("a") === "T" &&
    controls.get("f") === "32" &&
    controls.get("m") === "1" &&
    !controls.has("i") &&
    !controls.has("I")
  );
}

function parseControls(data: string): ReadonlyMap<string, string> | undefined {
  if (data.length === 0) return undefined;
  const controls = new Map<string, string>();
  for (const part of data.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0 || separator === part.length - 1) return undefined;
    const key = part.slice(0, separator);
    if (controls.has(key)) return undefined;
    controls.set(key, part.slice(separator + 1));
  }
  return controls;
}

function parsePositive(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parsePositiveOrZero(value: string | undefined): number | undefined {
  if (value === "0") return 0;
  return parsePositive(value);
}

function decodedBase64Length(payloads: readonly string[]): number | undefined {
  let characters = 0;
  let padding = 0;
  let lastValue: number | undefined;
  let sawPadding = false;

  for (const payload of payloads) {
    for (const character of payload) {
      characters += 1;
      if (character === "=") {
        sawPadding = true;
        padding += 1;
        if (padding > 2) return undefined;
        continue;
      }
      const value = BASE64_VALUE.get(character);
      if (value === undefined || sawPadding) return undefined;
      lastValue = value;
    }
  }

  const remainder = characters % 4;
  if (
    characters === 0 ||
    remainder === 1 ||
    (padding > 0 && remainder !== 0) ||
    lastValue === undefined
  )
    return undefined;
  if (padding === 2 && (lastValue & 0x0f) !== 0) return undefined;
  if (padding === 1 && (lastValue & 0x03) !== 0) return undefined;
  if (padding === 0 && remainder === 2 && (lastValue & 0x0f) !== 0)
    return undefined;
  if (padding === 0 && remainder === 3 && (lastValue & 0x03) !== 0)
    return undefined;

  return Math.floor((characters * 3) / 4) - padding;
}
