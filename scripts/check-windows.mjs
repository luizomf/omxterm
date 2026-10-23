import { spawnSync } from "node:child_process";
import { windowsVerificationOptions } from "./windows-verification-options.mjs";

const args = process.argv.slice(2);
const options = windowsVerificationOptions(args);
if (
  process.platform !== "win32" ||
  (process.arch !== "arm64" && process.arch !== "x64")
)
  throw new Error("check:win requires native Windows arm64 or x64");
if (options.windowsUnpackedOnly)
  throw new Error(
    "check:win requires exact installer verification; use package:verify -- --windows-unpacked-only for partial diagnostics",
  );
// Use npm's actual JS entrypoint, never interpolate a command for npm.cmd.
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this command through npm run check:win");
for (const script of [
  "check:portable",
  "package-built:win",
  "package:verify",
]) {
  const result = spawnSync(
    process.execPath,
    [
      npm,
      "run",
      script,
      ...(script === "package:verify" && args.length ? ["--", ...args] : []),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
