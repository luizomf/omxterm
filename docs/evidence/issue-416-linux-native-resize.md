# #416: Linux transparent-window native resizing

## Candidate and upstream correction

This dependency-only candidate starts from
`bec1ee6734c50f5725a148af58e68cdb4dfefd87`, pins Electron **43.4.1** instead of
**43.1.1**, and retains application version **0.17.0-dev.0**. It restores the
existing native-resizing contract; it does not change window construction,
transparency, geometry, compositor metadata, security policy, or the spec.

- [OMXTerm issue #416](https://github.com/luizomf/omxterm/issues/416)
- [Electron correction #52947](https://github.com/electron/electron/pull/52947)
  (backport of #52740; commit
  `d5933667dc1fd52cd47c25a5ad6723d3916767a8`)
- [Official Electron 43.4.1 release](https://github.com/electron/electron/releases/tag/v43.4.1)
- [Linux frame-view implementation](https://github.com/electron/electron/blob/v43.4.1/shell/browser/ui/views/electron_frame_view_linux.cc)
- [Native window hit testing](https://github.com/electron/electron/blob/v43.4.1/shell/browser/native_window.cc)

The correction routes Linux non-client hit testing through
`ElectronFrameViewLinux` and supplies an internal 5-DIP resize band with 16-DIP
corners when restored frame insets are empty. Nonresizable, maximized, and
fullscreen windows are excluded. The experiment tests the complete official
runtime update, not an isolated custom build containing only that commit.

## Native red/green evidence

Completed on 2026-09-27, using ARM64 disposable guests at scale 1:

- Fedora 44, KWin 6.7.5 / KDE Wayland, XWayland 24.1.13.
- Ubuntu 26.04.1, GNOME Shell 50.1 / Wayland, XWayland 24.1.10.

Both use explicit Electron X11 and the existing Linux `--no-sandbox` exception
([ADR 0020](../adr/0020-default-linux-rendering-to-x11.md),
[ADR 0024](../adr/0024-disable-the-chromium-sandbox-on-linux.md)).
The foreground uses the baseline production window options and Restty source,
with synthetic output and an Adapter rather than a real PTY.

| Runtime / construction                              | KDE: right, bottom, bottom-right   | GNOME: right, bottom, bottom-right |
| --------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| 43.1.1, frameless, transparent                      | 720×480 unchanged after every drag | 720×480 unchanged after every drag |
| 43.1.1, change only transparent to false            | 810×480 → 810×540 → 900×600        | 810×480 → 810×540 → 900×600        |
| 43.4.1, original frameless transparent construction | 810×480 → 810×540 → 900×600        | 745×480 → 745×493 → 772×511        |

Every qualified drag verifies owned-window identity, acquired motion, Button1
press and release, and actual resulting bounds. No post-construction bounds or
size setter emulates resizing. KDE uses persistent XTest; the successful GNOME
43.4.1 run uses an ephemeral guest virtual mouse. Normal pointer acceleration
explains different stroke lengths. Failed acquisition and timed-out attempts are
excluded, not counted as resize failures. Historical 43.1.1 evidence is reused,
not rerun or overwritten.

Two-palette actual-compositor captures retain background alpha, opaque explicit
black cells and opaque glyph pixels. KDE retains blur; GNOME retains alpha
without an expected response to the KDE blur hint. These properties survive
further native resizing and hide/show. `_NET_WM_OPAQUE_REGION` remains empty
without rewriting it. Interior focus/selection, nonresizable/maximized/fullscreen
input guards, native restore, same-canvas/single-Adapter continuity, and GL error
0 also pass within the qualified runs.

The false-flag control is **not a fix**: actual composition becomes opaque.
Deleting its opaque-region hint is also rejected: native resize republishes it.
Backing alpha alone was insufficient evidence of compositor behavior.

Historical public records retain the detailed results and exclusions:

- [43.1.1 pointer differential](https://github.com/luizomf/omxterm/issues/416#issuecomment-5852110715)
- [Actual compositor differential and rejected workaround](https://github.com/luizomf/omxterm/issues/416#issuecomment-5852215082)
- [Primary-source upstream finding](https://github.com/luizomf/omxterm/issues/416#issuecomment-5852305730)
- [43.4.1 qualified runtime evaluation](https://github.com/luizomf/omxterm/issues/416#issuecomment-5852488772)

## Official runtime provenance

The official Linux ARM64 archive was checked against both release-API asset
digests and the vendor checksum file, then verified independently on both guests.
The actual runtime reports Electron **43.4.1**, Chromium **150.0.7871.224**, Node
**24.18.1**, and ARM64. The old runtime reports Electron 43.1.1 / Chromium
150.0.7871.114.

| Artifact                                             | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `electron-v43.4.1-linux-arm64.zip` (124689339 bytes) | `9e2b5cfbd387e138f06c7bb19b399bb3ee487dbb4110215df097d94e80431892` |
| Vendor `SHASUMS256.txt`                              | `25f71add08f0096e0dff844f0a1b8427da1e89f2e6c30eba47215936d574ced1` |
| Extracted AArch64 `electron` executable              | `400151439e10de18a14340a1cd0fce73b1ab07e91dcff155c763e27e7d3980ae` |

## Qualification boundary

### Real Linux product integration

Fresh independent `npm ci` installations, checksum-guarded node-pty/Restty
preparation, and native ARM64 node-pty rebuilds passed on both guests. Explicit
preparation reruns preserved the tested native-module bytes. The installed and
packaged Electron executables match the official executable digest above.

The unchanged `npm run check:portable` passed on **both** guests: formatting,
lint, typecheck, **111 test files / 1,083 tests passed**, six files / 30 tests
skipped by the existing platform conditions, and build. No test was weakened or
new skip introduced. The real host fixture starts and exits nine native PTYs,
checks input/output through the production Surface and IPC, observes resize in
every session, exercises bounded output and renderer-loss isolation, and cleans
its owned processes. This integration resizing is not the physical-edge
regression proof; the earlier pointer experiment supplies that evidence.

Runs use disposable ordinary-user accounts with isolated account homes,
configuration, state, cache, private D-Bus sessions, and authenticated XWayland.
No owner shell configuration is loaded. Fedora's required DejaVu font fixtures
are supplied only in the disposable account's font directory. Initial setup
attempts that advertised an unavailable Wayland socket or lacked font fixtures
are retained as failed setup, not qualified product runs. Corrected runs use the
same unchanged tests over X11/XWayland.

### Native packages, without installation

`npm run package:linux` passed independently on both guests. Exact AppImage
inspection checks ARM64 executable/addon architecture, application version,
ASAR contents, built application bytes, icons/licenses, forbidden/private-looking
entries, reviewed AppRun bytes, and the absence of the unversioned `libz.so`
dependency. Unpacked payloads match their exact AppImages. No artifact was patched
after packaging.

A private finite variant of the existing packaged-output probe validates the
literal explicit-command arguments, terminal environment, real PTY, parsed
`CSI 16 t` cell-size reply through the packaged Surface, and natural command exit
→ last-window closure → application exit 0. Operational events include PTY
startup, resize, exit and window closure; launch canaries remain redacted.

| Launch path                                         | Fedora / KDE | Ubuntu / GNOME                               |
| --------------------------------------------------- | ------------ | -------------------------------------------- |
| Native unpacked, explicit documented `--no-sandbox` | Pass         | Pass                                         |
| Exact AppImage, `--appimage-extract-and-run`        | Pass         | Pass                                         |
| Exact AppImage, direct kernel-FUSE launch           | Pass         | Unavailable: `fusermount3` permission denied |

The initial private unpacked invocation omitted the required early sandbox flag
and is excluded; correcting that launch argument changes no product policy.
Ubuntu's unavailable kernel-FUSE path is not a pass and no host permission or
security policy was weakened to enable it. The AppImage launcher supplies the
existing unconditional `--no-sandbox` flag naturally in both AppImage paths.

| Native build artifact                                         | Bytes     | SHA-256                                                            |
| ------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Fedora `OMXTerm-0.17.0-dev.0-arm64.AppImage`                  | 124463549 | `7a2e2125669c1a62fe00eb3d518d4ce6fa25ab735d92332339c7a02fd5c8550d` |
| Ubuntu `OMXTerm-0.17.0-dev.0-arm64.AppImage`                  | 124465525 | `37080f2a853d46e9ebb3e45aa6b6b842d05dd8a73175dd24239acc28405f8c0e` |
| Generated AppImage installer helper, identical in both builds | 6221      | `ad86ac9b1ef0d9c3dc8c4184339b22ef07e2d53ecd1f4bed7d30b0eea787d523` |

The helper's checksum and version were checked, but **installation was not
invoked**. The standard Linux `package:verify` performs an installation, so it was
not run or modified. This is non-installing candidate qualification, not full
release/installed-desktop verification. No desktop registration, application
installation, publication, macOS GUI or Windows execution occurred. Final
inventories show no owned processes or mounts; disposable accounts and copied
X11 authority files were removed. Private source/build evidence is retained.

### Remaining scope

No new repository regression test is added: current DOM/unit tests and native
fixtures do not acquire physical compositor edge/corner drags. A version-string
assertion, synthetic DOM event, or `setBounds` call would not reproduce this
external native hit-testing bug. Existing tests remain unchanged.

The native evidence does not cover every edge/corner, fractional scaling,
bare-metal GPUs, all desktops, native Wayland, or every product chrome/menu/
keybinding path. GNOME's final post-fullscreen compositor capture was refused
because the owned backdrop obscured the foreground; that capture remains
excluded. Before/after-resize and hide/show pairs are valid, and state guards were
qualified separately without the backdrop. Existing context isolation and disabled
Node integration were observed; OS sandbox enforcement is not claimed on Linux.

This is not a shipped fix, release, macOS/Windows qualification, or integration of
#415. Cross-platform qualification and independent review remain separate.
