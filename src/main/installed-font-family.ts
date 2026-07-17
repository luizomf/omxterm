import { execFile } from "node:child_process";
import { promisify } from "node:util";

const FONT_AVAILABILITY_SCRIPT = `
ObjC.import("AppKit");
const family = ObjC.unwrap($.NSProcessInfo.processInfo.arguments.lastObject);
const members = $.NSFontManager.sharedFontManager.availableMembersOfFontFamily(family);
if (members.isNil()) {
  "missing";
} else {
  const postScriptName = ObjC.unwrap(members.objectAtIndex(0).objectAtIndex(0));
  const font = $.NSFont.fontWithNameSize(postScriptName, 12);
  const installedFamily = font.isNil() ? null : ObjC.unwrap(font.familyName);
  installedFamily === family ? "available" : "missing";
}
`;

export type FontAvailabilityCommand = (
  file: string,
  arguments_: readonly string[],
) => Promise<{ readonly stdout: string }>;

const execFileAsync = promisify(execFile);

const runFontAvailabilityCommand: FontAvailabilityCommand = async (
  file,
  arguments_,
) =>
  execFileAsync(file, [...arguments_], {
    encoding: "utf8",
    maxBuffer: 1024,
    timeout: 2_000,
  });

export async function isInstalledFontFamilyAvailable(
  family: string,
  run: FontAvailabilityCommand = runFontAvailabilityCommand,
): Promise<boolean> {
  const { stdout } = await run("/usr/bin/osascript", [
    "-l",
    "JavaScript",
    "-e",
    FONT_AVAILABILITY_SCRIPT,
    family,
  ]);
  const result = stdout.trim();
  if (result === "available") return true;
  if (result === "missing") return false;
  throw new Error("Installed font family availability returned invalid data");
}
