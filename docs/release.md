# ARM64 release procedures

An owner request to prepare and publish a release covers the complete delivery:
version selection, build-environment preparation, native verification, release
records, tags, uploads and download verification. Carry that scope through to
subagents. Do not add per-step approval requests or a separate exact-artifact
acceptance round. Ask only when missing information blocks progress or a
necessary destructive consequence is outside the scope already given.

The technical checks below still apply. A failed check is a problem to diagnose,
not permission to weaken verification. Manual testing is optional.

## Release path

1. Select the version using [the versioning policy](versioning.md).
2. Compare with the previous published tag and record changed boundaries.
3. Build and verify on each native Supported Platform.
4. Collect the exact artifacts, checksums and verification evidence in the
   primary checkout's ignored `release/` directory.
5. Review source/version consistency, publish the release, then download and
   verify every uploaded file.

Keep issue/PR state and [`docs/releases/`](releases/) accurate. These records
capture work and evidence; they are not additional permission gates.

## Cross-platform release policy

The Supported Platforms and application packages are macOS arm64 DMG, Linux
arm64 AppImage and Windows arm64 NSIS. Linux also provides its versioned
per-user AppImage desktop installer and checksum. Build natively on each target,
using the VM's native filesystem rather than a host shared folder.

No artifact has a verified publisher identity. macOS uses a complete ad-hoc code
seal, without Apple Developer ID signing or notarization. Ad-hoc identity
changes may require renewed macOS privacy approvals; see the
[privacy identity investigation](macos-privacy-identity.md). Publisher signing,
certificates, notarization, x64, Intel macOS, additional package formats, paid CI
and unattended CI publication remain deferred. This does not prevent an agent
from completing an owner-requested release.

Each exact artifact requires its own native automated evidence. Manual testing
is optional and never blocks publication. Record material behavior that
current automation cannot observe as `UNVERIFIED`, with the affected platform
and user-facing risk. Never infer that a check passed on another OS or GPU.
Rebuilding changes artifact identity and requires fresh artifact verification.
Reuse valid evidence when nothing relevant changed.

### Artifact-affecting and documentation-only changes

Record each artifact's exact build commit. All artifact-affecting source must
be identical across platforms. Build commits normally match; they may differ
only through the documentation-only exception below.

A change qualifies for that exception when every changed path is a non-packaged
Markdown file and none is:

- `THIRD_PARTY_NOTICES.md`, a license or another packaged file;
- a package/version file, executable or test source, dependency, configuration,
  build input, asset, generated application file or other non-Markdown path.

Examples include non-packaged README files, tutorials, agent instructions,
release records and this procedure. Contract/ADR documentation changes that do
not change packaged bytes also qualify. Such changes do not invalidate unchanged
artifacts. If they introduce a new behavior or verification requirement, the
existing artifact must satisfy it; avoiding a rebuild does not waive the check.

Any non-eligible change invalidates earlier native records for that version.
Before publication, compare each artifact build commit with the intended tag;
the tag must point to it or a descendant differing only by eligible Markdown.
If that proof fails, rebuild from the new source.

Published releases are immutable: do not move published tags, replace assets
or reuse a published version. Later documentation corrections do not rewrite
published artifact identities.

## Version consistency

`package.json` and `package-lock.json` must contain the same final `X.Y.Z`.
The application version, `TERM_PROGRAM_VERSION`, tag `vX.Y.Z`, filenames,
checksum basenames and GitHub Release must agree. A `-dev` baseline is not
releasable. The Linux helper's embedded `--version` must also agree.

An ordinary release includes all three Supported Platforms. A platform omission
is a change in delivery scope, not an inferred pass, and must be stated in the
release record and notes.

## Build and automated verification

Release candidates use a fresh `npm ci` and explicit reruns of the existing
checksum-guarded node-pty and Restty preparation scripts. Unknown dependency
bytes fail preparation rather than silently reusing a stale patched runtime.

