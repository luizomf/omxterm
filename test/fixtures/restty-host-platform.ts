import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LaunchRequest } from "../../src/main/launch-request";

const windowsPowerShell = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

export const nativeFixturePlatform = Object.freeze({
  defaultShell: process.platform === "win32" ? windowsPowerShell : "/bin/sh",
  configuredFontFamily:
    process.platform === "darwin"
      ? "Helvetica"
      : process.platform === "win32"
        ? "Consolas"
        : "DejaVu Sans",
  reloadedFontFamily:
    process.platform === "darwin"
      ? "Times New Roman"
      : process.platform === "win32"
        ? "Courier New"
        : "Liberation Mono",
});

export function defaultInputCommand(
  platform: NodeJS.Platform = process.platform,
) {
  // Keep Unicode literal on the input route, but require execution to join the
  // marker: an echoed command alone must never satisfy the output predicate.
  return platform === "win32"
    ? "Write-Output ('__DEFAULT_INPUT__'+'Olá🙂')"
    : "printf '%s%s\\n' '__DEFAULT_INPUT__' 'Olá🙂'";
}

export function prepareFixtureShell(root: string) {
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  if (process.platform === "linux") {
    // Select this fixture's Protected Paste branch, not Readline bracketed paste.
    environment.INPUTRC = path.join(home, ".inputrc");
    writeFileSync(environment.INPUTRC, "set enable-bracketed-paste off\n");
    // Global login startup can otherwise emit unrelated prompt titles.
    writeFileSync(path.join(home, ".profile"), "unset PROMPT_COMMAND\n");
  }
  return { home, environment };
}

export function explicitFixtureLaunchRequest(): LaunchRequest {
  const payload =
    "__EXPLICIT_READY__Olá🙂\n\u001b]2;second-title\u0007\u0007\u001b]52;c;dW5zYWZl\u0007\u001b]8;;https://example.com\u0007https://example.com\u001b]8;;\u0007";
  if (process.platform === "win32") {
    const encoded = Buffer.from(payload).toString("base64");
    return {
      kind: "explicit-command",
      executable: windowsPowerShell,
      arguments: [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        `[Console]::InputEncoding=[Text.UTF8Encoding]::new(); [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $bytes=[Convert]::FromBase64String('${encoded}'); [Console]::OpenStandardOutput().Write($bytes,0,$bytes.Length); $line=[Console]::ReadLine(); [Console]::WriteLine('__EXPLICIT_INPUT__'+$line); [Console]::ReadLine() | Out-Null`,
      ],
    };
  }
  return {
    kind: "explicit-command",
    executable: "/bin/sh",
    arguments: [
      "-c",
      "printf '__EXPLICIT_READY__Olá🙂\\n\\033]2;second-title\\007\\007\\033]52;c;dW5zYWZl\\007\\033]8;;https://example.com\\007https://example.com\\033]8;;\\007'; IFS= read -r line; printf '__EXPLICIT_INPUT__%s\\n' \"$line\"; IFS= read -r keepAlive",
    ],
  };
}

const selectionFixtureTranscript = [
  "__SELECT_ALL_FIRST__",
  "__UNICODE__A漢e\u0301❤️👩‍💻Z__END__",
  ...Array.from(
    { length: 120 },
    (_, index) => `line-${index.toString().padStart(3, "0")}`,
  ),
  "__SELECT_ALL_LAST__",
].join("\n");

export function hasSelectionFixtureTranscript(text: string): boolean {
  // PTYs use CRLF; copied text uses LF. Preserve all other text and require
  // standalone records, including every numbered row in one ordered block.
  return `\n${text.replace(/\r\n/gu, "\n")}\n`.includes(
    `\n${selectionFixtureTranscript}\n`,
  );
}

export function selectionFixtureCommand(
  platform: NodeJS.Platform = process.platform,
): string {
  // Execution joins each record; none occurs contiguously in command echo.
  if (platform !== "win32")
    return `printf '%s%s\\n' '__SELECT_ALL_' 'FIRST__'; printf '%s%s%s\\n' '__UNICODE__' 'A漢é❤️👩‍💻Z' '__END__'; i=0; while [ "$i" -lt 120 ]; do printf 'line-%03d\\n' "$i"; i=$((i+1)); done; printf '%s%s\\n' '__SELECT_ALL_' 'LAST__'\r`;
  return `Write-Output ('__SELECT_ALL_'+'FIRST__'); Write-Output ('__UNICODE__'+'A漢é❤️👩‍💻Z'+'__END__'); for ($i=0; $i -lt 120; $i++) { Write-Output ('line-{0:D3}' -f $i) }; Write-Output ('__SELECT_ALL_'+'LAST__')\r`;
}
