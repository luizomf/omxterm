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
  defaultInputCommand:
    process.platform === "win32"
      ? "Write-Output '__DEFAULT_INPUT__Olá🙂'"
      : "printf '__DEFAULT_INPUT__Olá🙂\\n'",
});

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

export function selectionFixtureCommand(): string {
  if (process.platform !== "win32")
    return `printf '__SELECT_ALL_FIRST__\\n__UNICODE__A漢é❤️👩‍💻Z__END__\\n'; i=0; while [ "$i" -lt 120 ]; do printf 'line-%03d\\n' "$i"; i=$((i+1)); done; printf '__SELECT_ALL_LAST__\\n'\r`;
  const lines = Array.from(
    { length: 120 },
    (_, index) => `line-${index.toString().padStart(3, "0")}`,
  );
  return `Write-Output '__SELECT_ALL_FIRST__'; Write-Output '__UNICODE__A漢é❤️👩‍💻Z__END__'; ${lines.map((line) => `Write-Output '${line}'`).join("; ")}; Write-Output '__SELECT_ALL_LAST__'\r`;
}
