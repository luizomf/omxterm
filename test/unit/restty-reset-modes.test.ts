import { describe, expect, it } from "vitest";
import { cprCoreFixture } from "../fixtures/restty-cpr-core-probe";

// The output filter alone owns these modes: the core never sees their
// sequences, so its RIS can't reset them. A `reset` after a crashed
// full-screen program must still give clicks, paste and focus back.
const programModes =
  "\u001b[?1049h\u001b[?1000h\u001b[?1006h\u001b[?2004h\u001b[?1004h\u001b[?2026h";

describe("terminal reset (RIS) and the filter's own modes", () => {
  it("is set up by a full-screen program", async () => {
    const t = await cprCoreFixture(10, 4);
    try {
      t.write(programModes);
      expect(t.modes()).toEqual({
        mouse: true,
        bracketedPaste: true,
        focusReporting: true,
        synchronizedOutput: true,
      });
      expect(t.click()).toBe(true);
      expect(t.replies).toEqual(["\u001b[<0;1;1M"]);
    } finally {
      t.dispose();
    }
  });

  it.each([["whole"], ["split"]])(
    "turns them off after ESC c (%s)",
    async (how) => {
      const t = await cprCoreFixture(10, 4);
      try {
        t.write(programModes);
        if (how === "split") {
          t.write("\u001b");
          t.write("c");
        } else t.write("\u001bc");
        expect(t.modes()).toEqual({
          mouse: false,
          bracketedPaste: false,
          focusReporting: false,
          synchronizedOutput: false,
        });
        t.replies.length = 0;
        // A click goes to selection, not to the shell.
        expect(t.click()).toBe(false);
        t.paste("echo hi");
        expect(t.replies).toEqual(["echo hi"]);
      } finally {
        t.dispose();
      }
    },
  );

  it("lets a program turn them on again after a reset", async () => {
    const t = await cprCoreFixture(10, 4);
    try {
      t.write(`${programModes}\u001bc`);
      // Default X10 encoding again: the old SGR choice doesn't survive.
      t.write("\u001b[?1000h\u001b[?2004h");
      t.replies.length = 0;
      expect(t.click()).toBe(true);
      expect(t.replies).toEqual(["\u001b[M !!"]);
      t.replies.length = 0;
      t.paste("x");
      expect(t.replies).toEqual(["\u001b[200~x\u001b[201~"]);
    } finally {
      t.dispose();
    }
  });
});
