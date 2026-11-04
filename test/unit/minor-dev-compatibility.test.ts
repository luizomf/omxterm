import { expect, it } from "vitest";
import {
  checkCompatibility,
  parseManifest,
} from "../../src/installed-packages/archive";
import { packageCompatible } from "../../src/installed-packages/compatibility";

const manifest = {
  id: "example.extension",
  version: "1.0.0",
  engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
};
const runtime = (appVersion: string, apiVersion = "0.1.0") => ({
  appVersion,
  apiVersion,
});

it.each([
  [">=0.24.0-dev.21", true],
  [">=0.24.0-dev.8", true],
  [">=0.24.0", true],
  ["*", true],
  ["0.24.0 || 0.25.0", true],
  [">=0.24.0 <0.25.0", false],
  [">=0.24.0 <0.25.0-0", false],
  ["<=0.24.1", false],
  [">=0.25.0", false],
  [">=0.24.1 <=0.25.0", false],
  ["0.24.0", false],
  ["0.25.0", false],
  ["not a range", false],
])(
  "bridges a minor dev host only when range %s admits both stable endpoints",
  (range, expected) => {
    expect(
      packageCompatible(
        { ...manifest, engines: { ...manifest.engines, omxterm: range } },
        runtime("0.25.0-dev.0"),
      ),
    ).toBe(expected);
  },
);

it.each([
  ["0.25.0-dev.0", true],
  ["0.25.0-dev.1", true],
  ["0.25.0-dev.37", true],
  ["0.25.0-dev.9007199254740992", true],
  ["0.25.0-dev.01", false],
  ["0.25.0-dev.-1", false],
  ["0.25.0-dev.0.extra", false],
  ["0.25.0-dev.0+build", false],
  ["0.25.0-dev.0\n", false],
  ["v0.25.0-dev.0", false],
  [" 0.25.0-dev.0", false],
  ["0.25.0-alpha.0", false],
  ["0.25.0-beta.1", false],
  ["0.25.0-rc.0", false],
  ["0.24.2-dev.0", false],
  ["0.25.1-dev.0", false],
  ["0.26.0-dev.0", false],
  ["invalid", false],
  [`0.25.0-dev.${"9".repeat(300)}`, false],
])("limits the additional bridge to canonical host %j", (host, expected) => {
  expect(packageCompatible(manifest, runtime(host))).toBe(expected);
});

it("preserves ordinary semver admission before applying the extra bridge", () => {
  for (const [host, range] of [
    ["0.25.0-dev.0+build", ">=0.25.0-dev.0 <0.25.0"],
    ["v0.25.0-dev.1", ">=0.25.0-dev.0 <0.25.0"],
    ["0.25.1-dev.0", ">=0.25.1-dev.0 <0.25.1"],
    ["0.26.0-alpha.1", ">=0.26.0-alpha.0 <0.26.0"],
    ["0.25.0", ">=0.25.0"],
  ])
    expect(
      packageCompatible(
        { ...manifest, engines: { ...manifest.engines, omxterm: range! } },
        runtime(host!),
      ),
    ).toBe(true);
});

it.each(["0.2.0", "0.1.1-dev.0", "invalid"])(
  "does not bridge an incompatible API %s",
  (api) =>
    expect(packageCompatible(manifest, runtime("0.25.0-dev.0", api))).toBe(
      false,
    ),
);

it("does not change capability validation for admitted packages", () => {
  const input = {
    ...manifest,
    format: 1,
    name: "Example",
    backend: "backend.mjs",
  };
  const admitted = parseManifest({
    ...input,
    capabilities: ["terminal.openSsh.v1"],
  });
  expect(() =>
    checkCompatibility(admitted, runtime("0.25.0-dev.0")),
  ).not.toThrow();
  expect(admitted.capabilities).toEqual(["terminal.openSsh.v1"]);
  for (const capabilities of [
    ["terminal.unknown.v1"],
    ["state.v1", "state.v1"],
    [],
  ])
    expect(() => parseManifest({ ...input, capabilities })).toThrow(
      "invalid-package",
    );
});
