import { describe, expect, it } from "vitest";
import { planLinuxDisplayBackendDefault } from "../../src/main/linux-display-backend";

const NO_ENV: Readonly<Record<string, string | undefined>> = {};
const PLAIN_ARGV = ["/usr/lib/omxterm/omxterm", "--no-sandbox"];

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

  it("preserves an ELECTRON_OZONE_PLATFORM_HINT environment choice", () => {
    expect(
      planLinuxDisplayBackendDefault("wayland", "linux", PLAIN_ARGV, {
        ELECTRON_OZONE_PLATFORM_HINT: "auto",
      }),
    ).toBe("none");
  });

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
