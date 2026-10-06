import { afterEach, expect, it, vi } from "vitest";
import {
  defaultInputCommand,
  explicitFixtureLaunchRequest,
  hasSelectionFixtureOutput,
  hasSelectionFixtureTranscript,
  selectionFixtureCommand,
  selectionFixtureReset,
} from "../fixtures/restty-host-platform";

afterEach(() => vi.unstubAllGlobals());

it.each(["darwin", "linux"] as const)(
  "%s owned explicit child disables echo before readiness and retains its Unicode read/ack",
  (platform) => {
    vi.stubGlobal("process", { ...process, platform });
    const request = explicitFixtureLaunchRequest();
    if (request.kind !== "explicit-command")
      throw new Error("Expected owned explicit child");
    expect(request.executable).toBe("/bin/sh");
    expect(request.arguments[0]).toBe("-c");
    const script = request.arguments[1]!;
    expect(script).toMatch(
      /^stty -echo \|\| exit 1; printf '__EXPLICIT_READY__/u,
    );
    expect(script).toContain(
      "IFS= read -r line; printf '__EXPLICIT_INPUT__%s\\n' \"$line\"; IFS= read -r keepAlive",
    );
  },
);

it("Windows preserves its Unicode line acknowledgement then owns an intercepting key consumer", () => {
  vi.stubGlobal("process", { ...process, platform: "win32" });
  const request = explicitFixtureLaunchRequest();
  if (request.kind !== "explicit-command")
    throw new Error("Expected owned explicit child");
  expect(request.arguments.slice(0, 3)).toEqual([
    "-NoLogo",
    "-NoProfile",
    "-Command",
  ]);
  const script = request.arguments[3]!;
  expect(script).toContain(
    "$line=[Console]::ReadLine(); [Console]::WriteLine('__EXPLICIT_INPUT__'+$line);",
  );
  expect(script).toMatch(
    /while \(\$true\) \{ \[Console\]::ReadKey\(\$true\) \| Out-Null \}$/u,
  );
  expect(script.split("__EXPLICIT_INPUT__")[1]).not.toContain("ReadLine");
  expect(script).not.toContain("stty");
});

it.each(["win32", "darwin", "linux"] as const)(
  "%s Unicode execution acknowledgement cannot be satisfied by command echo",
  (platform) => {
    const typed = defaultInputCommand(platform);
    expect(typed).toContain("Olá🙂");
    expect(typed).not.toContain("__DEFAULT_INPUT__Olá🙂");
  },
);

it.each(["darwin", "linux"] as const)(
  "%s clears pending selection input without asynchronously interrupting the shell",
  (platform) => {
    expect(selectionFixtureReset(platform)).toBe("\u0015");
  },
);

it("preserves the owned PowerShell selection reset", () => {
  expect(selectionFixtureReset("win32")).toBe("\u0003");
});

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
