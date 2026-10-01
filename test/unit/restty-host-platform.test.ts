import { expect, it } from "vitest";
import {
  defaultInputCommand,
  hasSelectionFixtureOutput,
  hasSelectionFixtureTranscript,
  selectionFixtureCommand,
} from "../fixtures/restty-host-platform";

it.each(["win32", "darwin", "linux"] as const)(
  "%s Unicode execution acknowledgement cannot be satisfied by command echo",
  (platform) => {
    const typed = defaultInputCommand(platform);
    expect(typed).toContain("Olá🙂");
    expect(typed).not.toContain("__DEFAULT_INPUT__Olá🙂");
  },
);

it("requires every generated row in order and a standalone exact Unicode record", () => {
  const records = [
    "__SELECT_ALL_FIRST__",
    "__UNICODE__A漢e\u0301❤️👩‍💻Z__END__",
    ...Array.from(
      { length: 120 },
      (_, row) => `line-${String(row).padStart(3, "0")}`,
    ),
    "__SELECT_ALL_LAST__",
  ];
  const complete = records.join("\n");
  expect(hasSelectionFixtureOutput(`\u001b[1G${complete}`)).toBe(true);
  expect(
    hasSelectionFixtureTranscript(`prompt\n${complete}\nnext prompt`),
  ).toBe(true);
  expect(hasSelectionFixtureTranscript(records.join("\r\n"))).toBe(true);
  for (const row of [2, 62, 121]) {
    expect(
      hasSelectionFixtureTranscript(
        records.filter((_, index) => index !== row).join("\n"),
      ),
    ).toBe(false);
  }
  const reordered = [...records];
  [reordered[62], reordered[63]] = [reordered[63]!, reordered[62]!];
  expect(hasSelectionFixtureTranscript(reordered.join("\n"))).toBe(false);
  expect(
    hasSelectionFixtureTranscript(
      complete.replace("__UNICODE__", "echo __UNICODE__"),
    ),
  ).toBe(false);
});

it.each(["win32", "darwin", "linux"] as const)(
  "%s command echo alone cannot establish selection readiness or copied transcript",
  (platform) => {
    const echo = selectionFixtureCommand(platform);
    expect(hasSelectionFixtureOutput(echo)).toBe(false);
    expect(hasSelectionFixtureTranscript(echo)).toBe(false);
    for (const record of [
      "__SELECT_ALL_FIRST__",
      "__UNICODE__A漢e\u0301❤️👩‍💻Z__END__",
      "__SELECT_ALL_LAST__",
    ]) {
      expect(echo).not.toContain(record);
    }
  },
);
