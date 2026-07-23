import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const FONT_METRICS_SCRIPT = `
ObjC.import("AppKit");
const arguments = $.NSProcessInfo.processInfo.arguments;
const family = ObjC.unwrap(arguments.objectAtIndex(arguments.count - 2));
const size = Number(ObjC.unwrap(arguments.lastObject));
const manager = $.NSFontManager.sharedFontManager;
const members = manager.availableMembersOfFontFamily(family);
if (members.isNil()) {
  JSON.stringify({ status: "missing" });
} else {
  const regularFontManagerWeight = 5;
  let font = manager.fontWithFamilyTraitsWeightSize(
    family,
    0,
    regularFontManagerWeight,
    size,
  );
  if (font.isNil()) {
    const postScriptName = ObjC.unwrap(members.objectAtIndex(0).objectAtIndex(0));
    font = $.NSFont.fontWithNameSize(postScriptName, size);
  }
  const installedFamily = font.isNil() ? null : ObjC.unwrap(font.familyName);
  if (installedFamily !== family) {
    JSON.stringify({ status: "missing" });
  } else {
    const attributes = $.NSDictionary.dictionaryWithObjectForKey(
      font,
      $.NSFontAttributeName,
    );
    // xterm measures W's advance and the font's typographic envelope.
    const cellWidth = Number($("W").sizeWithAttributes(attributes).width);
    const typographicHeight = font.ascender - font.descender + Math.max(0, font.leading);
    const cellHeight = Number(typographicHeight);
    JSON.stringify({ status: "available", cellWidth, cellHeight });
  }
}
`;

// The family travels through the environment instead of the command line so
// no PowerShell quoting or escaping ever applies to its characters.
const WINDOWS_FONT_SCRIPT = `
Add-Type -AssemblyName System.Drawing
$family = $env:OMXTERM_FONT_FAMILY
$families = (New-Object System.Drawing.Text.InstalledFontCollection).Families
if ($families | Where-Object { $_.Name -ceq $family }) { 'installed' } else { 'missing' }
`;

export interface InstalledFontFamilyMetrics {
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface FontMetricsCommandOptions {
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
}

export type FontMetricsCommand = (
  file: string,
  arguments_: readonly string[],
  options?: FontMetricsCommandOptions,
) => Promise<{ readonly stdout: string }>;

const execFileAsync = promisify(execFile);

const runFontMetricsCommand: FontMetricsCommand = async (
  file,
  arguments_,
  options,
) =>
  execFileAsync(file, [...arguments_], {
    encoding: "utf8",
    maxBuffer: 1024,
    timeout: options?.timeoutMs ?? 2_000,
    ...(options?.environment
      ? { env: { ...process.env, ...options.environment } }
      : {}),
  });

export async function installedFontFamilyMetrics(
  family: string,
  fontSize: number,
  run: FontMetricsCommand = runFontMetricsCommand,
  platform: string = process.platform,
): Promise<InstalledFontFamilyMetrics | undefined> {
  if (platform === "linux") {
    const { stdout } = await run("/usr/bin/fc-match", [
      "--format=%{family}\\n",
      "--",
      family,
    ]);
    const installedFamilies = stdout
      .trim()
      .split(",")
      .map((value) => value.trim());
    if (!installedFamilies.includes(family)) return undefined;
    return Object.freeze({
      // fontconfig establishes exact family availability; Chromium measures
      // the real cells when the Terminal Surface mounts. These conservative
      // values are used only for native minimum-window sizing before mount.
      cellWidth: fontSize * 0.6,
      cellHeight: fontSize * 1.2,
    });
  }

  if (platform === "win32") {
    // GDI+ establishes exact family availability; Chromium measures the real
    // cells when the Terminal Surface mounts, mirroring the Linux probe. The
    // longer timeout absorbs Windows PowerShell's cold start.
    const { stdout } = await run(
      path.join(
        process.env["SystemRoot"] ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FONT_SCRIPT],
      { timeoutMs: 10_000, environment: { OMXTERM_FONT_FAMILY: family } },
    );
    const status = stdout.trim();
    if (status === "missing") return undefined;
    if (status !== "installed") throw invalidFontMetrics();
    return Object.freeze({
      cellWidth: fontSize * 0.6,
      cellHeight: fontSize * 1.2,
    });
  }

  const { stdout } = await run("/usr/bin/osascript", [
    "-l",
    "JavaScript",
    "-e",
    FONT_METRICS_SCRIPT,
    family,
    String(fontSize),
  ]);
  let result: unknown;
  try {
    result = JSON.parse(stdout) as unknown;
  } catch {
    throw invalidFontMetrics();
  }
  if (isMissingResult(result)) return undefined;
  if (isAvailableResult(result))
    return Object.freeze({
      cellWidth: result.cellWidth,
      cellHeight: result.cellHeight,
    });
  throw invalidFontMetrics();
}

function isMissingResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["status"]) &&
    value.status === "missing"
  );
}

function isAvailableResult(
  value: unknown,
): value is InstalledFontFamilyMetrics & { readonly status: "available" } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["status", "cellWidth", "cellHeight"]) &&
    value.status === "available" &&
    isPositiveFiniteNumber(value.cellWidth) &&
    isPositiveFiniteNumber(value.cellHeight)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function invalidFontMetrics(): Error {
  return new Error("Installed font family metrics returned invalid data");
}
