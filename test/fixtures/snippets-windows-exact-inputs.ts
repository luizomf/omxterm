import assert from "node:assert/strict";
import path from "node:path";

const prefix = "OMXTERM_SNIPPETS_WINDOWS_";
const names = [
  "STAGE",
  "INSTALLER",
  "INSTALLER_SHA256",
  "ARCHIVE",
  "VERSION",
  "EVIDENCE",
] as const;

export function windowsExactInputs(env: NodeJS.ProcessEnv = process.env) {
  if (
    !Object.keys(env).some(
      (key) =>
        key.startsWith(prefix) &&
        !key.startsWith(`${prefix}PUBLIC_`) &&
        env[key] !== undefined,
    )
  )
    return undefined;
  assert.ok(
    !Object.keys(env).some(
      (key) =>
        /^(OMXTERM_SNIPPETS_PACKAGED_|OMXTERM_SNIPPETS_APPIMAGE_|OMXTERM_SNIPPETS_DMG_|OMXTERM_SNIPPETS_WINDOWS_PUBLIC_)/.test(
          key,
        ) && env[key] !== undefined,
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
  assert.match(values.INSTALLER_SHA256, /^[a-f0-9]{64}$/);
  const probe = env[prefix + "PROBE"];
  if (probe !== undefined) assert.equal(probe, "1");
  return { ...values, probe: probe === "1" };
}
