import { satisfies, valid } from "semver";

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
      // This maintenance family deliberately bridges ordinary prerelease rules.
      (/^0\.24\.1-dev\.(?:0|[1-9]\d*)$/u.test(runtime.appVersion) &&
        valid(runtime.appVersion) === runtime.appVersion &&
        satisfies("0.24.0", range) &&
        satisfies("0.24.1", range)) ||
      // The next minor family is a separate, explicitly bounded decision.
      (/^0\.25\.0-dev\.(?:0|[1-9]\d*)$/u.test(runtime.appVersion) &&
        valid(runtime.appVersion) === runtime.appVersion &&
        satisfies("0.24.0", range) &&
        satisfies("0.25.0", range))) &&
    satisfies(runtime.apiVersion, manifest.engines.api)
  );
}
