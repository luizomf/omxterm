import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const prefix = "OMXTERM_SNIPPETS_APPIMAGE_";

// Keep the packaged process clear of the source checkout's Node/npm paths and
// startup overrides. Its real account shell still needs ordinary system tools.
export function appImageEnvironment(root: string, inherited = process.env) {
  const env: NodeJS.ProcessEnv = {
    HOME: path.join(root, "home"),
    PATH: `${path.join(root, "bin")}:/usr/bin:/bin`,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    XDG_DATA_HOME: path.join(root, "data"),
  };
  for (const key of [
    "DISPLAY",
    "XAUTHORITY",
    "DBUS_SESSION_BUS_ADDRESS",
    "XDG_RUNTIME_DIR",
    "LANG",
    "USER",
    "LOGNAME",
  ])
    if (inherited[key]) env[key] = inherited[key];
  return env;
}
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
        /^(OMXTERM_SNIPPETS_PACKAGED_|OMXTERM_SNIPPETS_DMG_|OMXTERM_SNIPPETS_WINDOWS_)/.test(
          key,
        ) && env[key] !== undefined,
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
  const publicUpdate = env[prefix + "PUBLIC_UPDATE"];
  assert.ok(
    publicUpdate === undefined || publicUpdate === "1",
    "PUBLIC_UPDATE must be 1 or absent",
  );
  if (publicUpdate) {
    assert.equal(process.arch, "arm64", "public update requires Linux ARM64");
    assert.equal(values.VERSION, "0.25.0");
    assert.equal(
      values.APPIMAGE_SHA256,
      "78ba5335d2f10dda7777d8e0e65a09bdaff355a69978aac8582499130c3b9ccd",
    );
    assert.equal(
      values.ARCHIVE_SHA256,
      "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
    );
    const target = env[prefix + "TARGET_ARCHIVE"];
    const catalogSha256 = env[prefix + "CATALOG_SHA256"];
    assert.ok(
      target && path.isAbsolute(target),
      "TARGET_ARCHIVE must be absolute",
    );
    assert.match(
      catalogSha256 ?? "",
      /^[a-f0-9]{64}$/,
      "CATALOG_SHA256 required",
    );
    return {
      ...values,
      publicUpdate: true as const,
      targetArchive: target,
      catalogSha256: catalogSha256!,
      input:
        "synthetic Chromium/X11; controlled consent; production Linux ARM64 public update",
    };
  }
  assert.equal(
    env[prefix + "TARGET_ARCHIVE"],
    undefined,
    "target archive requires PUBLIC_UPDATE",
  );
  assert.equal(
    env[prefix + "CATALOG_SHA256"],
    undefined,
    "catalog digest requires PUBLIC_UPDATE",
  );
  return {
    ...values,
    publicUpdate: false as const,
    input: `synthetic Chromium/X11; controlled native consent; production Linux ${process.arch === "arm64" ? "ARM64" : "x64"} composition`,
  };
}
