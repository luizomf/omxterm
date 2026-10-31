import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const prefix = "OMXTERM_SNIPPETS_APPIMAGE_";
const names = [
  "APPIMAGE",
  "ARCHIVE",
  "APPIMAGE_SHA256",
  "ARCHIVE_SHA256",
  "VERSION",
  "EVIDENCE",
] as const;

export function appImageInputs(env = process.env) {
  if (
    !Object.keys(env).some(
      (key) => key.startsWith(prefix) && env[key] !== undefined,
    )
  )
    return undefined;
  assert.ok(
    !Object.keys(env).some(
      (key) =>
        /^(OMXTERM_SNIPPETS_PACKAGED_|OMXTERM_SNIPPETS_DMG_)/.test(key) &&
        env[key] !== undefined,
    ),
    "Choose one Snippets adapter",
  );
  assert.equal(process.platform, "linux");
  assert.ok(["arm64", "x64"].includes(process.arch));
  assert.notEqual(process.getuid?.(), 0);
  const values = Object.fromEntries(
    names.map((name) => {
      const value = env[prefix + name];
      assert.ok(value, `${prefix}${name} is required`);
      return [name, value];
    }),
  ) as Record<(typeof names)[number], string>;
  for (const name of ["APPIMAGE", "ARCHIVE", "EVIDENCE"] as const)
    assert.ok(path.isAbsolute(values[name]), `${name} must be absolute`);
  for (const name of ["APPIMAGE_SHA256", "ARCHIVE_SHA256"] as const)
    assert.match(values[name], /^[a-f0-9]{64}$/);
  // New Tab uses the real account shell, not HOME or an overridden policy.
  assert.ok(
    ["/bin/sh", "/usr/bin/sh", "/bin/bash", "/usr/bin/bash"].includes(
      os.userInfo().shell ?? "",
    ),
    "Prepared guest needs a POSIX sh/bash account shell",
  );
  return {
    ...values,
    input: `synthetic Chromium/X11; controlled native consent; production Linux ${process.arch === "arm64" ? "ARM64" : "x64"} composition`,
  };
}
