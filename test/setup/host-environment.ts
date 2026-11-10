import path from "node:path";

// Contributors often run the suite inside OMXTerm itself. A packaged Linux
// OMXTerm runs from an AppImage whose runtime variables and mount paths reach
// its shells (see #609); keep them away from the Electron and PTY children
// these tests launch so the host terminal cannot change their behavior.
const appDir = process.env.APPDIR;
for (const name of ["APPIMAGE", "APPDIR", "ARGV0", "OWD", "CHROME_DESKTOP"])
  delete process.env[name];
if (appDir)
  for (const name of ["PATH", "LD_LIBRARY_PATH"]) {
    const kept = (process.env[name] ?? "")
      .split(path.delimiter)
      .filter(
        (entry) =>
          entry && !`${entry}${path.sep}`.startsWith(`${appDir}${path.sep}`),
      );
    if (kept.length) process.env[name] = kept.join(path.delimiter);
    else delete process.env[name];
  }
