import { describe, expect, it } from "vitest";
import {
  agentChordKey,
  agentChordSendsNothing,
  parseAgentChord,
} from "../../src/shared/agent-api";
import { keyboardCoreFixture } from "../fixtures/restty-keyboard-core-probe";

// Every key press names, under every Ctrl/Alt/Shift combination.
const names = [
  ...["Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown"],
  ...["Insert", "Delete", "Enter", "Tab", "Escape", "Backspace", "Space"],
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
];
const chords = names.flatMap((name) =>
  ["", "Ctrl+", "Alt+", "Shift+", "Ctrl+Alt+", "Ctrl+Shift+", "Alt+Shift+"]
    .concat("Ctrl+Alt+Shift+")
    .map((modifiers) => parseAgentChord(`${modifiers}${name}`)!),
);

// What the program asked the terminal for, as real output into the core.
const modes = {
  normal: "",
  "application cursor": "\u001b[?1h",
  "Kitty disambiguate": "\u001b[>1u",
  "Kitty with release events": "\u001b[>3u",
  "Kitty, every flag": "\u001b[>31u",
  "application cursor and Kitty": "\u001b[?1h\u001b[>1u",
};

describe("press encodes like the user's key", () => {
  it.each(Object.entries(modes))(
    "sends the user's bytes in %s mode",
    async (_mode, output) => {
      const f = await keyboardCoreFixture();
      try {
        f.write(output);
        for (const chord of chords) {
          const key = agentChordKey(chord);
          f.sent.length = 0;
          // The user's key: a DOM press and release through the Surface.
          f.key(key.key, { ...key, code: key.code });
          f.key(key.key, { ...key, code: key.code, type: "keyup" });
          const user = f.sent.join("");
          expect(user).not.toBe("");
          expect(f.press(key), JSON.stringify(chord)).toBe(user);
        }
      } finally {
        f.dispose();
      }
    },
  );

  it("sends nothing on macOS exactly where press refuses", async () => {
    const f = await keyboardCoreFixture(false, {
      mac: true,
      optionKeyMode: "none",
    });
    try {
      for (const chord of chords) {
        const key = agentChordKey(chord);
        f.sent.length = 0;
        f.key(key.key, { ...key, code: key.code });
        f.key(key.key, { ...key, code: key.code, type: "keyup" });
        const user = f.sent.join("");
        if (agentChordSendsNothing(chord, "darwin"))
          expect(user, JSON.stringify(chord)).toBe("");
        // Option types native text here; press's Alt is the terminal's
        // (documented in the agent API reference).
        else if (chord.key === "Space" && chord.alt) continue;
        else expect(f.press(key), JSON.stringify(chord)).toBe(user);
      }
    } finally {
      f.dispose();
    }
  });

  it("follows application cursor mode for Up", async () => {
    const f = await keyboardCoreFixture();
    try {
      const up = agentChordKey(parseAgentChord("Up")!);
      expect(f.press(up)).toBe("\u001b[A");
      f.write("\u001b[?1h");
      expect(f.press(up)).toBe("\u001bOA");
      f.write("\u001b[?1l");
      expect(f.press(up)).toBe("\u001b[A");
    } finally {
      f.dispose();
    }
  });
});
