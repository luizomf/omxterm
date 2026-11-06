import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
const require = createRequire(
  new URL("../fixtures/files-packaged.cjs", import.meta.url),
);
const observer = {
  exports: {} as {
    checksCurrentFilesUi: (options: {
      macosLifecycle?: boolean;
      linuxCurrentFilesUi?: boolean;
      extensionVersion?: string;
    }) => boolean;
    run: (options: unknown) => Promise<unknown>;
    verifyFilesConsent: (
      prompt: { title: string; message: string; detail: string },
      options: {
        linuxExpectedIdentity: boolean;
        extensionName: string;
        extensionVersion: string;
        archiveSha256: string;
        consumer070?: boolean;
        publicLink?: string;
      },
      approvals?: number,
    ) => void;
  },
};
// Keep assertion values in one realm, as in the actual packaged observer.
const load = new Function("module", "require", source) as (
  module: typeof observer,
  require: (name: string) => unknown,
) => void;
load(observer, (name) =>
  name === "electron" ? {} : (require(name) as unknown),
);
const verify = observer.exports.verifyFilesConsent;
const currentUi = observer.exports.checksCurrentFilesUi;

it("refuses public catalog mode without its explicit endpoint before app attachment", async () => {
  await expect(observer.exports.run({ catalogMode: "public" })).rejects.toThrow(
    /public catalog endpoint required/,
  );
});

it("runs the existing current Files UI checks for the explicit Linux stable pair", () => {
  expect(
    currentUi({ linuxCurrentFilesUi: true, extensionVersion: "0.6.0" }),
  ).toBe(true);
  expect(currentUi({ macosLifecycle: true, extensionVersion: "0.6.0" })).toBe(
    true,
  );
  for (const options of [
    { linuxCurrentFilesUi: false, extensionVersion: "0.6.0" },
    { linuxCurrentFilesUi: true, extensionVersion: "0.5.0" },
    { macosLifecycle: true, extensionVersion: "0.5.0" },
    { extensionVersion: "0.4.0" },
  ])
    expect(currentUi(options)).toBe(false);
});

it.each([0, 3, 4])(
  "binds Files0.7 public-link consent to the captured generation %s without claiming Official catalog trust",
  (generation) => {
    const digest =
      "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef";
    const options = {
      consumer070: true,
      publicLink:
        "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.7.0/files-0.7.0.omxext",
      linuxExpectedIdentity: true,
      extensionName: "Files — ARM64 preview",
      extensionVersion: "0.7.0",
      archiveSha256: digest,
    };
    const prompt = {
      title: "Trust extension code?",
      message: "Install Files — ARM64 preview 0.7.0?",
      detail: `Trusted code can use the network.\n\nPackage: omxterm.files\nSHA-256: ${digest}\nCurrent generation: ${generation}`,
      type: "warning",
      buttons: ["Cancel", "Trust and install"],
      defaultId: 0,
      cancelId: 0,
    };
    const approvals = [0, 3, 4].indexOf(generation);
    expect(() => verify(prompt, options, approvals)).not.toThrow();
    for (const wrong of [
      {
        ...prompt,
        detail: prompt.detail.replace(
          `generation: ${generation}`,
          "generation: 99",
        ),
      },
      {
        ...prompt,
        detail: prompt.detail + "\nOfficial means project-maintained.",
      },
      { ...prompt, type: "info" },
      { ...prompt, defaultId: 1 },
      { ...prompt, buttons: ["Trust and install", "Cancel"] },
    ])
      expect(() => verify(wrong, options, approvals)).toThrow();
    expect(() => verify(prompt, options, 3)).toThrow();
  },
);

it("binds Linux consent to the selected name, version, ID and exact digest", () => {
  const digest = "a".repeat(64);
  const options = {
    linuxExpectedIdentity: true,
    extensionName: "Files — ARM64 preview",
    extensionVersion: "0.6.0",
    archiveSha256: digest,
  };
  const prompt = {
    title: "Trust extension code?",
    message: "Install Files — ARM64 preview 0.6.0?",
    detail: `Trusted code can use the network.\n\nPackage: omxterm.files\nSHA-256: ${digest}\nCurrent generation: 0`,
  };
  expect(() => verify(prompt, options)).not.toThrow();
  for (const wrong of [
    { ...prompt, title: "Other" },
    { ...prompt, message: "Install Other Files 0.6.0?" },
    { ...prompt, message: "Install Files — ARM64 preview 0.5.0?" },
    {
      ...prompt,
      detail: prompt.detail.replace("omxterm.files", "omxterm.files.other"),
    },
    {
      ...prompt,
      detail: prompt.detail.replace(digest, "b".repeat(64)) + digest,
    },
  ])
    expect(() => verify(wrong, options)).toThrow();
});

it.each([
  ["0.1.0", "Files — Linux ARM64 preview"],
  ["0.4.0", "Files — Linux ARM64 preview"],
  ["0.5.0", "Files — ARM64 preview"],
])("accepts explicit historical %s Linux Files identity", (version, name) => {
  const digest = "a".repeat(64);
  expect(() =>
    verify(
      {
        title: "Trust extension code?",
        message: `Install ${name} ${version}?`,
        detail: `Trusted code can use the network.\n\nPackage: omxterm.files\nSHA-256: ${digest}\nCurrent generation: 0`,
      },
      {
        linuxExpectedIdentity: true,
        extensionName: name!,
        extensionVersion: version!,
        archiveSha256: digest,
      },
    ),
  ).not.toThrow();
});

it("rejects the wrong displayed Files version on Linux even when the digest matches", () => {
  const digest = "a".repeat(64);
  expect(() =>
    verify(
      {
        title: "Trust extension code?",
        message: "Install Files — ARM64 preview 0.5.0?",
        detail: `Trusted code can use the network.\n\nPackage: omxterm.files\nSHA-256: ${digest}\nCurrent generation: 0`,
      },
      {
        linuxExpectedIdentity: true,
        extensionName: "Files — ARM64 preview",
        extensionVersion: "0.6.0",
        archiveSha256: digest,
      },
    ),
  ).toThrow();
});