Portable checks include the production-Chromium image fixture with isolated
userData/sessionData. On Windows and Linux its non-activating window is visible:
hidden windows can stall actual frames. Production CSP, renderer isolation,
real animation frames, deadlines and exact bitmap comparisons remain required.
Elapsed time alone is not frame readiness.

Native checks exercise Restty through actual WebGL2 and owned PTYs: Default
Shell and explicit-command startup, input/output, resize, shutdown and renderer
loss; bundled and installed fonts; configuration/restart notices; and Pi/Chafa
images. Missing WebGL2 or irrecoverable context loss must fail visibly and clean
only the affected session. Synthetic DOM coverage is not a substitute.

Packaged verification launches the actual package with a synthetic owned PTY
command. A visible marker and `CSI 16 t` must produce a positive cell-size reply
from the packaged Surface before the proof file is created. Startup events or
a live shell alone are insufficient. The probe uses no user shell, configuration,
payload or persistent profile; its state is removed after verified termination.

### macOS arm64

Use Apple Silicon, Xcode Command Line Tools (Apple clang and the macOS SDK),
and Node.js 22.13+ in the 22 line, or Node.js 24+:

```sh
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check
```

This runs portable checks, builds `release/OMXTerm-<version>-arm64.dmg` and
verifies the packaged `release/mac-arm64/OMXTerm.app` with isolated state. The
verifier checks architecture, renderer, Surface, bundled fonts, native PTY helper,
licenses, startup and parsed output. It rejects source maps, tests, source trees,
alternate-architecture PTY binaries and common private/secret files.

The build also compiles `native/macos-window-blur.mm` into the generated
`dist/main/macos-window-blur.node`, using pinned build-only Node-API v8 headers
and `-mmacosx-version-min=12.0`. It uses no private header path or runtime
network/download. macOS builds fail on compilation errors; optional runtime
loading failures still fall back as documented in ADR 0030. Linux and Windows
do not compile or package this addon.

Packaging explicitly unpacks the addon beside the ESM main bundle and includes
it in the ad-hoc seal. Verification checks its ARM64 architecture and deployment
floor, loads it through the packaged runtime's ESM-relative ASAR path, and runs
the packaged synthetic PTY startup with blur requested. Native operation tests
use `test/integration/macos-window-blur.test.ts`; an optional bounded HUD/direct
fullscreen comparison is enabled with `OMXTERM_TEST_MACOS_FULLSCREEN=1` for that
test alone. It uses only owned synthetic windows, not user shells or captures.
Record the actual tested macOS version: minimum deployment metadata and a
successful private call are not proof of visible blur or older-OS compatibility.

The complete ad-hoc seal must pass `codesign --verify --deep --strict`; signature
metadata alone is insufficient. Unexpected publisher identities are rejected.
The DMG remains unsigned and unnotarized. Packaging-only commands are
`npm run package:mac` followed by `npm run package:verify`.

### Linux arm64

Use native Linux arm64, a supported Node.js version, `python3`, `make`, a C++
compiler (`build-essential` on Ubuntu), `readelf` (`binutils`), `fontconfig`
utilities and an authenticated X11/XWayland session. Native Wayland is not
claimed. GUI tests need an unlocked desktop; arrange the session and a bounded
idle inhibitor as part of test setup rather than treating locking as a product
failure. Preserve unrelated user activity.

Run as an ordinary user. The shipped Linux-only `--no-sandbox` policy is fixed
(ADR 0024); no privileged sandbox helper or host-policy change is needed.

```sh
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check:linux
```

Postinstall rebuilds node-pty against Electron's Linux arm64 runtime. The full
command runs portable/native checks, packages the AppImage, creates the exact
versioned desktop-installer helper and both checksums, then verifies them.
It extracts the exact AppImage and checks architecture, native module, runtime,
version, icon, licenses and forbidden/private-looking files. It rejects the
unversioned `libz.so` development dependency. The statically linked runtime
needs neither zlib development headers nor system `libfuse2`.

Verification checks the exact reviewed AppRun bytes and unconditional
`--no-sandbox` flag, installs through the exact helper into an isolated home,
and launches the installed app through extraction and normal kernel-FUSE
mounting when the installation probe establishes that direct mounting is
available. Each available path must reach a PTY and parsed-output proof without
logging the environment canary. An unavailable FUSE seam is not a passing test.

