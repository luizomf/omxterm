import assert from "node:assert/strict";
import path from "node:path";

const prefix = "OMXTERM_SNIPPETS_WINDOWS_PUBLIC_";
export const PUBLIC_INSTALLER_SHA256 =
  "57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b";
export const PUBLIC_INSTALLER_BYTES = 155_134_581;
export const PUBLIC_VERSION = "0.24.0-dev.36";

const names = [
  "STAGE",
  "INSTALLER",
  "INSTALLER_SHA256",
  "ARCHIVE",
  "VERSION",
  "EVIDENCE",
  "DISPOSABLE_VM",
] as const;

export function windowsPublicInputs(env: NodeJS.ProcessEnv = process.env) {
  const keys = Object.keys(env).filter((key) => env[key] !== undefined);
  if (!keys.some((key) => key.startsWith(prefix))) return undefined;
  for (const key of keys.filter((item) => item.startsWith(prefix)))
    assert.ok(
      names.some((name) => key === prefix + name),
      `Unknown public input: ${key}`,
    );
  assert.ok(
    !keys.some(
      (key) =>
        (/^OMXTERM_SNIPPETS_WINDOWS_/.test(key) && !key.startsWith(prefix)) ||
        /^OMXTERM_SNIPPETS_(PACKAGED|APPIMAGE|DMG)_/.test(key),
    ),
    "Choose one Snippets adapter",
  );
  const values = Object.fromEntries(
    names.map((name) => {
      const value = env[prefix + name];
      assert.ok(value, `${prefix}${name} is required`);
      return [name, value];
    }),
  ) as Record<(typeof names)[number], string>;
  for (const name of ["STAGE", "INSTALLER", "ARCHIVE", "EVIDENCE"] as const)
    assert.ok(path.isAbsolute(values[name]), `${name} must be absolute`);
  assert.equal(values.INSTALLER_SHA256, PUBLIC_INSTALLER_SHA256);
  assert.equal(values.VERSION, PUBLIC_VERSION);
  assert.equal(
    values.DISPOSABLE_VM,
    "1",
    "Explicit disposable VM opt-in required",
  );
  return values;
}
