import { describe, expect, it, vi } from "vitest";
import {
  releaseDesignatedRequirement,
  releaseSigningKeychain,
} from "../../scripts/sign-macos.mjs";
import { inspectApplicationSignature } from "../../scripts/verify-packaged-app.mjs";

describe("macOS application signature", () => {
  const adHocDetails = {
    stdout: "",
    stderr: "Signature=adhoc\nTeamIdentifier=not set\n",
  };
  const releaseDetails = {
    stdout: "",
    stderr:
      "Authority=OMXTerm Release Signing\nSignature size=2148\nTeamIdentifier=not set\n",
  };
  const verified = { stdout: "", stderr: "" };

  it("accepts a complete ad-hoc seal for builds without the release keychain", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(adHocDetails);

    await expect(
      inspectApplicationSignature("OMXTerm.app", {}, execute),
    ).resolves.toBe("adhoc");
    expect(execute).toHaveBeenNthCalledWith(1, "codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=4",
      "OMXTerm.app",
    ]);
  });

  it("refuses an ad-hoc seal in release verification", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(adHocDetails);

    await expect(
      inspectApplicationSignature("OMXTerm.app", { release: true }, execute),
    ).rejects.toThrow("requires the stable release certificate");
  });

  it("accepts the stable release certificate's designated requirement", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(releaseDetails)
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce({
        stdout: `designated => ${releaseDesignatedRequirement}\n`,
        stderr: "",
      });

    await expect(
      inspectApplicationSignature("OMXTerm.app", { release: true }, execute),
    ).resolves.toBe("release");
    expect(execute).toHaveBeenNthCalledWith(3, "codesign", [
      "--verify",
      "--deep",
      "--strict",
      `-R=${releaseDesignatedRequirement}`,
      "OMXTerm.app",
    ]);
  });

  it("refuses another certificate even when its name matches", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(releaseDetails)
      .mockRejectedValueOnce(new Error("test requirement failed"));

    await expect(
      inspectApplicationSignature("OMXTerm.app", {}, execute),
    ).rejects.toThrow("test requirement failed");
  });

  it("rejects the incomplete linker signature shipped in 0.4.0", async () => {
    const cause = Object.assign(new Error("invalid seal"), {
      stderr:
        "OMXTerm.app: code has no resources but signature indicates they must be present",
    });
    const execute = vi.fn().mockRejectedValue(cause);

    await expect(
      inspectApplicationSignature("OMXTerm.app", {}, execute),
    ).rejects.toThrow("invalid seal");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a macOS application with an Apple team", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce({
        stdout: "",
        stderr:
          "Authority=Developer ID Application: Example\nTeamIdentifier=EXAMPLE123\n",
      });

    await expect(
      inspectApplicationSignature("OMXTerm.app", {}, execute),
    ).rejects.toThrow("unexpectedly has an Apple team");
  });
});

it("signs ad-hoc without a release keychain and refuses a partial one", () => {
  expect(releaseSigningKeychain({})).toBeNull();
  expect(
    releaseSigningKeychain({
      OMXTERM_MACOS_SIGNING_KEYCHAIN: "/keys/omxterm.keychain-db",
      OMXTERM_MACOS_SIGNING_KEYCHAIN_PASSWORD_FILE: "/keys/password.txt",
    }),
  ).toEqual({
    keychain: "/keys/omxterm.keychain-db",
    passwordFile: "/keys/password.txt",
  });
  expect(() =>
    releaseSigningKeychain({
      OMXTERM_MACOS_SIGNING_KEYCHAIN: "/keys/omxterm.keychain-db",
    }),
  ).toThrow("Set both");
  expect(() =>
    releaseSigningKeychain({
      OMXTERM_MACOS_SIGNING_KEYCHAIN: "omxterm.keychain-db",
      OMXTERM_MACOS_SIGNING_KEYCHAIN_PASSWORD_FILE: "/keys/password.txt",
    }),
  ).toThrow("absolute");
});
