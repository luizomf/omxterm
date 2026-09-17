import { describe, expect, it } from "vitest";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";

describe("Restty visible-link span contract", () => {
  it("keeps nearby links separate and conservatively refuses clipped destinations", () => {
    const text = "https://one.test/a https://two.test/b";
    expect(visibleLinkAtOffset(text, 3)).toEqual({
      url: "https://one.test/a",
      start: 0,
      end: 18,
    });
    expect(visibleLinkAtOffset(text, 22)).toEqual({
      url: "https://two.test/b",
      start: 19,
      end: 37,
    });
    expect(visibleLinkAtOffset(text, 3, true, false)).toBeUndefined();
    expect(visibleLinkAtOffset(text, 22, false, true)).toBeUndefined();
  });

  it.each([
    ["See https://example.test/path, now", 8, "https://example.test/path"],
    ["[http://one.test/a]", 3, "http://one.test/a"],
    ["(https://example.test/a(b)c)", 3, "https://example.test/a"],
  ])("owns the expected punctuation span in %s", (text, offset, expected) => {
    expect(visibleLinkAtOffset(text, offset)?.url).toBe(expected);
  });

  it("preserves a long fully visible destination exactly", () => {
    const url = `https://example.test/${"a".repeat(2_100)}`;
    expect(visibleLinkAtOffset(url, 2_050)?.url).toBe(url);
  });

  it("recognizes literal absolute file URLs while excluding authorities and path-like guesses", () => {
    expect(
      visibleLinkAtOffset("open file:///tmp/image%20one.png now", 16)?.url,
    ).toBe("file:///tmp/image%20one.png");
    expect(visibleLinkAtOffset("file:///C:/Users/me/image.jpg", 8)?.url).toBe(
      "file:///C:/Users/me/image.jpg",
    );
    expect(visibleLinkAtOffset("file://server/share/a.png", 8)).toBeUndefined();
    expect(
      visibleLinkAtOffset("file:////server/share/a.png", 8),
    ).toBeUndefined();
    expect(visibleLinkAtOffset("/tmp/image.png", 3)).toBeUndefined();
    expect(visibleLinkAtOffset("image.png", 3)).toBeUndefined();
  });

  it("accepts only visible lowercase supported schemes", () => {
    expect(visibleLinkAtOffset("HTTP://upper.test", 3)).toBeUndefined();
    expect(visibleLinkAtOffset("HTTPS://upper.test", 3)).toBeUndefined();
    expect(visibleLinkAtOffset("FILE:///tmp/private", 3)).toBeUndefined();
    expect(visibleLinkAtOffset("http://lower.test", 3)?.url).toBe(
      "http://lower.test",
    );
  });
});