Packaging applies a checksum-guarded correction to the pinned packager's launcher
generator before loading electron-builder. Unknown bytes or unprepared direct
packager invocation are rejected. Dependency updates require reviewing the
correction and launcher digest together; finished artifacts are never patched.
Packaging-only commands are `npm run package:linux` and `npm run package:verify`.

When kernel-FUSE mounting is unavailable:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
```

This addresses mounting, not sandboxing. Release notes disclose the unsigned
artifact and fixed Linux sandbox exception.

### Windows arm64

Use native Windows ARM64 and its native filesystem. Git checkouts use
`core.autocrlf=false` and `core.symlinks=true`; confirm LF files and real symlinks.
Build prerequisites include supported Node.js, ARM64 Visual C++ Redistributable,
symlink capability (normally Developer Mode), and a graphical execution session.
SSH session 0 does not prove graphical readiness. A process-scoped `RemoteSigned`
policy can support local scripts without changing the persisted execution
policy. Preserve normal PATH entries when adding portable tools.

Preparing these prerequisites in a disposable VM supplied for the release is
part of the task, not another approval round. Keep Defender and SmartScreen
active and do not weaken product or verifier checks.

#### Exact installer effects

NSIS `/D=` changes the destination, not application identity. Installation may
remove a registered old version and change shared registration and shortcuts.
Use a disposable VM with a recoverable snapshot; the old installation is not
restored by verification. Preserve needed artifacts and evidence outside the
snapshot before any recovery. Detect active OMXTerm/installer conflicts rather
than terminating unrelated user work.

The CLI opt-in records the intended destructive test mode; the release agent
supplies it within the owner's existing disposable-VM task scope:

```powershell
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check:win -- --disposable-vm-allow-omxterm-replacement
```

Without that literal option, verification fails closed. Environment variables
do not substitute for it. The verifier inspects HKCU/HKLM registration in both
views, default locations, shortcuts, matching processes, and reparse points in
installation trees and their ancestors. Unknown/unreadable/oversized trees,
path-only conflicts, machine installs, orphan registration and unexpected
shortcuts are refused. Supported replacement is a known per-user installation
whose directory and regular application/uninstaller files exist.

Process checks cover the NSIS name-based fallback and case-insensitive path
prefix, including sibling paths sharing that prefix. Quoting-incompatible paths
are refused. The transaction temp path must contain no spaces because NSIS
expects an unquoted raw `/D=` tail. These checks cannot eliminate host races;
use the disposable VM even if it appears clean.

The pinned NSIS installer also writes
`%LOCALAPPDATA%\\omxterm-updater\\installer.exe` despite the absence of automatic
updates. Pre-existing cache directories/files or reparse points are refused.
Preserve and reconcile existing state or use a clean snapshot; do not delete
unknown cache data to bypass inspection.

The full command runs portable and real-ConPTY checks, packages the exact NSIS
installer, verifies arm64 PE files, node-pty runtime, version, licenses and
forbidden/private files, installs into a transaction-owned directory, compares
every extracted payload byte and checks both unpacked and installed startup.
Both must reach PTY and parsed-output proof without logging environment or
launch-argument canaries.

Cleanup invokes only the owned byte-identical new uninstaller, from outside its
install-path termination prefix. `_?=` selects the owned root without detached
relaunch. Registration, shortcuts and processes must be gone before owned
temporary directories are removed. The new cached installer is removed only
when its digest matches and the remaining cache directory is empty. Changed
cache state, nonempty directories or uncertain ownership are retained and fail
cleanup. User data is not deleted. Startup and cleanup failures are preserved
together; uncertain process termination retains the profile for diagnosis.

Packaging-only: `npm run package:win`. Non-installing diagnostics:

```powershell
npm run package:verify -- --windows-unpacked-only
```

This is explicitly **UNPACKED DIAGNOSTIC ONLY** and cannot establish exact NSIS
verification. Full `package:verify` takes the same disposable-VM CLI option as
`check:win`. Changing application identity, repacking or archive-only extraction
is not equivalent to testing the shipped installer.

The installer uses zip compression because ARM64 BCJ2-filtered LZMA payloads
lose PE files with the pinned extraction plugin. Differential packaging is
disabled; no `latest.yml` or `.blockmap` is needed because there are no automatic
updates. Changes to packaging inputs require rechecking the inspection footprint.

## Exact-artifact verification record

Map each changed boundary to its existing automated seam: portable behavior,
platform behavior, packaging/runtime, security/privacy/IPC/input/filesystem,
rendering/desktop integration, or version metadata/documentation. Record a
material unobservable boundary as `UNVERIFIED` with its risk, not as a pass.
Historical manual testing is context, not a checklist to replay.

Keep one compact record per platform:

```text
Version: <X.Y.Z>
Platform: <supported OS and architecture>
Source commit: <full SHA>
Artifact: <filename>
Byte size: <integer>
SHA-256: <lowercase digest>
Native automated verification: <PASS/FAIL and safe summary>
Changed boundaries: <automated seam or UNVERIFIED risk>
Optional observations: <none, or non-blocking observations>
Cleanup: <COMPLETE/INCOMPLETE with reason>
Publication: <PENDING/PUBLISHED with URL>
```

Do not put private paths, credentials, configuration contents, Terminal Payload,
clipboard data or transcripts in public evidence. Technical failures, missing
identity proof or incomplete cleanup block publication. No owner sign-off is
added after these checks pass within the requested release scope.

### Checksums

After native verification, preserve each exact filename:

```sh
# macOS, from release/
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256

