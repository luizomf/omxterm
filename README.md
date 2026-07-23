# OMXTerm

OMXTerm is an open-source personal desktop terminal for ARM64 macOS, Linux,
and Windows.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The current published release is `v0.3.0`, available from the
[GitHub Releases page](https://github.com/luizomf/omxterm/releases) as an
unsigned, non-notarized Apple Silicon DMG with its SHA-256 checksum. Linux
ARM64 AppImage packaging is implemented but is not part of that published
release. The source package is prepared at version `0.4.0`, but that version
change does not publish a release. Outside release preparation, `main` carries
a `-dev` development baseline under the [versioning policy](docs/versioning.md).

## Development

Source development targets ARM64 macOS, Linux, and Windows with Node.js 22 or
newer and npm. Linux also needs the native build prerequisites listed in the
[contribution guide](CONTRIBUTING.md).

```sh
npm ci
npm run check:portable
```

The current published `v0.3.0` artifact is macOS-only. Linux ARM64 AppImage
and Windows ARM64 NSIS packaging are implemented but are not part of that
published release. On every Supported Platform, `npm run dev` builds the
application and launches it.

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

### Running the Linux AppImage

The AppImage is portable: make it executable if necessary and run it without an
installer:

```sh
chmod +x release/OMXTerm-<version>-arm64.AppImage
./release/OMXTerm-<version>-arm64.AppImage
```

Its unsigned status means Linux distributions do not receive a publisher
identity to verify. Linux needs the `fontconfig` utilities for configured
system-font validation. OMXTerm defaults to Electron's X11 backend; a Wayland
session must provide XWayland. Native Wayland remains unclaimed because the
supported ARM64 VM started without presenting a visible window. An explicit
Electron `--ozone-platform` argument overrides the default for diagnosis and
future retesting. The default AppImage mount path requires FUSE 2 (for example
`libfuse2t64` on Ubuntu 24.04 or `libfuse2` on older Ubuntu releases).
When FUSE 2 cannot be installed, use the AppImage runtime's safe extraction
fallback:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
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
Exec=/absolute/path/to/OMXTerm-<version>-arm64.AppImage %U
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

### Running the Windows installer

`npm run package:win` produces the unsigned one-click NSIS installer
`release/OMXTerm-<version>-arm64.exe`, which installs per-user and needs no
administrator elevation. Its application payload is zip-compressed, which makes
the installer larger than the macOS or Linux artifact but is required for the
installer to extract completely on ARM64 (see the
[release procedure](docs/release.md) for the underlying 7-Zip filter reason).

Because the installer is intentionally unsigned, Microsoft Defender
SmartScreen warns that it is from an unknown publisher. Review the source,
verify the published SHA-256 checksum, and proceed only if you trust the
exact artifact; SmartScreen's `More info -> Run anyway` applies to that one
file. Do not disable SmartScreen or other system-wide Windows security
protections.

On Windows the Default Shell is Windows PowerShell, falling back to the
`ComSpec` command processor; Windows has no login-shell concept, so the shell
starts as a plain interactive session in the user's home directory. Because
ConPTY does not expose the PTY foreground process name, every live session
counts as Busy: with `confirmClose` enabled, closing a tab, window, or the
application always asks once.

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
optional Ghostty conversion helper, and troubleshooting. OMXTerm never
creates, rewrites, migrates, or reloads these files.

## Documentation

- [Documentation map](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [Current product contract](docs/spec.md)
- [Versioning policy](docs/versioning.md)
- [Local arm64 release procedure](docs/release.md)
- [0.1.0 release notes](docs/releases/0.1.0.md)
- [0.2.0 release notes](docs/releases/0.2.0.md)
- [0.3.0 release notes](docs/releases/0.3.0.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.

## License

OMXTerm source code is available under the [MIT License](LICENSE). Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
