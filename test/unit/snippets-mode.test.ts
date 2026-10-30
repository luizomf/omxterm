import { expect, it } from "vitest";
import { usesOptionalSnippets } from "../../src/shared/snippets-mode";

it.each([
  ["linux", "arm64", true],
  ["linux", "x64", false],
  ["linux", "arm", false],
  ["darwin", "arm64", false],
  ["darwin", "x64", false],
  ["win32", "arm64", false],
  ["win32", "x64", false],
  ["freebsd", "arm64", false],
  ["Linux", "arm64", false],
  ["linux", "ARM64", false],
] as const)(
  "optional Snippets on %s/%s is %s",
  (platform, architecture, expected) => {
    expect(usesOptionalSnippets(platform, architecture)).toBe(expected);
  },
);
