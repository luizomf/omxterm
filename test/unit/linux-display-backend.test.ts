import { ChildProcess, spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLinuxDisplayBackendDefault,
  planLinuxDisplayBackendDefault,
} from "../../src/main/linux-display-backend";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const NO_ENV: Readonly<Record<string, string | undefined>> = {};
const PLAIN_ARGV = ["/usr/lib/omxterm/omxterm", "--no-sandbox"];

describe("Linux display backend application", () => {
  const unref = vi.fn();
  const app = {
    isPackaged: false,
    commandLine: {
      getSwitchValue: vi.fn(() => "wayland"),
      appendSwitch: vi.fn(),
      appendArgument: vi.fn(),
      hasSwitch: vi.fn(),
      removeSwitch: vi.fn(),
    },
    exit: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      execPath: "/workspace/node_modules/electron/dist/electron",
      argv: [
        "/workspace/node_modules/electron/dist/electron",
        "/workspace/about-fixture.mjs",
        "--no-sandbox",
      ],
      env: {},
    });
    app.isPackaged = false;
    app.commandLine.getSwitchValue.mockReturnValue("wayland");
    const replacement = new ChildProcess();
    replacement.unref = unref;
    vi.mocked(spawn).mockReturnValue(replacement);
  });

  function expectRelaunch(
    executable: string,
    argv = [
      "/workspace/about-fixture.mjs",
      "--no-sandbox",
      "--ozone-platform=x11",
    ],
  ): void {
    expect(spawn).toHaveBeenCalledExactlyOnceWith(executable, argv, {
      detached: true,
      stdio: "ignore",
    });
    expect(unref).toHaveBeenCalledOnce();
    expect(app.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  }

  it("relaunches the development Electron rather than an inherited outer AppImage", () => {
    process.env = {
      APPIMAGE: "/opt/OMXTerm.AppImage",
      APPDIR: "/tmp/.mount_OMXTerm123",
    };

    applyLinuxDisplayBackendDefault(app);

    expectRelaunch("/workspace/node_modules/electron/dist/electron");
  });

  it.each(["/tmp/.mount_OMXTerm123", "/tmp/appimage_extracted_123/"])(
    "relaunches the persistent AppImage for its own runtime at %s with literal -e argv",
    (appDir) => {
      app.isPackaged = true;
      process.execPath = appDir.replace(/\/$/u, "") + "/omxterm";
      process.argv = [
        process.execPath,
        "--no-sandbox",
        "-e",
        "/usr/bin/program",
        "--ozone-platform=wayland",
        "two words",
        "$(not-shell-code)",
        "-e",
      ];
      const environment = {
        APPIMAGE: "/opt/OMXTerm image.AppImage",
        APPDIR: appDir,
        LD_LIBRARY_PATH: "/synthetic/inherited/lib",
      };
      process.env = { ...environment };

      applyLinuxDisplayBackendDefault(app);

      expectRelaunch("/opt/OMXTerm image.AppImage", [
        "--no-sandbox",
        "--ozone-platform=x11",
        "-e",
        "/usr/bin/program",
        "--ozone-platform=wayland",
        "two words",
        "$(not-shell-code)",
        "-e",
      ]);
      expect(process.env).toEqual(environment);
    },
  );

  it.each([
    ["missing both values", "/opt/omxterm/omxterm", undefined, undefined],
    [
      "missing APPDIR",
      "/opt/omxterm/omxterm",
      undefined,
      "/opt/outer.AppImage",
    ],
    ["empty APPDIR", "/opt/omxterm/omxterm", "", "/opt/outer.AppImage"],
    [
      "missing APPIMAGE",
      "/tmp/.mount_123/omxterm",
      "/tmp/.mount_123",
      undefined,
    ],
    ["empty APPIMAGE", "/tmp/.mount_123/omxterm", "/tmp/.mount_123", ""],
    [
      "foreign packaged executable",
      "/opt/omxterm/omxterm",
      "/tmp/.mount_123",
      "/opt/outer.AppImage",
    ],
    [
      "shared directory prefix",
      "/tmp/.mount_123-other/omxterm",
      "/tmp/.mount_123",
      "/opt/outer.AppImage",
    ],
    [
      "nested foreign executable",
      "/tmp/.mount_123/other/omxterm",
      "/tmp/.mount_123",
      "/opt/outer.AppImage",
    ],
    [
      "different executable in AppDir",
      "/tmp/.mount_123/electron",
      "/tmp/.mount_123",
      "/opt/outer.AppImage",
    ],
    [
      "relative APPDIR",
      "/tmp/.mount_123/omxterm",
      "tmp/.mount_123",
      "/opt/outer.AppImage",
    ],
    [
      "relative APPIMAGE",
      "/tmp/.mount_123/omxterm",
      "/tmp/.mount_123",
      "outer.AppImage",
    ],
  ] as const)(
    "relaunches the current executable with %s",
    (_label, executable, appDir, appImage) => {
      app.isPackaged = true;
      process.execPath = executable;
      process.env = { APPDIR: appDir, APPIMAGE: appImage };

      applyLinuxDisplayBackendDefault(app);

      expectRelaunch(executable);
    },
  );

  it.each([
    ["--ozone-platform=wayland"],
    ["--ozone-platform", "wayland"],
    ["--ozone-platform-hint=auto"],
    ["--ozone-platform-hint", "auto"],
  ])("preserves the user's backend override %j without relaunch", (...argv) => {
    process.argv = [process.execPath, ...argv, "-e", "program"];
    process.env = { APPIMAGE: "/opt/outer.AppImage" };

    applyLinuxDisplayBackendDefault(app);

    expect(spawn).not.toHaveBeenCalled();
    expect(unref).not.toHaveBeenCalled();
    expect(app.exit).not.toHaveBeenCalled();
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it.each(["auto", ""])(
    "preserves a defined backend hint (%j) without relaunch",
    (hint) => {
      process.env = { ELECTRON_OZONE_PLATFORM_HINT: hint };

      applyLinuxDisplayBackendDefault(app);

      expect(spawn).not.toHaveBeenCalled();
      expect(unref).not.toHaveBeenCalled();
      expect(app.exit).not.toHaveBeenCalled();
      expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
    },
  );

  it("keeps the seeded backend when spawning the replacement throws", () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("synthetic spawn failure");
    });

    applyLinuxDisplayBackendDefault(app);

    expect(spawn).toHaveBeenCalledOnce();
    expect(unref).not.toHaveBeenCalled();
    expect(app.exit).not.toHaveBeenCalled();
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });
});

