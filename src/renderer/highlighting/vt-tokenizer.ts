// Incremental VT tokenizer for output highlighting. It never changes bytes:
// it only classifies a chunk into plain text and complete or partial control
// sequences, keeping its state across chunk boundaries so a sequence split
// between two reads is still recognized as one control.
export type VtToken =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "control";
      readonly text: string;
      // Present for complete CSI sequences: private marker, parameters, final.
      readonly csi?: {
        readonly prefix: string;
        readonly parameters: string;
        readonly final: string;
      };
    };

type State =
  | "ground"
  | "escape"
  | "escape-intermediate"
  | "csi"
  | "osc"
  | "osc-escape"
  | "string"
  | "string-escape";

const ESC = "\u001b";
const BEL = "\u0007";
const isIntermediate = (code: number) => code >= 0x20 && code <= 0x2f;

export interface VtTokenizer {
  tokenize(chunk: string): VtToken[];
  // True while inside an unfinished control sequence.
  inSequence(): boolean;
}

export function createVtTokenizer(): VtTokenizer {
  let state: State = "ground";
  let sequence = "";
  let prefix = "";
  let parameters = "";
  let tokens: VtToken[] = [];
  let text = "";

  const flushText = () => {
    if (text.length > 0) tokens.push({ kind: "text", text });
    text = "";
  };
  const begin = (character: string, next: State) => {
    flushText();
    sequence = character;
    state = next;
  };
  const finish = (csi?: Extract<VtToken, { kind: "control" }>["csi"]) => {
    tokens.push(
      csi
        ? { kind: "control", text: sequence, csi }
        : { kind: "control", text: sequence },
    );
    sequence = "";
    prefix = "";
    parameters = "";
    state = "ground";
  };

  const handlers: Readonly<
    Record<State, (character: string, code: number) => void>
  > = {
    ground(character, code) {
      if (character === ESC) begin(character, "escape");
      else if (code === 0x9b) begin(character, "csi");
      else text += character;
    },
    escape(character, code) {
      sequence += character;
      if (character === "[") state = "csi";
      else if (character === "]") state = "osc";
      // DCS, SOS, PM and APC (Kitty images) run until ST.
      else if ("P_^X".includes(character)) state = "string";
      else if (isIntermediate(code)) state = "escape-intermediate";
      else finish();
    },
    "escape-intermediate"(character, code) {
      sequence += character;
      if (!isIntermediate(code)) finish();
    },
    csi(character, code) {
      if (character === ESC) {
        // A new escape aborts the malformed sequence.
        finish();
        begin(character, "escape");
        return;
      }
      sequence += character;
      if (code >= 0x40 && code <= 0x7e)
        finish({ prefix, parameters, final: character });
      else if (code >= 0x3c && code <= 0x3f && parameters === "")
        prefix += character;
      else if (code >= 0x20 && code <= 0x3f) parameters += character;
    },
    osc(character) {
      sequence += character;
      if (character === BEL) finish();
      else if (character === ESC) state = "osc-escape";
    },
    "osc-escape"(character) {
      sequence += character;
      if (character === "\\") finish();
      else state = "osc";
    },
    string(character) {
      sequence += character;
      if (character === ESC) state = "string-escape";
    },
    "string-escape"(character) {
      sequence += character;
      if (character === "\\") finish();
      else if (character !== ESC) state = "string";
    },
  };

  return {
    inSequence: () => state !== "ground",
    tokenize(chunk) {
      tokens = [];
      text = "";
      for (const character of chunk)
        handlers[state](character, character.codePointAt(0)!);
      flushText();
      // An unfinished sequence is emitted as-is now; its continuation in the
      // next chunk is emitted as control text too. Nothing is held back.
      if (state !== "ground" && sequence.length > 0) {
        tokens.push({ kind: "control", text: sequence });
        sequence = "";
      }
      return tokens;
    },
  };
}
