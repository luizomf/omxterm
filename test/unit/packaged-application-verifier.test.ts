import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectAsarEntries,
  inspectAdHocApplication,
  inspectApplicationVersions,
  inspectElfDynamicDependencies,
  inspectForbiddenPackagedEntries,
  inspectIcnsRepresentations,
  packagedExplicitCommand,
  signalProcessGroup,
  verifyPackagedStartupWithCleanup,
} from "../../scripts/verify-packaged-app.mjs";

describe("packaged startup failure preservation", () => {
  it("preserves startup and profile cleanup failures after successful termination", async () => {
    const startup = new Error("privacy assertion failed");
    const profile = new Error("profile cleanup failed");
    await expect(
      verifyPackagedStartupWithCleanup({
        verify: vi.fn().mockRejectedValue(startup),
        stop: vi.fn().mockResolvedValue(undefined),
        removeProfile: vi.fn().mockRejectedValue(profile),
      }),
    ).rejects.toMatchObject({ errors: [startup, profile] });
  });
  it("returns startup evidence only after successful termination and profile cleanup", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const removeProfile = vi.fn().mockResolvedValue(undefined);
    await expect(
      verifyPackagedStartupWithCleanup({
        verify: async () => 7,
        stop,
        removeProfile,
      }),
    ).resolves.toBe(7);
    expect(stop).toHaveBeenCalledOnce();
    expect(removeProfile).toHaveBeenCalledOnce();
  });
  it("retains startup and termination failures without deleting an uncertain profile", async () => {
    const startup = new Error("startup timed out");
    const termination = new Error("termination failed");
    const removeProfile = vi.fn();
    await expect(
      verifyPackagedStartupWithCleanup({
        verify: vi.fn().mockRejectedValue(startup),
        stop: vi.fn().mockRejectedValue(termination),
        removeProfile,
      }),
    ).rejects.toMatchObject({ errors: [startup, termination] });
    expect(removeProfile).not.toHaveBeenCalled();
  });
});

const requiredEntries = [
  "/dist/main/index.js",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.css",
  "/dist/renderer/index.html",
  "/dist/renderer/index.js",
  "/node_modules/node-pty/lib/index.js",
  "/package.json",
];

