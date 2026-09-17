import { describe, expect, it } from "vitest";
import { visibleWebLinkAtOffset } from "../../src/terminal-surface/visible-web-links";

describe("Restty visible-link span contract", () => {
  it("keeps nearby links separate and conservatively refuses clipped destinations", () => {
    const text = "https://one.test/a https://two.test/b";
    expect(visibleWebLinkAtOffset(text, 3)).toEqual({
      url: "https://one.test/a",
      start: 0,
      end: 18,
    });
    expect(visibleWebLinkAtOffset(text, 22)).toEqual({
      url: "https://two.test/b",
      start: 19,
      end: 37,
    });
    expect(visibleWebLinkAtOffset(text, 3, true, false)).toBeUndefined();
    expect(visibleWebLinkAtOffset(text, 22, false, true)).toBeUndefined();
  });

  it.each([
    ["See https://example.test/path, now", 8, "https://example.test/path"],
    ["[http://one.test/a]", 3, "http://one.test/a"],
    ["(https://example.test/a(b)c)", 3, "https://example.test/a"],
  ])("owns the expected punctuation span in %s", (text, offset, expected) => {
    expect(visibleWebLinkAtOffset(text, offset)?.url).toBe(expected);
  });

  it("preserves a long fully visible destination exactly", () => {
    const url = `https://example.test/${"a".repeat(2_100)}`;
    expect(visibleWebLinkAtOffset(url, 2_050)?.url).toBe(url);
  });

  it("accepts only visible lowercase HTTP(S)", () => {
    expect(visibleWebLinkAtOffset("HTTP://upper.test", 3)).toBeUndefined();
    expect(visibleWebLinkAtOffset("HTTPS://upper.test", 3)).toBeUndefined();
    expect(visibleWebLinkAtOffset("file:///tmp/private", 3)).toBeUndefined();
    expect(visibleWebLinkAtOffset("http://lower.test", 3)?.url).toBe(
      "http://lower.test",
    );
  });
});
