import { execFile } from "node:child_process";
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

export interface InstalledFontFamilyMetrics {
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export type FontMetricsCommand = (
  file: string,
  arguments_: readonly string[],
) => Promise<{ readonly stdout: string }>;

const execFileAsync = promisify(execFile);

const runFontMetricsCommand: FontMetricsCommand = async (file, arguments_) =>
  execFileAsync(file, [...arguments_], {
    encoding: "utf8",
    maxBuffer: 1024,
    timeout: 2_000,
  });

export async function installedFontFamilyMetrics(
  family: string,
  fontSize: number,
  run: FontMetricsCommand = runFontMetricsCommand,
): Promise<InstalledFontFamilyMetrics | undefined> {
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
