import { satisfies, valid } from "semver";

// Each canonical development family admits a range only when ordinary semver
// admits both stable endpoints; this deliberately bridges prerelease rules.
const developmentBridges: readonly [RegExp, string, string][] = [
  [/^0\.24\.1-dev\.(?:0|[1-9]\d*)$/u, "0.24.0", "0.24.1"],
  [/^0\.25\.0-dev\.(?:0|[1-9]\d*)$/u, "0.24.0", "0.25.0"],
  [/^0\.26\.0-dev\.(?:0|[1-9]\d*)$/u, "0.25.0", "0.26.0"],
  [/^0\.26\.1-dev\.(?:0|[1-9]\d*)$/u, "0.26.0", "0.26.1"],
  [/^0\.27\.0-dev\.(?:0|[1-9]\d*)$/u, "0.26.0", "0.27.0"],
  [/^0\.27\.1-dev\.(?:0|[1-9]\d*)$/u, "0.27.0", "0.27.1"],
  [/^0\.28\.0-dev\.(?:0|[1-9]\d*)$/u, "0.27.0", "0.28.0"],
  [/^0\.28\.1-dev\.(?:0|[1-9]\d*)$/u, "0.28.0", "0.28.1"],
  [/^0\.29\.1-dev\.(?:0|[1-9]\d*)$/u, "0.29.0", "0.29.1"],
  [/^0\.30\.1-dev\.(?:0|[1-9]\d*)$/u, "0.30.0", "0.30.1"],
  [/^0\.31\.0-dev\.(?:0|[1-9]\d*)$/u, "0.30.0", "0.31.0"],
  [/^0\.31\.1-dev\.(?:0|[1-9]\d*)$/u, "0.31.0", "0.31.1"],
  [/^0\.32\.0-dev\.(?:0|[1-9]\d*)$/u, "0.31.0", "0.32.0"],
];

function bridgedDevelopmentHost(appVersion: string, range: string): boolean {
  return developmentBridges.some(
    ([family, from, to]) =>
      family.test(appVersion) &&
      valid(appVersion) === appVersion &&
      satisfies(from, range) &&
      satisfies(to, range),
  );
}

/** Shared host and API admission with narrowly bounded host exceptions. */
export function packageCompatible(
  manifest: {
    id: string;
    version: string;
    engines: { omxterm: string; api: string };
  },
  runtime: { appVersion: string; apiVersion: string },
): boolean {
  const unchangedFilesPreview =
    (runtime.appVersion === "0.24.0-dev.0" ||
      runtime.appVersion === "0.24.0-dev.1" ||
      runtime.appVersion === "0.24.0-dev.2" ||
      runtime.appVersion === "0.24.0-dev.3" ||
      runtime.appVersion === "0.24.0-dev.4" ||
      runtime.appVersion === "0.24.0-dev.5") &&
    manifest.id === "omxterm.files" &&
    manifest.version === "0.1.0" &&
    manifest.engines.omxterm === ">=0.23.0-dev.8 <0.24.0" &&
    manifest.engines.api === "0.1.x";
  const range = manifest.engines.omxterm;
  return (
    (satisfies(runtime.appVersion, range) ||
      unchangedFilesPreview ||
      bridgedDevelopmentHost(runtime.appVersion, range)) &&
    satisfies(runtime.apiVersion, manifest.engines.api)
  );
}
