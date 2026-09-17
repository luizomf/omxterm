import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { MAX_TERMINAL_FONT_BYTES } from "../shared/terminal-font-data";

const MACOS_FONT_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("CoreText");
const arguments = $.NSProcessInfo.processInfo.arguments;
const family = ObjC.unwrap(arguments.objectAtIndex(arguments.count - 2));
const size = Number(ObjC.unwrap(arguments.lastObject));
const manager = $.NSFontManager.sharedFontManager;
const members = manager.availableMembersOfFontFamily(family);
if (members.isNil()) {
  JSON.stringify({ status: "missing" });
} else {
  const regularWeight = 5;
  const font = manager.fontWithFamilyTraitsWeightSize(family, 0, regularWeight, size);
  const installedFamily = font.isNil() ? null : ObjC.unwrap(font.familyName);
  const traits = font.isNil() ? 0 : Number(manager.traitsOfFont(font));
  const boldOrItalic = (traits & 3) !== 0;
  const descriptor = font.isNil() ? null : font.fontDescriptor;
  const url = descriptor ? $.CTFontDescriptorCopyAttribute(descriptor, $.kCTFontURLAttribute) : null;
  if (installedFamily !== family || boldOrItalic || !url || url.isNil()) {
    JSON.stringify({ status: "missing-regular" });
  } else {
    const attributes = $.NSDictionary.dictionaryWithObjectForKey(font, $.NSFontAttributeName);
    const cellWidth = Number($("W").sizeWithAttributes(attributes).width);
    const cellHeight = Number(font.ascender - font.descender + Math.max(0, font.leading));
    JSON.stringify({ status: "available", family: installedFamily, path: ObjC.unwrap(url.path), cellWidth, cellHeight });
  }
}
`;

// Family input travels through the environment. The fixed script invokes no
// shell and never interpolates renderer- or configuration-controlled text.
const WINDOWS_FONT_SCRIPT = `
Add-Type -AssemblyName System.Drawing
$family = $env:OMXTERM_FONT_FAMILY
$installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families |
  Where-Object { $_.Name -ceq $family -and $_.IsStyleAvailable([System.Drawing.FontStyle]::Regular) }
