export interface SgrState {
  apply(parameters: string): void;
  // No attribute or color differs from the terminal default.
  isDefault(): boolean;
}

const ATTRIBUTE_ON: Readonly<Record<number, string>> = {
  1: "intensity",
  2: "intensity",
  3: "italic",
  4: "underline",
  21: "underline",
  5: "blink",
  6: "blink",
  7: "inverse",
  8: "hidden",
  9: "strike",
  53: "overline",
};
const ATTRIBUTE_OFF: Readonly<Record<number, readonly string[]>> = {
  22: ["intensity"],
  23: ["italic"],
  24: ["underline"],
  25: ["blink"],
  27: ["inverse"],
  28: ["hidden"],
  29: ["strike"],
  55: ["overline"],
  39: ["foreground"],
  49: ["background"],
  59: ["underline-color"],
};
const EXTENDED_COLOR: Readonly<Record<number, string>> = {
  38: "foreground",
  48: "background",
  58: "underline-color",
};

function basicColor(code: number): string | undefined {
  if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97))
    return "foreground";
  if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107))
    return "background";
  return undefined;
}

// Which SGR attributes are set, by each attribute's own on and off codes, so
// a partial reset counts: readline marks a pasted command with "ESC[7m" and
// ends the mark with "ESC[27m", never with a full reset.
export function createSgrState(): SgrState {
  const active = new Set<string>();
  return {
    apply(parameters) {
      const list = parameters.split(";");
      for (let index = 0; index < list.length; index += 1) {
        const [head = "", ...sub] = list[index]!.split(":");
        const code = head === "" ? 0 : Number.parseInt(head, 10);
        if (code === 0) active.clear();
        else if (code === 4 && sub[0] === "0") active.delete("underline");
        else if (ATTRIBUTE_ON[code]) active.add(ATTRIBUTE_ON[code]);
        else if (ATTRIBUTE_OFF[code])
          for (const name of ATTRIBUTE_OFF[code]) active.delete(name);
        else if (basicColor(code)) active.add(basicColor(code)!);
        else if (EXTENDED_COLOR[code]) {
          active.add(EXTENDED_COLOR[code]);
          // "38;5;n" and "38;2;r;g;b" carry their arguments as parameters.
          if (sub.length === 0)
            index +=
              list[index + 1] === "5" ? 2 : list[index + 1] === "2" ? 4 : 0;
        }
      }
    },
    isDefault: () => active.size === 0,
  };
}
