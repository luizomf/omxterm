import { execFileSync } from "node:child_process";
import { beforeEach } from "vitest";

// macOS and Windows ship every family the native fixtures read. Linux depends
// on packages listed in docs/development.md#linux, so probe fontconfig
// directly (not through the product's discovery code under test) and skip
// with a reason instead of failing on an incomplete desktop.
let installedLinuxFamilies: ReadonlySet<string> | undefined;

function linuxFamilies(): ReadonlySet<string> {
  if (installedLinuxFamilies) return installedLinuxFamilies;
  let output = "";
  try {
    output = execFileSync("fc-list", [":", "family"], { encoding: "utf8" });
  } catch {
    // Without fontconfig every Linux fixture font counts as missing.
  }
  installedLinuxFamilies = new Set(
    output
      .split(/[,\n]/u)
      .map((family) => family.trim())
      .filter(Boolean),
  );
  return installedLinuxFamilies;
}

export function missingFixtureFontsReason(
  linuxFamiliesRequired: readonly string[],
): string | undefined {
  if (process.platform !== "linux") return undefined;
  const installed = linuxFamilies();
  const missing = linuxFamiliesRequired.filter(
    (family) => !installed.has(family),
  );
  if (missing.length === 0) return undefined;
  return `Fixture font not installed: ${missing.join(", ")} (see docs/development.md#linux)`;
}

/** Skip every test in the calling file when a Linux fixture font is absent. */
export function skipWithoutFixtureFonts(
  linuxFamiliesRequired: readonly string[],
): void {
  const reason = missingFixtureFontsReason(linuxFamiliesRequired);
  beforeEach((context) => {
    if (reason) context.skip(reason);
  });
}

/** Skip when nativeFixturePlatform's configured or reloaded font is absent. */
export function skipWithoutHostFixtureFonts(): void {
  skipWithoutFixtureFonts(["DejaVu Sans", "Liberation Mono"]);
}
