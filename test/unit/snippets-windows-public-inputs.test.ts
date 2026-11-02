import path from "node:path";
import { expect, it } from "vitest";
import { windowsExactInputs } from "../fixtures/snippets-windows-exact-inputs";
import { windowsPublicInputs } from "../fixtures/snippets-windows-public-inputs";

const prefix = "OMXTERM_SNIPPETS_WINDOWS_PUBLIC_";
const inputs = () =>
  Object.fromEntries(
    Object.entries({
      STAGE: path.resolve("stage"),
      INSTALLER: path.resolve("installer.exe"),
      INSTALLER_SHA256:
        "57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b",
      ARCHIVE: path.resolve("archive.omxext"),
      VERSION: "0.24.0-dev.36",
      EVIDENCE: path.resolve("lane"),
      DISPOSABLE_VM: "1",
    }).map(([key, value]) => [prefix + key, value]),
  );

it("skips only without public configuration and excludes public keys from the old adapter", () => {
  expect(windowsPublicInputs({})).toBeUndefined();
  expect(windowsExactInputs(inputs())).toBeUndefined();
  expect(windowsPublicInputs(inputs())?.VERSION).toBe("0.24.0-dev.36");
});

it("accepts only an explicit public child-stdin diagnostic boolean", () => {
  expect(
    windowsPublicInputs({
      ...inputs(),
      [prefix + "CHILD_STDIN_DIAGNOSTIC"]: "1",
    })?.childInputDiagnostic,
  ).toBe(true);
  expect(
    windowsPublicInputs({
      ...inputs(),
      [prefix + "CHILD_STDIN_DIAGNOSTIC"]: "0",
    })?.childInputDiagnostic,
  ).toBe(false);
  for (const value of ["", "true", "2"])
    expect(() =>
      windowsPublicInputs({
        ...inputs(),
        [prefix + "CHILD_STDIN_DIAGNOSTIC"]: value,
      }),
    ).toThrow();
});

it("refuses incomplete, mixed, relative or unpinned configuration", () => {
  for (const [key, value] of Object.entries(inputs()))
    expect(() => windowsPublicInputs({ [key]: value })).toThrow();
  for (const [key, value] of Object.entries({
    DISPOSABLE_VM: "0",
    VERSION: "0.24.0-dev.35",
    INSTALLER_SHA256: "a".repeat(64),
    STAGE: "relative",
    INSTALLER: "relative",
    ARCHIVE: "relative",
    EVIDENCE: "relative",
  }))
    expect(() =>
      windowsPublicInputs({ ...inputs(), [prefix + key]: value }),
    ).toThrow();
  expect(() =>
    windowsPublicInputs({
      ...inputs(),
      [prefix + "CATALOG_URL"]: "https://example.test",
    }),
  ).toThrow("Unknown public input");
  for (const key of [
    "OMXTERM_SNIPPETS_WINDOWS_STAGE",
    "OMXTERM_SNIPPETS_PACKAGED_ENTRY",
    "OMXTERM_SNIPPETS_APPIMAGE_PATH",
    "OMXTERM_SNIPPETS_DMG_PATH",
  ])
    expect(() => windowsPublicInputs({ ...inputs(), [key]: "other" })).toThrow(
      "one Snippets adapter",
    );
  expect(() =>
    windowsExactInputs({
      ...inputs(),
      OMXTERM_SNIPPETS_WINDOWS_STAGE: "/other",
    }),
  ).toThrow("one Snippets adapter");
});
