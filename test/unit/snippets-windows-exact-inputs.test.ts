import path from "node:path";
import { expect, it } from "vitest";
import { windowsExactInputs } from "../fixtures/snippets-windows-exact-inputs";

const inputs = () =>
  Object.fromEntries(
    Object.entries({
      STAGE: path.resolve("stage"),
      INSTALLER: path.resolve("installer.exe"),
      INSTALLER_SHA256: "a".repeat(64),
      ARCHIVE: path.resolve("snippets.omxext"),
      VERSION: "0.24.0-dev.36",
      EVIDENCE: path.resolve("evidence"),
    }).map(([key, value]) => [`OMXTERM_SNIPPETS_WINDOWS_${key}`, value]),
  );

it("skips only with no Windows exact opt-in and refuses partial or mixed inputs", () => {
  expect(windowsExactInputs({})).toBeUndefined();
  for (const [key, value] of Object.entries(inputs()))
    expect(() => windowsExactInputs({ [key]: value })).toThrow("required");
  expect(windowsExactInputs(inputs())?.VERSION).toBe("0.24.0-dev.36");
  expect(windowsExactInputs(inputs())?.probe).toBe(false);
  expect(
    windowsExactInputs({ ...inputs(), OMXTERM_SNIPPETS_WINDOWS_PROBE: "1" })
      ?.probe,
  ).toBe(true);
  expect(() =>
    windowsExactInputs({ ...inputs(), OMXTERM_SNIPPETS_WINDOWS_PROBE: "0" }),
  ).toThrow();
  expect(() =>
    windowsExactInputs({
      ...inputs(),
      OMXTERM_SNIPPETS_WINDOWS_STAGE: "relative",
    }),
  ).toThrow("absolute");
  expect(() =>
    windowsExactInputs({
      ...inputs(),
      OMXTERM_SNIPPETS_WINDOWS_INSTALLER_SHA256: "not-a-digest",
    }),
  ).toThrow();
  expect(() =>
    windowsExactInputs({
      ...inputs(),
      OMXTERM_SNIPPETS_PACKAGED_ENTRY: "/other",
    }),
  ).toThrow("one Snippets adapter");
});
