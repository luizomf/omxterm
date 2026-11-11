import { expect, it } from "vitest";
import { packageCompatible } from "../../src/installed-packages/compatibility";

// Each development family admits a range only when it admits both stable
// endpoints. The 0.26.1 family is covered in more depth by patch-dev-compatibility.
const families = [
  { host: "0.24.1-dev.0", from: "0.24.0", to: "0.24.1" },
  { host: "0.25.0-dev.0", from: "0.24.0", to: "0.25.0" },
  { host: "0.26.0-dev.0", from: "0.25.0", to: "0.26.0" },
  { host: "0.27.0-dev.0", from: "0.26.0", to: "0.27.0" },
  { host: "0.27.1-dev.0", from: "0.27.0", to: "0.27.1" },
];
const compatible = (range: string, appVersion: string, apiVersion = "0.1.0") =>
  packageCompatible(
    {
      id: "example.extension",
      version: "1.0.0",
      engines: { omxterm: range, api: "0.1.x" },
    },
    { appVersion, apiVersion },
  );

it.each(families)(
  "bridges $host only for ranges admitting both $from and $to",
  ({ host, from, to }) => {
    expect(compatible(`${from} || ${to}`, host)).toBe(true);
    expect(compatible(">=0.24.0-dev.8", host)).toBe(true);
    expect(compatible("*", host)).toBe(true);
    expect(compatible(from, host)).toBe(false);
    expect(compatible(to, host)).toBe(false);
    expect(compatible(`>=${to}`, host)).toBe(false);
    expect(compatible(`<${to}`, host)).toBe(false);
    expect(compatible("not a range", host)).toBe(false);
    expect(compatible(">=0.24.0-dev.8", host, "0.2.0")).toBe(false);
  },
);

it.each([
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
  ["0.25.0-rc.0", false],
  ["0.24.2-dev.0", false],
  ["0.25.1-dev.0", false],
  ["0.27.1-dev.0", true],
  ["0.27.2-dev.0", false],
  ["0.28.0-dev.0", false],
  ["invalid", false],
  [`0.25.0-dev.${"9".repeat(300)}`, false],
])("limits the bridge to canonical development host %j", (host, expected) => {
  expect(compatible(">=0.24.0-dev.21", host)).toBe(expected);
});

it("keeps ordinary semver admission for explicit prerelease ranges", () => {
  for (const [host, range] of [
    ["0.25.0-dev.0+build", ">=0.25.0-dev.0 <0.25.0"],
    ["0.27.0-dev.0", ">=0.27.0-dev.0 <0.27.0"],
    ["0.26.0-alpha.1", ">=0.26.0-alpha.0 <0.26.0"],
    ["0.25.0", ">=0.25.0"],
  ])
    expect(compatible(range!, host!)).toBe(true);
});
