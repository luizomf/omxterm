# OMXTerm

OMXTerm is an open-source personal desktop terminal for ARM64 macOS, Linux,
and Windows.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The current published version is `0.8.0`. Its exact native artifacts passed
mandatory automated verification and received owner acceptance on every
Supported Platform. That release's optional cross-platform observations are
[exceptional factual historical provenance](docs/releases/0.8.0.md#changed-boundary-verification-plan),
not routine validation, a manual-coverage requirement, inferred coverage, or a
reusable gate under the
[current automation-first policy](docs/release.md#automation-first-exact-artifact-acceptance).
The
[GitHub Releases page](https://github.com/luizomf/omxterm/releases/tag/v0.8.0) provides:

- `OMXTerm-0.8.0-arm64.dmg` for Apple Silicon macOS;
- `OMXTerm-0.8.0-arm64.AppImage` and
  `OMXTerm-0.8.0-arm64.AppImage-installer.sh` for Linux ARM64; and
- `OMXTerm-0.8.0-arm64.exe` for Windows ARM64.

Every package is ARM64-only and intentionally carries no verified publisher
identity; the macOS application uses an ad-hoc code seal for bundle integrity
but has no Apple Developer ID signature or notarization. Each asset has a
matching `.sha256` file. Verify the checksum before opening an asset, and read
the [0.8.0 release notes](docs/releases/0.8.0.md) for changes,
compatibility, provenance, and known limitations.

## Installation

The commands below install the published 0.8.0 assets.

### Installing on macOS

Download the DMG and its matching checksum file into the same directory, then
verify it:

```sh
shasum -a 256 -c OMXTerm-0.8.0-arm64.dmg.sha256
```

Open the DMG, drag `OMXTerm.app` to Applications, eject the DMG, and launch
OMXTerm from Applications.

Because the app has no Apple Developer ID signature and is not notarized, macOS
may warn that it cannot verify the developer or check the app for malicious
software. Review the source
and proceed only if you trust the exact artifact. If you choose to open it,
follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
in System Settings -> Privacy & Security. Do not disable system-wide macOS
security protections.

### Installing on Linux

Download the AppImage and its separately downloaded, published matching
checksum file into the same directory. The checksum verifies the downloaded
AppImage bytes; it does not provide a publisher identity. Verify the download
and make it executable:

```sh
sha256sum --check OMXTerm-0.8.0-arm64.AppImage.sha256
chmod +x OMXTerm-0.8.0-arm64.AppImage
```

The AppImage is ready to run and does not need a system-wide installer. Its
unsigned status means Linux distributions receive no publisher identity to
verify. Linux needs the `fontconfig` utilities for configured system-font
validation. The statically linked AppImage runtime does not require zlib
development headers or a system `libfuse2` library. Before first launch, choose
the command for the host: ordinary execution uses kernel FUSE mounting, while
the supported fallback extracts and runs without it.

```sh
./OMXTerm-0.8.0-arm64.AppImage
# If kernel FUSE mounting is unavailable:
./OMXTerm-0.8.0-arm64.AppImage --appimage-extract-and-run
```

OMXTerm defaults to Electron's X11 backend. A Wayland desktop must provide
XWayland; native Wayland rendering is not currently claimed. An explicit
Electron `--ozone-platform` argument overrides the default for diagnosis.

### Installing on Windows

Install the
[Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
if it is not already present. Download the NSIS installer and its matching
checksum file into the same directory, then verify it automatically:

```powershell
$installerName = "OMXTerm-0.8.0-arm64.exe"
$checksumName = "$installerName.sha256"
$checksumRecord = Get-Content -LiteralPath $checksumName -Raw
$checksumMatch = [regex]::Match(
  $checksumRecord,
  '\A(?<digest>[0-9A-Fa-f]{64})[ \t]+(?<filename>\*?\S+)(?:\r?\n)?\z'
)

if (-not $checksumMatch.Success) {
  throw "The checksum file is malformed."
}

$recordedName = $checksumMatch.Groups['filename'].Value.TrimStart('*')
if ($recordedName -cne $installerName) {
  throw "The checksum file names a different installer: $recordedName"
}

$expectedHash = $checksumMatch.Groups['digest'].Value
$actualHash = (Get-FileHash -LiteralPath $installerName -Algorithm SHA256).Hash
if (-not [StringComparer]::OrdinalIgnoreCase.Equals($actualHash, $expectedHash)) {
  throw "SHA-256 verification failed for $installerName"
}

Write-Host "SHA-256 verification succeeded for $installerName"
```

Run `OMXTerm-0.8.0-arm64.exe`. It installs per-user without administrator
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

### Advanced installation and recovery

#### Troubleshooting stale macOS privacy permissions

After repeatedly installing and removing different OMXTerm builds, macOS may
show permissions as enabled for OMXTerm while programs launched from it still
cannot use protected capabilities. This can affect tools that monitor,
intercept, or synthesize global keyboard or mouse input even when the same tools
work in another terminal with apparently identical permissions.

To clear OMXTerm's app-specific privacy records and grant them again:

1. Quit OMXTerm and remove `OMXTerm.app`.
2. Run:

   ```sh
   tccutil reset All com.otaviomiranda.omxterm
   ```

3. Reinstall OMXTerm from the verified DMG and open it.
4. Grant the required permissions again in System Settings -> Privacy &
   Security. Tools that control global input commonly require Accessibility
   and/or Input Monitoring permission.
5. Quit and reopen OMXTerm after changing the permissions.

The reset command is scoped to OMXTerm's bundle identifier; it does not reset
privacy permissions for other applications.

#### Add OMXTerm to Linux Activities and the Dock

Running an AppImage directly does not register it with the desktop. The Terminal
Window has the OMXTerm icon, but GNOME may show a placeholder in Activities or
the Dock until you create a desktop entry.

Releases that include the optional installer provide its own matching checksum.
Verify both downloaded assets, make them executable, and run this one install
command from their directory:

```sh
sha256sum --check OMXTerm-0.8.0-arm64.AppImage.sha256
sha256sum --check OMXTerm-0.8.0-arm64.AppImage-installer.sh.sha256
chmod +x OMXTerm-0.8.0-arm64.AppImage OMXTerm-0.8.0-arm64.AppImage-installer.sh
./OMXTerm-0.8.0-arm64.AppImage-installer.sh install ./OMXTerm-0.8.0-arm64.AppImage
```

The helper does not authenticate a publisher or replace either checksum check.
It does not download or verify network content, use a package manager, or
request administrator access. It only structurally validates the user-supplied
local Linux ARM64 OMXTerm AppImage, then transactionally installs the per-user
AppImage, icon, and desktop entry. At installation time it tests actual kernel
FUSE mounting and fixes the desktop launcher to direct execution or
`--appimage-extract-and-run`. Rerun the same install command to update all three
files or after the host's FUSE availability changes. To remove only those files
while preserving unrelated files and parent directories, run:

```sh
./OMXTerm-0.8.0-arm64.AppImage-installer.sh uninstall
```

If installation reports invalid input, confirm that the AppImage is the
checksum-verified Linux ARM64 OMXTerm asset and that `file` is installed. A
failed update preserves the previous installation; correct the reported
filesystem problem and rerun it.

The manual user-level setup below remains supported and needs no administrator
access. Run it from the directory containing the verified AppImage:

```sh
app="$HOME/.local/opt/omxterm/OMXTerm.AppImage"
icon="$HOME/.local/share/icons/hicolor/1024x1024/apps/omxterm.png"
desktop="$HOME/.local/share/applications/omxterm.desktop"

# Keep the runnable AppImage and icon outside the temporary extraction tree.
install -Dm755 OMXTerm-0.8.0-arm64.AppImage "$app"
extract_dir="$(mktemp -d)"
(
  cd "$extract_dir"
  "$app" --appimage-extract \
    usr/share/icons/hicolor/1024x1024/apps/omxterm.png >/dev/null
  install -Dm644 \
    squashfs-root/usr/share/icons/hicolor/1024x1024/apps/omxterm.png \
    "$icon"
)
rm -rf -- "$extract_dir"

mkdir -p "$(dirname "$desktop")"
cat > "$desktop" <<EOF
[Desktop Entry]
Name=OMXTerm
Exec="$app" %U
Terminal=false
Type=Application
Icon=$icon
StartupWMClass=omxterm
Categories=Utility;TerminalEmulator;
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications"
fi
```

Search for **OMXTerm** in Activities, launch it, and optionally pin it to the
Dock. The desktop entry points to permanent user files, not to the temporary
`squashfs-root`; deleting an extraction directory therefore cannot break the
icon. To update later, verify the new AppImage and overwrite
`~/.local/opt/omxterm/OMXTerm.AppImage`. If FUSE mounting is unavailable, add
`--appimage-extract-and-run` after `"$app"` in the desktop entry's `Exec` line.

## Launching an explicit command

Use `-e <program> [arguments...]` to run one explicit command in the first
Terminal Tab of a new OMXTerm process. On macOS, for example:

```sh
open -na OMXTerm --args -e nvim /tmp/scratch.txt
```

OMXTerm passes the program and every following argument directly to the PTY.
It does not construct a command string, rewrite arguments, or insert a shell.
If shell syntax is needed, choose the shell explicitly and provide its literal
arguments:

```sh
open -na OMXTerm --args -e /bin/zsh -lc 'printf "%s\n" "hello"'
```

Only the initial tab consumes the request. Later tabs and windows start the
Default Shell normally. The explicit command starts in the user's home
directory with the inherited environment and OMXTerm's standard terminal
capabilities. A trailing `-e` without a program is rejected instead of falling
back to the Default Shell.

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
- `npm run lint` runs the type-aware TypeScript policy with zero accepted
  warnings;
- `npm run typecheck` checks strict TypeScript types;
- `npm test` runs the complete automated test suite, including the scoped local
  PTY integration check;
- `npm run build` creates the unpackaged development build under `dist/`;
- `npm run check:portable` runs formatting, lint, typechecking, the complete
  test suite, and the unpackaged build on every Supported Platform;
- `npm run package:mac` creates a local Apple Silicon DMG under `release/` and
  never publishes it; its application is ad-hoc sealed but has no Developer ID
  signature or notarization;
- `npm run package:linux` creates the versioned Linux ARM64 AppImage, optional
  desktop-installer helper, and both matching checksums under `release/`, and
  never publishes them;
- `npm run package:win` creates the unsigned Windows ARM64 NSIS installer
  `release/OMXTerm-<version>-arm64.exe` and never publishes it;
- `npm run package:verify` inspects and starts the native package for the current
  macOS, Linux, or Windows ARM64 host;
- `npm run check` runs the full macOS packaging check;
- `npm run check:linux` runs the portable quality gate, the Linux ARM64 AppImage
  and helper build, exact filenames, checksums, metadata, dependency, content,
  and transactional installation checks, and isolated installed startup through
  a real PTY using the extraction fallback plus normal FUSE mounting when that
  seam is available;
- `npm run check:win` runs the same shared portable sequence for Windows: the
  ARM64 NSIS build, unpacked-application inspection, and isolated packaged startup
  through a real ConPTY.

See the [local ARM64 release procedure](docs/release.md) for prerequisites,
native package verification, changed-boundary evidence, checksum generation,
unverified-publisher guidance, and the separately authorized acceptance and
publication gates.

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
step-by-step examples, keybinds, snippets, external Terminal Themes, the
optional Ghostty conversion helper, and troubleshooting. OMXTerm never creates, rewrites, or migrates these files. Use `View -> Reload
User Configuration` to apply `config.json` and Terminal Theme changes manually;
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
- [0.4.1 release notes](docs/releases/0.4.1.md)
- [0.8.0 release notes](docs/releases/0.8.0.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.

## License

OMXTerm source code is available under the [MIT License](LICENSE). Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
