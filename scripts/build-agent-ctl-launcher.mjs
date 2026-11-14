import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { resolveMsvcEnvironment } from "./windows-msvc-environment.mjs";

const source = path.resolve(
  import.meta.dirname,
  "../native/omxterm-ctl-windows.c",
);

// omxterm-ctl.exe, the agent client's console launcher on Windows (ADR 0052),
// for this machine's architecture. The same MSVC route as the extension
// runtime; /MT needs no Visual C++ Redistributable and /Brepro makes the same
// source and compiler give the same bytes.
export async function buildAgentCtlLauncher(outputDirectory) {
  const { arch } = process;
  if (arch !== "arm64" && arch !== "x64")
    throw new Error("The Windows agent launcher needs ARM64 or x64");
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const object = path.join(output, "omxterm-ctl-windows.obj");
  execFileSync(
    "cl.exe",
    [
      "/nologo",
      "/O1",
      "/MT",
      "/W4",
      "/WX",
      "/Brepro",
      "/DUNICODE",
      "/D_UNICODE",
      source,
      `/Fo${object}`,
      "/link",
      "/WX",
      "/Brepro",
      "/SUBSYSTEM:CONSOLE",
      `/MACHINE:${arch === "arm64" ? "ARM64" : "X64"}`,
      `/OUT:${path.join(output, "omxterm-ctl.exe")}`,
    ],
    {
      stdio: "pipe",
      timeout: 60_000,
      env: resolveMsvcEnvironment() ?? process.env,
      cwd: output,
    },
  );
  await rm(object, { force: true });
}
