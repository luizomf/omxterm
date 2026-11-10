import { expect, it } from "vitest";
import { packageCompatible } from "../../src/installed-packages/compatibility";

const manifest = (omxterm: string) => ({
  id: "example.extension",
  version: "1.0.0",
  engines: { omxterm, api: "0.1.x" },
});
const runtime = (appVersion: string, apiVersion = "0.1.0") => ({
  appVersion,
  apiVersion,
});

it.each([
  [">=0.24.0-dev.8", true],
  [">=0.25.0-dev.20", true],
  ["0.26.0 || 0.26.1", true],
  ["*", true],
  [">=0.24.0-dev.1 <0.26.0", false],
  [">=0.26.1", false],
  ["0.26.0", false],
  ["not a range", false],
])("requires both 0.26.0 and 0.26.1 for range %s", (range, expected) => {
  expect(packageCompatible(manifest(range), runtime("0.26.1-dev.0"))).toBe(
    expected,
  );
});

it.each([
  ["0.26.1-dev.0", true],
  ["0.26.1-dev.12", true],
  ["0.26.1-dev.01", false],
  ["0.26.1-dev.0+build", false],
  ["0.26.1-alpha.0", false],
  ["0.26.2-dev.0", false],
])("limits the bridge to canonical host %j", (host, expected) => {
  expect(packageCompatible(manifest(">=0.24.0-dev.8"), runtime(host))).toBe(
    expected,
  );
});

it("does not bridge an incompatible API", () => {
  expect(
    packageCompatible(
      manifest(">=0.24.0-dev.8"),
      runtime("0.26.1-dev.0", "0.2.0"),
    ),
  ).toBe(false);
});