if (-not $installed) { @{ status = 'missing' } | ConvertTo-Json -Compress; exit }
$roots = @(
  @{ Key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; Directory = Join-Path $env:WINDIR 'Fonts' },
  @{ Key = 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; Directory = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts' }
)
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root.Key)) { continue }
  $properties = Get-ItemProperty -LiteralPath $root.Key
  foreach ($property in $properties.PSObject.Properties) {
    if ($property.Name -like 'PS*' -or $property.Value -isnot [string]) { continue }
    $candidate = $property.Value
    if (-not [IO.Path]::IsPathRooted($candidate)) { $candidate = Join-Path $root.Directory $candidate }
    $collection = $null
    try {
      $collection = New-Object System.Drawing.Text.PrivateFontCollection
      $collection.AddFontFile($candidate)
      $match = $collection.Families | Where-Object {
        $_.Name -ceq $family -and $_.IsStyleAvailable([System.Drawing.FontStyle]::Regular)
      }
      if ($match) { @{ status = 'available'; family = $family; path = $candidate } | ConvertTo-Json -Compress; exit }
    } catch {} finally { if ($collection) { $collection.Dispose() } }
  }
}
@{ status = 'missing-regular' } | ConvertTo-Json -Compress
`;

export interface InstalledFontFamilyMetrics {
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface InstalledFontFace extends InstalledFontFamilyMetrics {
  readonly family: string;
  readonly path: string;
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
    maxBuffer: 16_384,
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
  readFace: (
    face: InstalledFontFace,
  ) => Promise<Uint8Array> = readInstalledFontFace,
): Promise<InstalledFontFamilyMetrics | undefined> {
  const face = await resolveInstalledFontFace(family, fontSize, run, platform);
  if (!face) return undefined;
  // Validation includes a bounded readable-font check. Bytes are discarded;
  // the active-family IPC rereads them on demand and keeps no main cache.
  await readFace(face);
  return Object.freeze({
    cellWidth: face.cellWidth,
    cellHeight: face.cellHeight,
  });
}

export async function installedFontData(
  family: string,
  run: FontMetricsCommand = runFontMetricsCommand,
  platform: string = process.platform,
): Promise<Uint8Array | undefined> {
  const face = await resolveInstalledFontFace(family, 16, run, platform);
  return face ? readInstalledFontFace(face) : undefined;
}

export async function installedFallbackFontData(
  run: FontMetricsCommand = runFontMetricsCommand,
  platform: string = process.platform,
): Promise<readonly { readonly family: string; readonly data: Uint8Array }[]> {
  const candidates =
    platform === "darwin"
      ? ["Apple Color Emoji", "Hiragino Sans GB", "Apple Symbols"]
      : platform === "win32"
        ? ["Segoe UI Emoji", "Microsoft YaHei UI", "Segoe UI Symbol"]
        : ["Noto Color Emoji", "Noto Sans CJK SC", "DejaVu Sans Mono"];
  const loaded = [];
  for (const family of candidates) {
    try {
      const data = await installedFontData(family, run, platform);
      if (data) loaded.push(Object.freeze({ family, data }));
    } catch {
      // OS fallbacks are best-effort additions after the licensed bundled face.
    }
  }
  return Object.freeze(loaded);
}

async function resolveInstalledFontFace(
  family: string,
  fontSize: number,
  run: FontMetricsCommand,
  platform: string,
): Promise<InstalledFontFace | undefined> {
  if (platform === "linux") {
    const { stdout } = await run("/usr/bin/fc-match", [
      "--format=%{family}\\0%{weight}\\0%{slant}\\0%{file}\\n",
      "--",
      `${family}:style=Regular`,
    ]);
    const [installedFamilies, weight, slant, file, extra] = stdout
      .trimEnd()
      .split("\0");
    if (
      extra !== undefined ||
      !installedFamilies
        ?.split(",")
        .map((value) => value.trim())
        .includes(family)
    )
      return undefined;
    if (!(["75", "80"].includes(weight ?? "") && slant === "0") || !file)
      return undefined;
    return Object.freeze({
      family,
      path: file,
      cellWidth: fontSize * 0.6,
      cellHeight: fontSize * 1.2,
    });
  }

  const { stdout } =
    platform === "win32"
      ? await run(
          path.join(
            process.env["SystemRoot"] ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FONT_SCRIPT],
          { timeoutMs: 10_000, environment: { OMXTERM_FONT_FAMILY: family } },
        )
      : await run("/usr/bin/osascript", [
          "-l",
          "JavaScript",
          "-e",
          MACOS_FONT_SCRIPT,
          family,
          String(fontSize),
        ]);
  let result: unknown;
  try {
    result = JSON.parse(stdout) as unknown;
  } catch {
    throw invalidFontResult();
  }
  if (isStatus(result, "missing") || isStatus(result, "missing-regular"))
    return undefined;
  if (!isAvailableResult(result, platform)) throw invalidFontResult();
  return Object.freeze({
    family: result.family,
    path: result.path,
    cellWidth: platform === "win32" ? fontSize * 0.6 : result.cellWidth,
    cellHeight: platform === "win32" ? fontSize * 1.2 : result.cellHeight,
  });
}

export async function readInstalledFontFace(
  face: InstalledFontFace,
): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(face.path, "r");
    const info = await handle.stat();
    if (!info.isFile())
      throw new Error("the selected font face is not a regular file");
    if (info.size <= 0 || info.size > MAX_TERMINAL_FONT_BYTES)
      throw new Error(
        `the selected font face exceeds the ${MAX_TERMINAL_FONT_BYTES}-byte limit`,
      );
    const bytes = new Uint8Array(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead === 0)
        throw new Error(
          "the selected font face ended before its declared size",
        );
      offset += bytesRead;
    }
    if (!hasSupportedSfntSignature(bytes))
      throw new Error(
        "the selected font face has an unsupported or corrupt format",
      );
    return bytes;
  } catch (cause) {
    const detail =
      cause instanceof Error ? cause.message : "unknown read failure";
    throw new Error(
      `Installed font family ${JSON.stringify(face.family)} could not be read: ${detail}`,
    );
  } finally {
    await handle?.close();
  }
}

function hasSupportedSfntSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  return (
    signature === "OTTO" ||
    signature === "ttcf" ||
    signature === "true" ||
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
  );
}

function isStatus(value: unknown, status: string): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    value.status === status
  );
}

function isAvailableResult(
  value: unknown,
  platform: string,
): value is {
  readonly status: "available";
  readonly family: string;
  readonly path: string;
  readonly cellWidth: number;
  readonly cellHeight: number;
} {
  if (
    !isRecord(value) ||
    value.status !== "available" ||
    typeof value.family !== "string" ||
    typeof value.path !== "string" ||
    value.path.length === 0
  )
    return false;
  const expected =
    platform === "win32"
      ? ["status", "family", "path"]
      : ["status", "family", "path", "cellWidth", "cellHeight"];
  return (
    Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key)) &&
    (platform === "win32" ||
      (isPositiveFiniteNumber(value.cellWidth) &&
        isPositiveFiniteNumber(value.cellHeight)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function invalidFontResult(): Error {
  return new Error("Installed font family lookup returned invalid data");
}
