import { describe, expect, it } from "vitest";
import {
  inspectDebMetadata,
  inspectDesktopEntry,
  inspectMaintainerScripts,
  inspectPrivilegedModes,
  inspectRpmMetadata,
  inspectSystemPackageFiles,
  parseDebControl,
  systemPackageVersion,
} from "../../scripts/verify-linux-packages.mjs";

const control = (architecture: string) => `Package: omxterm
Version: 1.2.3~dev.0
Architecture: ${architecture}
Depends: libgtk-3-0, libnss3, fontconfig
Recommends: openssh-client
Description:
  Open-source personal desktop terminal
`;

describe("Linux system package metadata", () => {
  it("sorts npm prereleases before their release", () => {
    expect(systemPackageVersion("1.2.3-dev.0")).toBe("1.2.3~dev.0");
    expect(systemPackageVersion("1.2.3")).toBe("1.2.3");
  });

  it("parses Debian control fields with continuation lines", () => {
    const fields = parseDebControl(control("amd64"));
    expect(fields.get("Package")).toBe("omxterm");
    expect(fields.get("Description")).toBe(
      "\nOpen-source personal desktop terminal",
    );
  });

  it.each([
    ["x64", "amd64", "arm64"],
    ["arm64", "arm64", "amd64"],
  ])("accepts only the %s DEB architecture", (arch, own, foreign) => {
    const expected = { arch, version: "1.2.3-dev.0" };
    expect(() =>
      inspectDebMetadata(parseDebControl(control(own)), expected),
    ).not.toThrow();
    expect(() =>
      inspectDebMetadata(parseDebControl(control(foreign)), expected),
    ).toThrow(`DEB Architecture is ${foreign}, expected ${own}`);
  });

  it("requires the DEB fontconfig dependency and OpenSSH recommendation", () => {
    const expected = { arch: "x64", version: "1.2.3-dev.0" };
    expect(() =>
      inspectDebMetadata(
        parseDebControl(control("amd64").replace(", fontconfig", "")),
        expected,
      ),
    ).toThrow("fontconfig");
    expect(() =>
      inspectDebMetadata(
        parseDebControl(control("amd64").replace("Recommends:", "Suggests:")),
        expected,
      ),
    ).toThrow("openssh-client");
  });

  it.each([
    ["x64", "x86_64", "aarch64"],
    ["arm64", "aarch64", "x86_64"],
  ])("accepts only the %s RPM architecture", (arch, own, foreign) => {
    const metadata = {
      name: "omxterm",
      version: "1.2.3~dev.0",
      arch: own,
      requires: ["gtk3", "fontconfig"],
      recommends: ["openssh-clients"],
    };
    const expected = { arch, version: "1.2.3-dev.0" };
    expect(() => inspectRpmMetadata(metadata, expected)).not.toThrow();
    expect(() =>
      inspectRpmMetadata({ ...metadata, arch: foreign }, expected),
    ).toThrow(`RPM arch is ${foreign}, expected ${own}`);
    expect(() =>
      inspectRpmMetadata({ ...metadata, recommends: [] }, expected),
    ).toThrow("openssh-clients");
  });
});

describe("Linux system package payload policy", () => {
  it("rejects setuid and setgid entries, including chrome-sandbox", () => {
    expect(
      inspectPrivilegedModes(
        [
          "-rwxr-xr-x 0/0 15232 2026-01-01 00:00 ./opt/OMXTerm/omxterm",
          "-rwsr-xr-x 0/0 15232 2026-01-01 00:00 ./opt/OMXTerm/chrome-sandbox",
          "-rwxr-sr-x /opt/OMXTerm/setgid",
          "drwxrwxrwt /opt/OMXTerm/sticky",
        ].join("\n"),
      ),
    ).toEqual([
      "-rwsr-xr-x 0/0 15232 2026-01-01 00:00 ./opt/OMXTerm/chrome-sandbox",
      "-rwxr-sr-x /opt/OMXTerm/setgid",
    ]);
  });

  it("accepts only the reviewed maintainer scripts", () => {
    const reviewed =
      "# OMXTerm disables the Chromium sandbox on Linux (ADR 0024)\n";
    expect(() => inspectMaintainerScripts(reviewed)).not.toThrow();
    expect(() =>
      inspectMaintainerScripts(
        `${reviewed}# creates no update-alternatives link\n`,
      ),
    ).not.toThrow();
    expect(() => inspectMaintainerScripts("update-desktop-database")).toThrow(
      "reviewed OMXTerm install script",
    );
    for (const command of [
      "chmod 4755 '/opt/OMXTerm/chrome-sandbox'",
      "update-alternatives --install /usr/bin/omxterm",
      "apparmor_parser --replace",
    ])
      expect(() => inspectMaintainerScripts(`${reviewed}${command}`)).toThrow(
        "security policy",
      );
  });

  it("requires a no-sandbox desktop entry", () => {
    const entry = `[Desktop Entry]
Name=OMXTerm
Exec=/opt/OMXTerm/omxterm --no-sandbox %U
Icon=omxterm
StartupWMClass=omxterm
Categories=Utility;TerminalEmulator;
`;
    expect(() => inspectDesktopEntry(entry)).not.toThrow();
    expect(() =>
      inspectDesktopEntry(entry.replace(" --no-sandbox", "")),
    ).toThrow("Exec=/opt/OMXTerm/omxterm --no-sandbox %U");
  });

  it("allows only the application, launcher, desktop entry and icon", () => {
    expect(
      inspectSystemPackageFiles([
        "/opt/OMXTerm/omxterm",
        "/usr/bin/omxterm",
        "/usr/share/applications/omxterm.desktop",
        "/usr/share/icons/hicolor/1024x1024/apps/omxterm.png",
        "/usr/share/doc/omxterm/changelog.gz",
        "/etc/apparmor.d/omxterm",
        "/usr/bin/chrome-sandbox",
      ]),
    ).toEqual(["/etc/apparmor.d/omxterm", "/usr/bin/chrome-sandbox"]);
  });
});
