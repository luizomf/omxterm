# OMXTerm

OMXTerm is an open-source personal desktop terminal for ARM64 macOS, Linux,
and Windows.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The current release is `v0.4.0`, available from the
[GitHub Releases page](https://github.com/luizomf/omxterm/releases) for each
Supported Platform:

- `OMXTerm-0.4.0-arm64.dmg` for Apple Silicon macOS;
- `OMXTerm-0.4.0-arm64.AppImage` for Linux ARM64; and
- `OMXTerm-0.4.0-arm64.exe` for Windows ARM64.

Every package is ARM64-only and intentionally unsigned; the macOS package is
also not notarized. Each artifact has a matching `.sha256` file. Verify the
checksum before opening it, and read the [0.4.0 release notes](docs/releases/0.4.0.md)
for changes, compatibility, provenance, and known limitations.

## Installation

### Installing on macOS

Download the DMG and its matching checksum file into the same directory, then
verify it:

```sh
shasum -a 256 -c OMXTerm-0.4.0-arm64.dmg.sha256
```

Open the DMG, drag `OMXTerm.app` to Applications, eject the DMG, and launch
OMXTerm from Applications. Because the app is intentionally unsigned and not
notarized, macOS may warn that it cannot verify the developer or check the app
for malicious software. Review the source
and proceed only if you trust the exact artifact. If you choose to open it,
follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
in System Settings -> Privacy & Security. Do not disable system-wide macOS
security protections.

### Installing on Linux

Download the AppImage and its matching checksum file into the same directory.
Verify it, make it executable, and run it without an installer:

```sh
sha256sum --check OMXTerm-0.4.0-arm64.AppImage.sha256
chmod +x OMXTerm-0.4.0-arm64.AppImage
./OMXTerm-0.4.0-arm64.AppImage
```

Its unsigned status means Linux distributions do not receive a publisher
identity to verify. Linux needs the `fontconfig` utilities for configured
system-font validation. OMXTerm defaults to Electron's X11 backend; a Wayland
session must provide XWayland. Native Wayland rendering is not currently
claimed. An explicit Electron `--ozone-platform` argument overrides the default
for diagnosis. The default AppImage mount path requires FUSE 2 (for example
`libfuse2t64` on Ubuntu 24.04 or `libfuse2` on older Ubuntu releases).
When FUSE 2 cannot be installed, use the AppImage runtime's safe extraction
fallback:

```sh
./OMXTerm-0.4.0-arm64.AppImage --appimage-extract-and-run
```

A directly-run AppImage is not registered with the desktop environment, so
GNOME's dock and app grid show a generic placeholder icon for it even though
the Terminal Window itself carries the OMXTerm icon. To get the correct dock
icon and an Activities launcher entry, integrate the AppImage: either use an
AppImage integration tool of your choice, or install a user-level desktop
entry pointing at your AppImage location, for example:

```ini
# ~/.local/share/applications/omxterm.desktop
[Desktop Entry]
Name=OMXTerm
Exec=/absolute/path/to/OMXTerm-0.4.0-arm64.AppImage %U
Terminal=false
Type=Application
Icon=/absolute/path/to/omxterm.png
StartupWMClass=omxterm
Categories=Utility;TerminalEmulator;
```

The icon PNG is available inside the AppImage at
`squashfs-root/usr/share/icons/hicolor/1024x1024/apps/omxterm.png` after
`--appimage-extract`, and `StartupWMClass=omxterm` is what associates running
windows with the entry. Moving or renaming the AppImage requires updating the
`Exec` path.

### Installing on Windows

Install the
[Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
if it is not already present. Download the NSIS installer and its matching
checksum file into the same directory. Compare the checksum file with a fresh
hash:

```powershell
Get-Content .\OMXTerm-0.4.0-arm64.exe.sha256
(Get-FileHash .\OMXTerm-0.4.0-arm64.exe -Algorithm SHA256).Hash.ToLower()
```

Run `OMXTerm-0.4.0-arm64.exe`. It installs per-user without administrator
elevation; launch OMXTerm from the Start Menu. Because the installer is
intentionally unsigned, Microsoft Defender SmartScreen may warn that it is from
an unknown publisher. Review the source,
verify the checksum, and proceed only if you trust the exact artifact;
SmartScreen's `More info -> Run anyway` applies to that one file. Do not disable
SmartScreen or other system-wide Windows security protections.

On Windows the Default Shell is Windows PowerShell, falling back to the
`ComSpec` command processor; Windows has no login-shell concept, so the shell
starts as a plain interactive session in the user's home directory. Because
ConPTY does not expose the PTY foreground process name, every live session
counts as Busy: with `confirmClose` enabled, closing a tab, window, or the
application always asks once.

## Development

Source development targets ARM64 macOS, Linux, and Windows with Node.js 22.13
or later in the Node.js 22 line, or Node.js 24 or newer, and npm. Linux also needs the native build prerequisites listed in the
[contribution guide](CONTRIBUTING.md).

```sh
npm ci
npm run check:portable
```

On every Supported Platform, `npm run dev` builds the application and launches
it.

Project checks are available as root scripts:

- `npm run format` formats source files;
- `npm run format:check` checks formatting without changing files;
- `npm run typecheck` checks strict TypeScript types;
- `npm test` runs the complete automated test suite, including the scoped local
  PTY integration check;
- `npm run build` creates the unpackaged development build under `dist/`;
- `npm run check:portable` runs formatting, typechecking, the complete test
  suite, and the unpackaged build on every Supported Platform;
- `npm run package:mac` creates a local unsigned, non-notarized Apple Silicon
  DMG under `release/` and never publishes it;
- `npm run package:linux` creates
  `release/OMXTerm-<version>-arm64.AppImage` and never publishes it;
- `npm run package:win` creates the unsigned Windows ARM64 NSIS installer
  `release/OMXTerm-<version>-arm64.exe` and never publishes it;
- `npm run package:verify` inspects and starts the native package for the current
  macOS, Linux, or Windows ARM64 host;
- `npm run check` runs the full macOS packaging check;
- `npm run check:linux` runs formatting, typechecking, the complete test suite,
  the Linux ARM64 AppImage build, exact AppImage inspection, and isolated
  packaged startup through a real PTY;
- `npm run check:win` runs the same sequence for Windows: the ARM64 NSIS
  build, unpacked-application inspection, and isolated packaged startup
  through a real ConPTY.

See the [local ARM64 release procedure](docs/release.md) for prerequisites,
native package verification, exact-artifact manual checklists, checksum
generation, unsigned-package guidance, and the separately authorized
acceptance and publication gates.

## Configuration

OMXTerm optionally reads `$XDG_CONFIG_HOME/omxterm/config.json`, or
`~/.config/omxterm/config.json` when `XDG_CONFIG_HOME` is unset or empty. The
same XDG-style resolution applies on Windows, where the default location is
`%USERPROFILE%\.config\omxterm\config.json`. The
file is strict JSON: `version` is required and must be `1`. All preferences are
optional, so this is a complete configuration:

```json
{
  "version": 1
}
```

OMXTerm also optionally reads `snippets.json` from the same directory:
user-defined snippets listed in a per-window sidebar toggled with
`Cmd+Shift+S` on macOS or `Ctrl+Shift+S` on Linux and Windows, filtered by
search, and
injected into the terminal with a click. Application shortcuts are remappable
through the `keybinds`
preference.

See the [complete configuration guide](docs/configuration.md) for every field,
Otávio's real configuration, keybinds, snippets, external Terminal Themes, the
optional Ghostty conversion helper, and troubleshooting. OMXTerm never creates, rewrites, or migrates these files. Changes to
`config.json` and Terminal Themes require an application restart;
`snippets.json` is reread whenever the Snippets Sidebar opens.

## Documentation

- [Documentation map](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [Current product contract](docs/spec.md)
- [Versioning policy](docs/versioning.md)
- [Local arm64 release procedure](docs/release.md)
- [0.1.0 release notes](docs/releases/0.1.0.md)
- [0.2.0 release notes](docs/releases/0.2.0.md)
- [0.3.0 release notes](docs/releases/0.3.0.md)
- [0.4.0 release notes](docs/releases/0.4.0.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.

## License

OMXTerm source code is available under the [MIT License](LICENSE). Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
