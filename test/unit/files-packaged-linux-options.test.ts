import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  assertLinuxFilesHost,
  assertLinuxFilesScenario,
  linuxFilesChecks,
  linuxFilesInputs,
  prepareLinuxFiles,
} from "../fixtures/files-packaged-linux-options";

const inputs = () => ({
  OMXTERM_FILES_PACKAGED_APPIMAGE: path.resolve("fixture-host.AppImage"),
  OMXTERM_FILES_PACKAGED_ARCHIVE: path.resolve("fixture-files.omxext"),
  OMXTERM_FILES_PACKAGED_VERSION: "0.24.0",
  OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.6.0",
  OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Files — ARM64 preview",
  OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256: "a".repeat(64),
  OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256: "b".repeat(64),
});

it("rejects an extracted host whose version differs from the explicit expectation", () => {
  expect(() =>
    assertLinuxFilesHost({ version: "0.24.0" }, "0.24.0"),
  ).not.toThrow();
  expect(() =>
    assertLinuxFilesHost({ version: "0.24.0-dev.11" }, "0.24.0"),
  ).toThrow("expected host version");
  expect(() => assertLinuxFilesHost({}, "0.24.0")).toThrow(
    "expected host version",
  );
});

it("prepares an owned dotfile for the stable UI without changing legacy inputs", async () => {
  const stable = await mkdtemp(path.join(os.tmpdir(), "files-linux-stable-"));
  const legacy = await mkdtemp(path.join(os.tmpdir(), "files-linux-legacy-"));
  try {
    await prepareLinuxFiles(stable, true);
    await prepareLinuxFiles(legacy, false);
    await expect(
      readFile(path.join(stable, ".release-dotfile"), "utf8"),
    ).resolves.toBe("dotfile");
    await expect(
      readFile(path.join(legacy, ".release-dotfile")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    for (const directory of [stable, legacy]) {
      await expect(
        readFile(path.join(directory, "source.txt"), "utf8"),
      ).resolves.toBe("source");
      await expect(
        readFile(path.join(directory, "conflict.txt"), "utf8"),
      ).resolves.toBe("preserved");
    }
  } finally {
    await rm(stable, { recursive: true, force: true });
    await rm(legacy, { recursive: true, force: true });
  }
});

it("keeps an unselected fixture disabled and requires every selected input", () => {
  expect(linuxFilesInputs({})).toBeUndefined();
  for (const key of Object.keys(inputs())) {
    const incomplete: NodeJS.ProcessEnv = { ...inputs() };
    delete incomplete[key];
    expect(() => linuxFilesInputs(incomplete), key).toThrow(key);
  }
});

it("selects current UI only for the complete stable pair and full lifecycle", () => {
  expect(linuxFilesInputs(inputs())).toMatchObject({
    version: "0.24.0",
    extensionVersion: "0.6.0",
    extensionName: "Files — ARM64 preview",
    currentUi: true,
  });
  expect(
    linuxFilesInputs({ ...inputs(), OMXTERM_FILES_PACKAGED_ATTACH_ONLY: "1" })
      ?.currentUi,
  ).toBe(false);
  expect(
    linuxFilesInputs({ ...inputs(), OMXTERM_FILES_PACKAGED_TERMINAL_ONLY: "1" })
      ?.currentUi,
  ).toBe(false);
  expect(
    linuxFilesInputs({
      ...inputs(),
      OMXTERM_FILES_PACKAGED_VERSION: "0.24.0-dev.11",
      OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.4.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Files — Linux ARM64 preview",
    })?.currentUi,
  ).toBe(false);
  expect(() =>
    linuxFilesInputs({
      ...inputs(),
      OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Other Files",
    }),
  ).toThrow("Expected stable Files name");
});

it("rejects malformed versions, hashes and incompatible mode choices", () => {
  for (const changed of [
    { OMXTERM_FILES_PACKAGED_VERSION: "v0.24.0" },
    { OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.6" },
    { OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256: "bad" },
    { OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256: "A".repeat(64) },
    { OMXTERM_FILES_PACKAGED_CATALOG: "other" },
    {
      OMXTERM_FILES_PACKAGED_CATALOG: "public",
      OMXTERM_FILES_PACKAGED_ATTACH_ONLY: "1",
    },
    {
      OMXTERM_FILES_PACKAGED_ATTACH_ONLY: "1",
      OMXTERM_FILES_PACKAGED_TERMINAL_ONLY: "1",
    },
  ])
    expect(() => linuxFilesInputs({ ...inputs(), ...changed })).toThrow();
});

it("requires the stable UI and shortcut receipt as well as the lifecycle identity", () => {
  const expected = {
    currentUi: true,
    version: "0.24.0",
    archiveSha256: "b".repeat(64),
    extensionVersion: "0.6.0",
    extensionName: "Files — ARM64 preview",
  };
  const receipt = {
    checks: [
      ...linuxFilesChecks,
      "current-Files-toolbar-dotfiles-draft",
      "linux-Files-Ctrl-H-dotfiles-draft-focus",
    ],
    approvals: 2,
    archiveSha256: expected.archiveSha256,
    host: expected.version,
    extensionVersion: expected.extensionVersion,
    extensionName: expected.extensionName,
  };
  expect(() => assertLinuxFilesScenario(receipt, expected)).not.toThrow();
  for (const changed of [
    { ...receipt, checks: receipt.checks.slice(0, -1) },
    { ...receipt, archiveSha256: "c".repeat(64) },
    { ...receipt, host: "0.24.0-dev.11" },
    { ...receipt, extensionVersion: "0.5.0" },
    { ...receipt, extensionName: "Other Files" },
    { ...receipt, approvals: 1 },
  ])
    expect(() => assertLinuxFilesScenario(changed, expected)).toThrow();
  expect(() =>
    assertLinuxFilesScenario(
      { ...receipt, checks: [...linuxFilesChecks] },
      { ...expected, currentUi: false },
    ),
  ).not.toThrow();
});

it("refuses a stable pair receipt if the changed UI did not run", () => {
  const expected = {
    currentUi: true,
    version: "0.24.0",
    archiveSha256: "b".repeat(64),
    extensionVersion: "0.6.0",
    extensionName: "Files — ARM64 preview",
  };
  expect(() =>
    assertLinuxFilesScenario(
      {
        checks: [...linuxFilesChecks],
        approvals: 2,
        archiveSha256: expected.archiveSha256,
        host: expected.version,
        extensionVersion: expected.extensionVersion,
        extensionName: expected.extensionName,
      },
      expected,
    ),
  ).toThrow("Linux Files scenario checks");
});

it("rejects a selected Linux pair without both expected SHA-256 digests", () => {
  expect(() =>
    linuxFilesInputs({
      OMXTERM_FILES_PACKAGED_APPIMAGE: "/fixture/host.AppImage",
      OMXTERM_FILES_PACKAGED_ARCHIVE: "/fixture/files.omxext",
      OMXTERM_FILES_PACKAGED_VERSION: "0.24.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.6.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Files — ARM64 preview",
    }),
  ).toThrow("OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256");
});

it("rejects a selected Linux package without an explicit expected display name", () => {
  expect(() =>
    linuxFilesInputs({
      OMXTERM_FILES_PACKAGED_APPIMAGE: "/fixture/host.AppImage",
      OMXTERM_FILES_PACKAGED_ARCHIVE: "/fixture/files.omxext",
      OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256: "a".repeat(64),
      OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256: "b".repeat(64),
      OMXTERM_FILES_PACKAGED_VERSION: "0.24.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.6.0",
    }),
  ).toThrow("OMXTERM_FILES_PACKAGED_EXTENSION_NAME");
});

it("rejects a selected Linux package without an explicit expected archive version", () => {
  expect(() =>
    linuxFilesInputs({
      OMXTERM_FILES_PACKAGED_APPIMAGE: "/fixture/host.AppImage",
      OMXTERM_FILES_PACKAGED_ARCHIVE: "/fixture/files.omxext",
      OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256: "a".repeat(64),
      OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256: "b".repeat(64),
      OMXTERM_FILES_PACKAGED_VERSION: "0.24.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Files — ARM64 preview",
    }),
  ).toThrow("OMXTERM_FILES_PACKAGED_EXTENSION_VERSION");
});

it("rejects a selected Linux package without an explicit expected host version", () => {
  expect(() =>
    linuxFilesInputs({
      OMXTERM_FILES_PACKAGED_APPIMAGE: "/fixture/host.AppImage",
      OMXTERM_FILES_PACKAGED_ARCHIVE: "/fixture/files.omxext",
      OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256: "a".repeat(64),
      OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256: "b".repeat(64),
      OMXTERM_FILES_PACKAGED_EXTENSION_VERSION: "0.6.0",
      OMXTERM_FILES_PACKAGED_EXTENSION_NAME: "Files — ARM64 preview",
    }),
  ).toThrow("OMXTERM_FILES_PACKAGED_VERSION");
});
