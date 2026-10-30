import { describe, expect, it } from "vitest";
import { keyboardCoreFixture } from "../fixtures/restty-keyboard-core-probe";

const arrows = ["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"];
const normal = ["\u001b[A", "\u001b[B", "\u001b[C", "\u001b[D"];
const application = ["\u001bOA", "\u001bOB", "\u001bOC", "\u001bOD"];

describe("prepared keyboard input with actual core modes", () => {
  it("sends application arrows after split DECCKM output and normal arrows after reset", async () => {
    const f = await keyboardCoreFixture();
    try {
      for (const key of arrows) f.key(key);
      expect(f.sent).toEqual(normal);
      f.sent.length = 0;
      f.write("\u001b[?1");
      f.write("h");
      for (const key of arrows) f.key(key);
      expect(f.sent).toEqual(application);
      f.sent.length = 0;
      f.write("\u001b[?1l");
      for (const key of arrows) f.key(key);
      expect(f.sent).toEqual(normal);
    } finally {
      f.dispose();
    }
  });

  it("uses current core mode across save/restore, reset and every split position", async () => {
    const f = await keyboardCoreFixture();
    const check = (output: string, expected: string[]) => {
      f.sent.length = 0;
      f.write(output);
      for (const key of arrows) f.key(key);
      expect(f.sent).toEqual(expected);
    };
    try {
      check("\u001b[?1h", application);
      check("\u001b[?1s\u001b[?1l", normal);
      check("\u001b[?1r", application);
      // The pinned Ghostty core leaves DECCKM set after DECSTR.
      check("\u001b[!p", application);
      check("\u001b[?1049h\u001b[?1049l", application);
      check("\u001bc", normal);
      const control = "\u001b[?1h";
      for (let split = 1; split < control.length; split++) {
        check("\u001b[?1l", normal);
        f.write(control.slice(0, split));
        check(control.slice(split), application);
      }
      check("\u001b[?1;25l", normal);
      check("\u001b[?1;25h", application);
      check("\u001b[?1\u0018l", application); // cancelled, not a reset
      check("\u001bc", normal);
    } finally {
      f.dispose();
    }
  });

  it("preserves modified arrows and non-arrow keys in application mode", async () => {
    const f = await keyboardCoreFixture();
    try {
      f.write("\u001b[?1h");
      for (const key of arrows) f.key(key, { shiftKey: true });
      f.key("ArrowUp", { altKey: true });
      f.key("ArrowUp", { ctrlKey: true });
      f.key("ArrowLeft", { ctrlKey: true });
      f.key("ArrowRight", { metaKey: true });
      for (const key of [
        "Home",
        "End",
        "Enter",
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "F1",
        "x",
      ])
        f.key(key);
      expect(f.sent).toEqual([
        "\u001b[1;2A",
        "\u001b[1;2B",
        "\u001b[1;2C",
        "\u001b[1;2D",
        "\u001b[1;3A",
        "\u001b[1;5A",
        "\u001bb",
        "\u001bf",
        "\u001b[H",
        "\u001b[F",
        "\r",
        "\u007f",
        "\u001b[3~",
        "\t",
        "\u001b",
        "\u001bOP",
        "x",
      ]);
    } finally {
      f.dispose();
    }
  });

  it.each([false, true])(
    "preserves repeat/release and final routing (claimed=%s)",
    async (claim) => {
      const f = await keyboardCoreFixture(claim);
      try {
        f.write("\u001b[?1h");
        f.key("ArrowUp");
        f.key("ArrowUp", { repeat: true });
        f.key("ArrowUp", { type: "keyup" });
        f.key("Enter");
        expect(f.routed).toEqual(["\u001bOA", "\u001bOA", "\r"]);
        expect(f.sent).toEqual(claim ? [] : f.routed);
        f.routed.length = 0;
        f.sent.length = 0;
        f.write("\u001b[>3u");
        f.key("ArrowUp");
        f.key("ArrowUp", { repeat: true });
        f.key("ArrowUp", { type: "keyup" });
        expect(f.routed).toEqual([
          "\u001b[1;1:1A",
          "\u001b[1;1:2A",
          "\u001b[1;1:3A",
        ]);
        expect(f.sent).toEqual(claim ? [] : f.routed);
        f.routed.length = 0;
        f.sent.length = 0;
        f.write("\u001b[<u\u001b[>1u");
        f.key("ArrowUp");
        f.key("ArrowUp", { type: "keyup" });
        f.write("\u001b[<u");
        f.key("ArrowUp");
        expect(f.routed).toEqual(["\u001b[A", "\u001bOA"]);
        expect(f.sent).toEqual(claim ? [] : f.routed);
      } finally {
        f.dispose();
      }
    },
  );
});