describe("Linux display backend", () => {
  // Electron seeds ozone-platform from the session type and initializes the
  // browser process before app code runs; escaping the invisible Wayland
  // backend requires relaunching with the explicit switch (ADR 0020).
  it("relaunches into X11 when Electron seeded a Wayland session backend", () => {
    expect(
      planLinuxDisplayBackendDefault("wayland", "linux", PLAIN_ARGV, NO_ENV),
    ).toBe("relaunch-x11");
  });

  it("appends the X11 default when no backend was seeded or chosen", () => {
    expect(
      planLinuxDisplayBackendDefault("", "linux", PLAIN_ARGV, NO_ENV),
    ).toBe("append-x11");
  });

  it("leaves an already seeded X11 backend alone", () => {
    expect(
      planLinuxDisplayBackendDefault("x11", "linux", PLAIN_ARGV, NO_ENV),
    ).toBe("none");
  });

  it.each([
    ["--ozone-platform=wayland"],
    ["--ozone-platform"],
    ["--ozone-platform-hint=auto"],
  ])("preserves an explicit %s argument", (argument) => {
    expect(
      planLinuxDisplayBackendDefault(
        "wayland",
        "linux",
        ["/usr/lib/omxterm/omxterm", argument],
        NO_ENV,
      ),
    ).toBe("none");
  });

  it.each([
    ["--ozone-platform=wayland"],
    ["--ozone-platform-hint=auto"],
    ["--ozone-platform", "wayland"],
  ])(
    "treats backend-looking values after -e as literal argv",
    (...literalArgv) => {
      expect(
        planLinuxDisplayBackendDefault(
          "wayland",
          "linux",
          ["/usr/lib/omxterm/omxterm", "-e", "program", ...literalArgv],
          NO_ENV,
        ),
      ).toBe("relaunch-x11");
    },
  );

  it.each(["auto", ""])(
    "preserves a defined ELECTRON_OZONE_PLATFORM_HINT (%j)",
    (hint) => {
      expect(
        planLinuxDisplayBackendDefault("wayland", "linux", PLAIN_ARGV, {
          ELECTRON_OZONE_PLATFORM_HINT: hint,
        }),
      ).toBe("none");
    },
  );

  it("does not treat unrelated arguments as a backend choice", () => {
    expect(
      planLinuxDisplayBackendDefault(
        "wayland",
        "linux",
        ["omxterm", "--ozone-platform-lookalike", "--trace"],
        NO_ENV,
      ),
    ).toBe("relaunch-x11");
  });

  it("does not plan Linux backend changes on another platform", () => {
    expect(
      planLinuxDisplayBackendDefault(
        "wayland",
        "darwin",
        ["--ozone-platform=wayland"],
        NO_ENV,
      ),
    ).toBe("none");
  });
});