describe("packaged application verifier", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["darwin", "linux", "win32"])(
    "launches the %s packaged output probe with literal argv",
    (platform) => {
      const argumentCanary = "generated-argument-canary";
      const command = packagedExplicitCommand(
        platform,
        argumentCanary,
        "/native/node",
      );

      expect(command.executable).toBe("/native/node");
      expect(command.arguments[0]).toMatch(/packaged-output-probe\.mjs$/u);
      expect(command.arguments.slice(1)).toEqual([
        "--literal-option-looking-argument",
        argumentCanary,
      ]);
    },
  );

  it("rejects an unsupported packaged output probe platform", () => {
    expect(() => packagedExplicitCommand("freebsd", "canary")).toThrow(
      "Unsupported packaged output probe platform",
    );
  });

  it("reports a missing process group when signaling returns ESRCH", () => {
    const cause = Object.assign(new Error("missing process group"), {
      code: "ESRCH",
    });
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw cause;
    });

    expect(signalProcessGroup(123, 0)).toBe(false);
    expect(kill).toHaveBeenCalledWith(-123, 0);
  });

  it("reports an EPERM process group as present during a liveness probe", () => {
    const cause = Object.assign(new Error("process group is not signalable"), {
      code: "EPERM",
    });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw cause;
    });

    expect(signalProcessGroup(123, 0)).toBe(true);
  });

  it.each(["SIGTERM", "SIGKILL"] as const)(
    "keeps teardown running when %s returns EPERM",
    (signal) => {
      const cause = Object.assign(
        new Error("process group is not signalable"),
        { code: "EPERM" },
      );
      const kill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw cause;
      });

      expect(signalProcessGroup(123, signal)).toBe(true);
      expect(kill).toHaveBeenCalledWith(-123, signal);
    },
  );

  it("rethrows an unexpected process-group signaling error", () => {
    const cause = Object.assign(new Error("unexpected signaling failure"), {
      code: "EINVAL",
    });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw cause;
    });

    expect(() => signalProcessGroup(123, "SIGTERM")).toThrow(cause);
  });

  it("reads exact ELF dynamic dependencies for AppImage runtime checks", () => {
    expect(
      inspectElfDynamicDependencies(`
 0x0000000000000001 (NEEDED)             Shared library: [libfuse.so.2]
 0x0000000000000001 (NEEDED)             Shared library: [libz.so.1]
`),
    ).toEqual(["libfuse.so.2", "libz.so.1"]);
    expect(() =>
      inspectElfDynamicDependencies(`
 0x0000000000000001 (NEEDED)             Shared library: [libz.so]
`),
    ).toThrow("development-only unversioned libz.so");
    expect(
      inspectElfDynamicDependencies(
        "There is no dynamic section in this file.\n",
      ),
    ).toEqual([]);
  });

  it("requires source, embedded package, and bundle versions to agree", () => {
    expect(() =>
      inspectApplicationVersions({
        sourceVersion: "0.1.0",
        packagedVersion: "0.1.0",
        bundleVersion: "0.1.0",
      }),
    ).not.toThrow();
    expect(() =>
      inspectApplicationVersions({
        sourceVersion: "0.1.0",
        packagedVersion: "0.0.0",
        bundleVersion: "0.1.0",
      }),
    ).toThrow("app.asar package version 0.0.0");
    expect(() =>
      inspectApplicationVersions({
        sourceVersion: "0.1.0",
        packagedVersion: "0.1.0",
        bundleVersion: "0.0.0",
      }),
    ).toThrow("CFBundleShortVersionString 0.0.0");
  });

  it("requires a structurally valid ad-hoc macOS application seal", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "Signature=adhoc\nTeamIdentifier=not set\n",
      });

    await expect(inspectAdHocApplication("OMXTerm.app", execute)).resolves.toBe(
      undefined,
    );
    expect(execute).toHaveBeenNthCalledWith(1, "codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=4",
      "OMXTerm.app",
    ]);
  });

  it("rejects the incomplete linker signature shipped in 0.4.0", async () => {
    const cause = Object.assign(new Error("invalid seal"), {
      stderr:
        "OMXTerm.app: code has no resources but signature indicates they must be present",
    });
    const execute = vi.fn().mockRejectedValue(cause);

    await expect(
      inspectAdHocApplication("OMXTerm.app", execute),
    ).rejects.toThrow("invalid seal");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a macOS application with a publisher identity", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "",
        stderr:
          "Authority=Developer ID Application: Example\nTeamIdentifier=EXAMPLE123\n",
      });

    await expect(
      inspectAdHocApplication("OMXTerm.app", execute),
    ).rejects.toThrow("unexpectedly has a signing authority");
  });

  it("requires every standard and Retina macOS icon representation", () => {
    const representations = [
      { name: "icon_16x16.png", width: 16, height: 16 },
      { name: "icon_16x16@2x.png", width: 32, height: 32 },
      { name: "icon_32x32.png", width: 32, height: 32 },
      { name: "icon_32x32@2x.png", width: 64, height: 64 },
      { name: "icon_128x128.png", width: 128, height: 128 },
      { name: "icon_128x128@2x.png", width: 256, height: 256 },
      { name: "icon_256x256.png", width: 256, height: 256 },
      { name: "icon_256x256@2x.png", width: 512, height: 512 },
      { name: "icon_512x512.png", width: 512, height: 512 },
      { name: "icon_512x512@2x.png", width: 1024, height: 1024 },
    ];

    expect(inspectIcnsRepresentations(representations)).toEqual({
      missing: [],
      wrongDimensions: [],
    });
    expect(inspectIcnsRepresentations(representations.slice(1))).toEqual({
      missing: ["icon_16x16.png"],
      wrongDimensions: [],
    });
    expect(
      inspectIcnsRepresentations([
        ...representations.slice(0, 5),
        { name: "icon_128x128@2x.png", width: 512, height: 512 },
        ...representations.slice(6),
      ]),
    ).toEqual({
      missing: [],
      wrongDimensions: ["icon_128x128@2x.png (expected 256x256, got 512x512)"],
    });
  });

  it("accepts only the native runtime required by each POSIX package", () => {
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/dist/main/macos-window-blur.node",
          "/node_modules/node-pty/prebuilds/darwin-arm64",
          "/node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
          "/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
        ],
        "darwin",
      ),
    ).toEqual({ missing: [], forbidden: [] });
    expect(
      inspectAsarEntries(
        [...requiredEntries, "/node_modules/node-pty/build/Release/pty.node"],
        "linux",
      ),
    ).toEqual({ missing: [], forbidden: [] });
  });

  it("accepts only the win32-arm64 native runtime and rejects debug symbols on Windows", () => {
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/node_modules/node-pty/prebuilds/win32-arm64",
          "/node_modules/node-pty/prebuilds/win32-arm64/pty.node",
          "/node_modules/node-pty/prebuilds/win32-arm64/conpty.node",
          "/node_modules/node-pty/prebuilds/win32-arm64/conpty/OpenConsole.exe",
        ],
        "win32",
      ),
    ).toEqual({ missing: [], forbidden: [] });
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/node_modules/node-pty/prebuilds/win32-x64/pty.node",
          "/node_modules/node-pty/prebuilds/win32-arm64/pty.pdb",
          "/node_modules/node-pty/build/Release/pty.node",
        ],
        "win32",
      ).forbidden,
    ).toEqual([
      "/node_modules/node-pty/prebuilds/win32-x64/pty.node",
      "/node_modules/node-pty/prebuilds/win32-arm64/pty.pdb",
      "/node_modules/node-pty/build/Release/pty.node",
    ]);
  });

  it.each([
    "/.env",
    "/.git/config",
    "/dist/main/index.js.map",
    "/node_modules/node-pty/src/index.ts",
    "/node_modules/node-pty/prebuilds/darwin-x64/pty.node",
    "/node_modules/node-pty/lib/terminal.test.js",
    "/node_modules/node-addon-api/napi.h",
    "/session-transcript.txt",
  ])("rejects development or private-looking entry %s", (entry) => {
    expect(
      inspectAsarEntries([...requiredEntries, entry], "darwin").forbidden,
    ).toEqual([entry]);
  });

  it("rejects another operating system's native runtime", () => {
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/node_modules/node-pty/build/Release/pty.node",
          "/node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
        ],
        "linux",
      ).forbidden,
    ).toEqual(["/node_modules/node-pty/prebuilds/darwin-arm64/pty.node"]);
  });

  it("rejects Linux node-pty rebuild intermediates", () => {
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/node_modules/node-pty/build/Release/pty.node",
          "/node_modules/node-pty/build/Makefile",
          "/node_modules/node-pty/build/Release/obj.target/pty/src/unix/pty.o",
        ],
        "linux",
      ).forbidden,
    ).toEqual([
      "/node_modules/node-pty/build/Makefile",
      "/node_modules/node-pty/build/Release/obj.target/pty/src/unix/pty.o",
    ]);
  });

  it("rejects private-looking files anywhere in an extracted package tree", () => {
    expect(
      inspectForbiddenPackagedEntries([
        "/resources/app.asar",
        "/resources/private-key.pem",
        "/usr/share/omxterm/session-transcript.txt",
      ]),
    ).toEqual([
      "/resources/private-key.pem",
      "/usr/share/omxterm/session-transcript.txt",
    ]);
  });

  it("reports a missing runtime asset", () => {
    expect(
      inspectAsarEntries(requiredEntries.slice(1), "linux").missing,
    ).toEqual(["/dist/main/index.js"]);
  });
});

it("requires the blur addon only on macOS and rejects its build-only headers", () => {
  const addon = "/dist/main/macos-window-blur.node";
  expect(inspectAsarEntries(requiredEntries, "darwin").missing).toEqual([
    addon,
  ]);
  for (const platform of ["linux", "win32"] as const) {
    expect(
      inspectAsarEntries([...requiredEntries, addon], platform).forbidden,
    ).toEqual([addon]);
  }
  expect(
    inspectAsarEntries(
      [...requiredEntries, "/node_modules/node-api-headers/include/node_api.h"],
      "darwin",
    ).forbidden,
  ).toEqual(["/node_modules/node-api-headers/include/node_api.h"]);
});

describe("Restty-only packaged runtime", () => {
  it("rejects any legacy xterm runtime entry", () => {
    expect(
      inspectAsarEntries(
        [...requiredEntries, "/node_modules/@xterm/xterm/lib/xterm.js"],
        "darwin",
      ).forbidden,
    ).toEqual(["/node_modules/@xterm/xterm/lib/xterm.js"]);
  });
});
