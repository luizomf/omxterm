import { describe, expect, it } from "vitest";
import { ChafaKittyImageAddon } from "../../src/terminal-surface/chafa-kitty-image-addon";
import {
  bytesToBase64,
  createUncompressedPng,
  kittyChunks,
} from "../fixtures/kitty-image-data";

const terminator = "\u001b\\";
const options = { kittySizeLimit: 33_554_432, pixelLimit: 4_194_304 };
const prelude = apc("a=T,f=32,s=1,v=1,c=2,r=1,m=1,q=2");
const firstPayload = apc("m=1;AAAA");
const finalPayload = apc("m=0;/w==");
const completePayload = apc("m=0;/wAA/w==");

function apc(data: string): string {
  return `\u001b_G${data}\u001b\\`;
}

describe("Chafa Kitty image transport", () => {
  it("reconstructs a completed image inline before following terminal output", () => {
    const addon = new ChafaKittyImageAddon(options);

    expect(addon.transform(prelude)).toBe(terminator);
    expect(addon.transform(firstPayload)).toBe(terminator);
    expect(addon.transform(`${finalPayload}after`)).toBe(
      `${apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;AAAA/w==")}after`,
    );
    expect(addon.transform(finalPayload)).toBe(finalPayload);
  });

  it("preserves Pi-shaped chunked PNG sequences exactly", () => {
    const addon = new ChafaKittyImageAddon(options);
    const first = apc("a=T,f=100,q=2,i=7,m=1;iVBORw0K");
    const final = apc("m=0;AAAA");

    expect(addon.transform(first)).toBe(first);
    expect(addon.transform(final)).toBe(final);
  });

  it.each([false, true])(
    "preserves a Pi PNG replacing Chafa with split transport %j",
    (split) => {
      const addon = new ChafaKittyImageAddon(options);
      addon.transform(prelude);
      const chunks = [
        ...kittyChunks(bytesToBase64(createUncompressedPng(32, 32, 7)), {
          id: 7,
        }),
      ];
      const first = chunks[0]!;
      const output = split
        ? addon.transform(first.slice(0, -2)) + addon.transform(first.slice(-2))
        : addon.transform(first);

      expect(
        output +
          chunks
            .slice(1)
            .map((chunk) => addon.transform(chunk))
            .join(""),
      ).toBe(chunks.join(""));
    },
  );

  it("normalizes retained Base64 into bounded replay chunks", () => {
    const addon = new ChafaKittyImageAddon(options);
    const largePrelude = apc("a=T,f=32,s=1025,v=1,c=2,r=1,m=1,q=2");
    const encoded = `${"AAAA".repeat(1_366)}AAA=`;

    expect(addon.transform(largePrelude)).toBe(terminator);
    expect(addon.transform(apc(`m=0;${encoded}`))).toBe(
      `${apc(`a=T,f=32,s=1025,v=1,c=2,r=1,m=1,q=2,t=d;${encoded.slice(0, 4_096)}`)}${apc(`m=0,q=2;${encoded.slice(4_096)}`)}`,
    );
  });

  it("passes an oversized unrelated APC through byte-for-byte across writes", () => {
    const addon = new ChafaKittyImageAddon(options);
    const beginning = `\u001b_Ga=T,f=100,q=2,i=7,m=0;${"A".repeat(1_100)}`;

    expect(addon.transform(beginning)).toBe(beginning);
    expect(addon.transform("\u001b\\after")).toBe("\u001b\\after");
  });

  it.each([
    "\u001bc",
    "\u001b\u0000c",
    "\u001b\u007fc",
    "\u001b\u0000[?1049l",
    `\u001b[?${"0;".repeat(31)}1049l`,
    "\u001b[!p",
    "\u001b[?1049l",
    "\u001b[?1049;25l",
    "\u001b[?25;1049l",
    "\u009b!p",
    "\u009b?1049l",
    "\u009b?1049;25l",
    "\u001b[?25\u001b[?1049l",
    "\u001b[?25\u009b?1049l",
    "\u001b[?10\u000049l",
    "\u001b[!\u0000p",
    "\u009b?104\u007f9l",
  ])(
    "releases an incomplete transmission before lifecycle sequence %j",
    (sequence) => {
      const addon = new ChafaKittyImageAddon(options);
      expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
        terminator.repeat(2),
      );

      expect(addon.transform(`${sequence}${finalPayload}`)).toBe(
        `${sequence}${finalPayload}`,
      );
    },
  );

  it("tracks a valid lifecycle CSI across an arbitrarily long split parameter", () => {
    const addon = new ChafaKittyImageAddon(options);
    const beginning = `\u001b[?${"0".repeat(300)}`;
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform(beginning)).toBe(beginning);
    expect(addon.transform(`1049l${finalPayload}`)).toBe(
      `1049l${finalPayload}`,
    );
  });

  it.each([
    "\u001b[?!p",
    "\u001b[?1049!p",
    "\u001b[?1049!l",
    "\u001b[?1049?l",
    "\u001b[!1p",
    "\u001b[?1049h",
    `\u001b[?${"0;".repeat(32)}1049l`,
    `\u001b[${"!".repeat(10_000)}p`,
  ])("does not mistake non-lifecycle CSI %j for terminal reset", (sequence) => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform(`${sequence}${finalPayload}`)).toBe(
      `${sequence}${apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;AAAA/w==")}`,
    );
  });

  it("ends a malformed APC on a C1 transition without swallowing its CSI output", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform("\u001b_Gm=0;%%%\u009b31mAFTER")).toBe(
      `${terminator}\u009b31mAFTER`,
    );
    expect(addon.transform("LATER")).toBe("LATER");
  });

  it.each(["\u0018", "\u001a"])(
    "releases an APC canceled by %j without swallowing later output",
    (cancel) => {
      const addon = new ChafaKittyImageAddon(options);
      expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
        terminator.repeat(2),
      );

      expect(addon.transform(`\u001b_Gm=0;%%%${cancel}AFTER`)).toBe(
        `${terminator}${cancel}AFTER`,
      );
      expect(addon.transform("LATER")).toBe("LATER");
    },
  );

  it("completes an APC before a bare ESC starts the following reset", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform("\u001b_Gm=0;/w==\u001bc")).toBe(
      `${apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;AAAA/w==")}\u001bc`,
    );
  });

  it("releases an incomplete transmission when another Kitty command intervenes", () => {
    const addon = new ChafaKittyImageAddon(options);
    const deletion = apc("a=d,d=A,q=2");
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform(deletion)).toBe(deletion);
    expect(addon.transform(finalPayload)).toBe(finalPayload);
  });

  it("accepts the eight-bit string terminator without swallowing later output", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform("\u001b_Gm=0;/w==\u009cAFTER")).toBe(
      `${apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;AAAA/w==")}AFTER`,
    );
  });

  it("discards a transport-split chunk above the expected encoded length before accepting a replacement", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(prelude)).toBe(terminator);
    expect(addon.transform(`\u001b_Gm=1;${"A".repeat(1_100)}`)).toBe(
      terminator,
    );

    expect(addon.transform(`\u001b\\${prelude}${completePayload}after`)).toBe(
      `${terminator}${apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;/wAA/w==")}after`,
    );
  });

  it("rejects empty continuation chunks without retaining array entries", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${apc("m=1;")}`)).toBe(
      terminator.repeat(2),
    );

    expect(addon.transform(`${prelude}${completePayload}`)).toBe(
      terminator + apc("a=T,f=32,s=1,v=1,c=2,r=1,m=0,q=2,t=d;/wAA/w=="),
    );
  });

  it("releases incomplete encoded chunks on disposal", () => {
    const addon = new ChafaKittyImageAddon(options);
    expect(addon.transform(`${prelude}${firstPayload}`)).toBe(
      terminator.repeat(2),
    );

    addon.dispose();

    expect(addon.transform(finalPayload)).toBe(finalPayload);
  });
});