# Linux, checksums generated by package:linux
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check OMXTerm-<version>-arm64.AppImage-installer.sh.sha256
./OMXTerm-<version>-arm64.AppImage-installer.sh --version
```

```powershell
# Windows, from release/
$name = "OMXTerm-<version>-arm64.exe"
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

Recompute and compare Windows hashes before collection. Rebuilding or changing
an artifact invalidates its earlier checksum and artifact evidence.

## Publication

Confirm repository `luizomf/omxterm`, version consistency, build-to-tag ancestry,
eligible Markdown-only differences, passing native verification and complete
cleanup. Create the tag and GitHub Release within the owner's release request;
there is no additional approval checkpoint.

Summarize changes, migrations or their absence, known limitations and provenance.
Attach exactly these eight files for an ordinary three-platform release:

- `OMXTerm-<version>-arm64.dmg` and its `.sha256`;
- `OMXTerm-<version>-arm64.AppImage` and its `.sha256`;
- `OMXTerm-<version>-arm64.AppImage-installer.sh` and its `.sha256`;
- `OMXTerm-<version>-arm64.exe` and its `.sha256`.

Download every attachment after publication and verify sizes and checksums on a
trustworthy byte-verification host. Preserve the final URL and evidence, then
clean up task-owned resources without losing artifacts still in use.

### Gatekeeper and provenance note

> OMXTerm for Apple Silicon is intentionally not signed with an Apple Developer
> ID and is not notarized. macOS may warn that it cannot verify the developer or
> check the app for malicious software. Review the source, verify the published
> SHA-256, and proceed only if you trust this exact artifact. If you choose to
> open it, follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
> in System Settings -> Privacy & Security. Do not disable system-wide macOS
> security protections. The application has an ad-hoc integrity seal, not a
> verified publisher identity.

### SmartScreen and provenance note

> OMXTerm for Windows ARM64 is intentionally not signed with a code-signing
> certificate. Microsoft Defender SmartScreen may warn that the installer is
> from an unknown publisher. Review the source, verify the published SHA-256,
> and proceed only if you trust this exact artifact. If you choose to install
> it, use SmartScreen's `More info -> Run anyway` for this one file. Do not
> disable SmartScreen or other system-wide Windows security protections.

Provenance may describe native automation and optional maintainer dogfood.
It must not imply an independent audit, platform-vendor approval, universal
manual coverage or verified publisher identity.
