import type { VtToken } from "./vt-tokenizer";

export interface LineModel {
  text(text: string): void;
  control(token: Extract<VtToken, { kind: "control" }>): void;
  // The first keystroke after a prompt marks where the command starts.
  typing(): void;
  commandSubmitted(): void;
  command(
    extract: (line: string, fromPrompt?: boolean) => string | undefined,
  ): string | undefined;
}

const MAX_LINE = 4_096;

// The current screen line as a line editor redraws it: enough to read the
// command a user submits, never stored or sent anywhere.
export function createLineModel(): LineModel {
  let line = "";
  let cursor = 0;
  let commandColumn: number | undefined;
  // Appending is the common case and stays linear; a redraw in the middle of
  // the line rebuilds it. Long lines are trimmed in batches, not per write.
  const write = (character: string) => {
    if (cursor === line.length) line += character;
    else
      line = `${line.slice(0, cursor).padEnd(cursor)}${character}${line.slice(cursor + 1)}`;
    cursor += 1;
    if (line.length > 2 * MAX_LINE) {
      const removed = line.length - MAX_LINE;
      line = line.slice(removed);
      cursor = Math.max(0, cursor - removed);
      commandColumn = undefined;
    }
  };
  return {
    text(text) {
      for (const character of text) {
        if (character === "\n") {
          line = "";
          cursor = 0;
          commandColumn = undefined;
        } else if (character === "\r") cursor = 0;
        else if (character === "\b") cursor = Math.max(0, cursor - 1);
        else if (character === "\t") cursor = Math.min(line.length, cursor + 1);
        else if (character >= " ") write(character);
      }
    },
    control(token) {
      const csi = token.csi;
      if (!csi || csi.prefix !== "") return;
      const count = Math.max(
        1,
        Number.parseInt(csi.parameters || "1", 10) || 1,
      );
      switch (csi.final) {
        case "K":
          if (csi.parameters === "" || csi.parameters === "0")
            line = line.slice(0, cursor);
          else if (csi.parameters === "2") line = "";
          return;
        case "C":
          cursor = Math.min(line.length, cursor + count);
          return;
        case "D":
          cursor = Math.max(0, cursor - count);
          return;
        case "G":
          cursor = Math.max(0, count - 1);
          return;
        case "P":
          line = line.slice(0, cursor) + line.slice(cursor + count);
          return;
        case "@":
          line = line.slice(0, cursor) + " ".repeat(count) + line.slice(cursor);
          return;
      }
    },
    typing() {
      commandColumn ??= cursor;
    },
    commandSubmitted() {
      commandColumn = undefined;
    },
    command(extract) {
      const fromPrompt =
        commandColumn !== undefined && commandColumn <= line.length
          ? extract(line.slice(commandColumn), true)
          : undefined;
      return fromPrompt ?? extract(line);
    },
  };
}
