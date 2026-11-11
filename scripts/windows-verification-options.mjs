export const disposableVmFlag = "--disposable-vm-allow-omxterm-replacement";

export function windowsVerificationOptions(args, platform = process.platform) {
  const options = { windowsUnpackedOnly: false, disposableVm: false };
  let inspectionOnly = false;
  let release = false;
  for (const argument of args) {
    if (argument === "--inspection-only" && !inspectionOnly) {
      inspectionOnly = true;
      continue;
    }
    // macOS release verification requires the stable release certificate.
    if (argument === "--release" && !release) {
      if (platform !== "darwin")
        throw new Error("--release verification requires macOS");
      release = true;
      continue;
    }
    if (platform !== "win32")
      throw new Error("Windows verification options require Windows");
    if (argument === disposableVmFlag && !options.disposableVm)
      options.disposableVm = true;
    else if (
      argument === "--windows-unpacked-only" &&
      !options.windowsUnpackedOnly
    )
      options.windowsUnpackedOnly = true;
    else throw new Error("Unknown or duplicate package verification option");
  }
  if (inspectionOnly && (options.disposableVm || options.windowsUnpackedOnly))
    throw new Error("Inspection-only cannot authorize startup or installation");
  if (options.windowsUnpackedOnly && options.disposableVm)
    throw new Error(
      "Unpacked diagnostics cannot authorize installer replacement",
    );
  return {
    ...options,
    ...(inspectionOnly ? { inspectionOnly } : {}),
    ...(release ? { release } : {}),
  };
}
