import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const dependencyPath =
  require.resolve("app-builder-lib/out/targets/appimage/appImageUtil.js");
const originalDigest =
  "4d3b63afc9939ace718e0b3537e2b1508c15fde7fd030206cbe207bcb6a8f030";
const correctedDigest =
  "5aa80a572c24cf4cff5b5ca6640770f739ec0ec9dde98aee783398e8216fa27a";
const digest = (source) => createHash("sha256").update(source).digest("hex");

// app-builder-lib 26.15.3 has no launcher override. Correct this exact build
// input before loading electron-builder, never an already-built artifact.
// Unknown dependency bytes require a new review, not a best-effort patch.
// Tests pass a fixture-owned copy; production prepares the installed dependency.
export async function prepareLinuxLauncher(targetPath = dependencyPath) {
  const source = await readFile(targetPath, "utf8");
  if (digest(source) === correctedDigest) return;
  if (digest(source) !== originalDigest)
    throw new Error(
      "Unrecognized AppImage generator; review the pinned launcher correction",
    );
  const start = source.indexOf("HAVE_NO_SANDBOX=0\n");
  const end = source.indexOf("\natexit()\n", start);
  const corrected = (
    source.slice(0, start) +
    "# OMXTerm deliberately disables the Chromium sandbox on Linux.\n" +
    source.slice(end)
  ).replaceAll(' "\\${NO_SANDBOX[@]}"', " --no-sandbox");
  if (digest(corrected) !== correctedDigest)
    throw new Error(
      "AppImage generator correction did not match reviewed bytes",
    );
  await writeFile(targetPath, corrected);
}

// Also guard direct electron-builder invocations that bypass package:linux.
export default async function verifyLinuxLauncherPreparation(context) {
  if (context.electronPlatformName !== "linux") return;
  if (digest(await readFile(dependencyPath)) !== correctedDigest)
    throw new Error(
      "Linux launcher is not prepared; run npm run package:linux",
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareLinuxLauncher();
