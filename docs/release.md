# ARM64 release procedures

A release request covers version selection, environment preparation, native
verification, tagging, uploads and download verification. Manual testing is
optional. Use [versioning.md](versioning.md) to select the version and
[development.md](development.md#platform-prerequisites) to prepare each desktop.

## Release path

1. Compare current source with the previous published tag and identify changed
   behavior, dependencies and package inputs.
2. Reuse valid existing evidence and perform missing or invalidated steps on each
   native target: macOS ARM64 DMG, Linux ARM64 AppImage and Windows ARM64 NSIS.
3. Collect exact artifacts, checksums and local verification evidence in the
   primary checkout's ignored `release/` directory.
4. Record results and coverage limits in the release issue/PR, publish the tag and
   GitHub Release, then download and verify every attachment.
5. Clean up task-owned resources without losing artifacts still in use.

Durable execution records belong in GitHub releases/issues/PRs, not new files under
`docs/releases/` or `docs/evidence/`. The current tree contains procedures, not a
per-release log. Previous Git commits and GitHub records remain available for
input-based evidence reuse.

## Evidence reuse

Build natively on the target platform, using its native filesystem rather than a
host shared folder. Record these identities separately:

| Step                        | Identity                                                                             | Repeat when                                                     |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Behavioral tests            | Full tested SHA, commands/assertions, prepared dependencies and relevant environment | Relevant behavior, dependencies, fixtures or environment change |
| Package build               | Full build SHA, version, build/packager inputs and native platform                   | Packaged bytes, version, dependencies or build recipe change    |
| Exact-artifact verification | Build SHA, filename, size, SHA-256, verifier inputs/results and cleanup              | Artifact bytes or applicable verification inputs change         |
| Publication                 | Tag SHA, build-to-tag comparison, asset identities and downloaded-byte checks        | Upload/download evidence is missing                             |

Reuse a recorded PASS from Git or a previous issue/PR only with known equivalent
relevant inputs. Missing provenance prevents reuse of that evidence. Retain
observed failures and record diagnosis, changed inputs, fix or current risk; a
later pass does not erase a FAIL. An unrelated old gap is not automatically a
candidate blocker. Resume the applicable step rather than restarting every
install/test/build command.

### Changed inputs and build-to-tag comparison

Keep each artifact's original full build SHA; do not relabel it as the tag SHA.
Before publication, establish build-to-tag ancestry and inspect the complete diff:

```sh
git merge-base --is-ancestor <build-sha> <tag-sha>
git diff --stat <build-sha> <tag-sha>
git diff <build-sha> <tag-sha>
```

Classify by effective inputs, not file extensions:

- Non-packaged documentation does not invalidate product bytes. Test/fixture-only
  changes need affected tests, not unchanged package rebuilds. Packaged notices
  and licenses are artifact inputs.
- Version-only metadata requires new native packages and version/package checks,
  not unchanged behavioral reruns. Never reuse an old-version package.
- Product, assets, dependency preparation and build/packaging changes invalidate
  affected evidence/artifacts. Resolve unclear impact before claiming equivalence.
- Orchestration-only changes can preserve artifacts only when retained metadata,
  prepared bytes, build inputs and effective packager arguments are unchanged.
  Pinned electron-builder strips `scripts` from packaged metadata; the regression
  seam is `test/unit/release-packaged-metadata.test.ts`. Version, dependencies,
  `main` and changed build recipes are not covered by that exemption.

A descendant tag can include verified non-artifact differences. Record the
comparison with the original build SHA and digest; rebuild affected artifacts
when equivalence cannot be established. Do not rebuild merely to publish.

## Version consistency

`package.json`, `package-lock.json`, application version, `TERM_PROGRAM_VERSION`,
tag `vX.Y.Z`, artifact filenames, checksum basenames and GitHub Release must
agree on final `X.Y.Z`. `linux_install.sh --version` must agree too. A `-dev`
baseline is not releasable.

An ordinary release includes all three platforms. State an intentional platform
omission as a delivery-scope change, not a pass on the omitted target.

## Build and automated verification

For an unprepared checkout or changed locked dependencies, run `npm ci`.
Postinstall installs Electron and runs checksum-guarded node-pty/Restty preparation.
For changed preparation inputs with the same installed lockfile, rerun
`npm run postinstall`. Unknown dependency bytes require review. Do not prepare
shared dependency directories from another worktree.

The default suite includes real PTY/WebGL2 fixtures but retains platform guards
and explicit opt-ins; see [qualification scope](development.md#qualification-scope).
Executed assertions do not qualify physical input, every native dialog, visible
compositor blur or every runtime interleaving.

The package verifier checks ARM64 architecture, content, version, licenses,
prepared native runtime, forbidden/private-looking files and packaged startup.
Its synthetic owned PTY command emits a marker and obtains a positive `CSI 16 t`
cell-size reply before creating its readiness proof. Startup events alone are
insufficient. The probe uses isolated configuration/profile state and checks
that environment/launch-argument canaries do not appear in diagnostics. Process
termination must be verified before profile removal.

### Resume and version-only commands

`check`, `check:linux` and `check:win` run `check:portable`, package its build once
through `package-built:*`, then verify. Standalone `package:mac`, `package:linux`
and `package:win` build fresh.

After an established current native build whose `dist`, product/build inputs and
prepared dependencies still match:

```sh
npm run package-built:mac    # or package-built:linux / package-built:win
npm run package:verify      # Windows requires the disposable-VM option below
```

`package-built:*` has no implicit cache validation. Use `package:*` when current
build provenance is missing. Packaging does not run behavioral tests.

For a version-only change with valid behavioral evidence:

```sh
npm version X.Y.Z --no-git-tag-version --ignore-scripts
npx vitest run test/unit/release-version.test.ts
npm run package:mac         # or package:linux / package:win
npm run package:verify      # Windows: -- --disposable-vm-allow-omxterm-replacement
```

Run native packaging/verification on each affected platform. macOS also needs the
mounted exact-DMG check below. If packaging succeeded but verification is missing
or failed, preserve the artifact and resume verification, not another build.

### macOS arm64

On Apple Silicon with Xcode Command Line Tools and supported Node.js:

```sh
npm ci
npm run check
```

This checks the staging app `release/mac-arm64/OMXTerm.app`, not the final DMG.
Verify the exact image and its read-only mounted application from the repository:

```sh
(
  set -eu
  version="$(node -p 'require("./package.json").version')"
  dmg="release/OMXTerm-$version-arm64.dmg"
  hdiutil verify "$dmg"
  mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/omxterm-dmg.XXXXXX")"
  cleanup() {
    verify_status=$?
    trap - EXIT
    hdiutil detach "$mount_dir" || exit 1
    rmdir "$mount_dir" || exit 1
    exit "$verify_status"
  }
  trap cleanup EXIT
  hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$dmg"
  npm run package:verify -- "$mount_dir/OMXTerm.app"
)
```

A mount/detach failure is not success. Inspect the mount point and finish cleanup;
never delete a mounted volume.

The build compiles the macOS blur addon with Node-API v8 headers and a macOS 12.0
deployment floor. Packaging unpacks it beside the ESM bundle and includes it in
the ad-hoc seal. Verification checks architecture/deployment metadata and loads
the addon through packaged Electron. Record the tested OS: metadata and a
successful native call do not prove visible blur or older-OS compatibility.

The app's complete ad-hoc seal must pass `codesign --verify --deep --strict`.
There is no Developer ID signature, notarization or verified publisher identity;
the DMG is unsigned. Ad-hoc identity changes may require renewed macOS privacy
approvals. Packaging-only uses `npm run package:mac`, followed by staging and
exact-DMG verification.

### Linux arm64

Use an ordinary user in an authenticated, unlocked X11/XWayland desktop with the
[Linux prerequisites](development.md#linux):

```sh
npm ci
npm run check:linux
```

This creates the AppImage, exact `linux_install.sh` helper and both checksums.
Verification extracts the AppImage and inspects the reviewed AppRun bytes,
unconditional `--no-sandbox`, runtime, assets and package contents. The statically
linked AppImage runtime needs neither zlib development headers nor system
`libfuse2`; unversioned `libz.so` is rejected.

The exact helper installs into an isolated home. Startup uses extraction and
also direct kernel-FUSE mounting when the installation probe finds it available.
An unavailable mount path is not a pass. Startup explicitly pins X11; it does not
qualify default-backend relaunch. The verifier deletes the isolated installation
home rather than invoking helper `uninstall`; synthetic source-helper tests are
not exact published-helper uninstall evidence.

Packaging applies a checksum-guarded launcher-generator preparation before
loading electron-builder. Finished artifacts are not patched. Packaging-only:
`npm run package:linux`, then `npm run package:verify`. Mounting fallback:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
```

Extraction changes mounting, not the fixed Linux sandbox exception.

### Windows arm64

Use native ARM64 Windows, its native filesystem, Developer Mode/symlink permission,
ARM64 Visual C++ Redistributable and the logged-in, unlocked desktop. Preserve LF
and repository links with `core.autocrlf=false` and `core.symlinks=true`.
A process-scoped `RemoteSigned` PowerShell shell can permit local scripts without
changing persistent policy; organizational policy still applies. Keep Defender,
SmartScreen and normal PATH entries intact.

**Exact NSIS verification can replace an existing installation.** `/D=` changes
only destination, not app identity, registration, shortcuts or old-version
removal. Use an authorized disposable VM with a recoverable snapshot. Preserve
artifacts outside the snapshot before recovery; verification does not restore an
old installation. Do not terminate unrelated OMXTerm/installer processes.

```powershell
npm ci
npm run check:win -- --disposable-vm-allow-omxterm-replacement
```

The literal option is required; an environment variable does not substitute.
Inspection checks registration in both HKCU/HKLM views, locations, shortcuts,
processes and reparse points. Unknown/unreadable state, machine installs, orphan
registration and conflicting processes are refused. Supported replacement is a
known per-user install with regular app/uninstaller files. The transaction path
must have no spaces because NSIS expects an unquoted `/D=` tail. Inspection does
not eliminate host races; the disposable VM remains necessary.

NSIS writes `%LOCALAPPDATA%\\omxterm-updater\\installer.exe` despite no automatic
updates. Pre-existing cache entries/reparse points are refused; reconcile known
state or use a clean snapshot, not deletion of unknown data to bypass inspection.

Verification checks the exact installer's payload against the unpacked package,
then tests both unpacked and installed startup. Cleanup uses only the owned,
byte-identical new uninstaller from outside its termination-path prefix.
Registration, shortcuts and processes must be gone before temporary removal.
The cached installer is removed only on matching digest and empty remaining
cache directory. Changed or uncertain state is retained and fails cleanup; user
data is not deleted. Startup and cleanup failures are reported together.

Packaging-only: `npm run package:win`. Non-installing diagnostics:

```powershell
npm run package:verify -- --windows-unpacked-only
```

This is **UNPACKED DIAGNOSTIC ONLY**, not exact NSIS qualification. Full
`package:verify` takes the same disposable-VM option as `check:win`. Archive
extraction or changing app identity does not test the shipped installer.

NSIS uses zip compression and disables differential packaging for the pinned
ARM64 extraction path. OMXTerm has no automatic updates, so no `latest.yml` or
`.blockmap` is published.

## Exact-artifact verification record

Keep one compact record per platform in the release issue/PR and GitHub Release:

```text
Version: <X.Y.Z>
Platform: <OS and architecture>
Artifact: <filename, byte size, SHA-256>
Behavioral evidence: <tested full SHA, commands/results or prior issue/PR reuse>
Package build: <full build SHA, native platform, prepared inputs and command>
Artifact verification: <commands, PASS/FAIL, coverage limits>
Build-to-tag comparison: <full tag SHA, identical or verified non-artifact diff>
Changed boundaries: <tested seam or UNVERIFIED risk>
Cleanup: <COMPLETE/INCOMPLETE with reason>
Publication: <release/asset URLs and downloaded-byte results>
```

Record unobservable material boundaries as UNVERIFIED with risk, not a pass.
Applicable failed candidate checks, missing exact identity or incomplete owned
cleanup prevent claiming completed verification. Exclude private paths,
credentials, configuration, terminal/clipboard contents and transcripts.

### Checksums

After verification, preserve exact filenames. From `release/`:

```sh
# macOS
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256

# Linux: package:linux generates these checksums
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check linux_install.sh.sha256
./linux_install.sh --version
```

```powershell
# Windows
$name = "OMXTerm-<version>-arm64.exe"
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

Recompute and compare Windows hashes before collection. Changed artifact bytes
invalidate prior checksums and exact-artifact evidence.

## Publication

Confirm repository `luizomf/omxterm`, final version, build-to-tag comparison,
native artifact verification and complete cleanup. Create `vX.Y.Z` and the GitHub
Release within the release request. Describe changes, migrations or their absence,
known limits and provenance; attach these eight files:

- `OMXTerm-<version>-arm64.dmg` and `.sha256`;
- `OMXTerm-<version>-arm64.AppImage` and `.sha256`;
- `linux_install.sh` and `linux_install.sh.sha256`;
- `OMXTerm-<version>-arm64.exe` and `.sha256`.

Update public download examples to that exact release and verify the helper's
embedded version. Download every attachment after publication and compare byte
sizes and SHA-256 on a trustworthy verification host. Record final URLs/results
in GitHub and retain the exact local artifacts in ignored `release/`.

Published tags/artifact bytes are immutable; do not replace assets, move a tag or
reuse a version. Documentation corrections do not rebuild unchanged packages.

### Gatekeeper and provenance note

> OMXTerm for Apple Silicon is not signed with an Apple Developer ID and is not
> notarized. macOS may warn that it cannot verify the developer or check the app
> for malicious software. Review the source, verify the published SHA-256 and
> proceed only if you trust this artifact. Follow Apple's
> [Open Anyway instructions](https://support.apple.com/102445) for this app; do
> not disable system-wide security. The ad-hoc integrity seal is not a verified
> publisher identity.

### SmartScreen and provenance note

> OMXTerm for Windows ARM64 is not signed with a code-signing certificate.
> SmartScreen may warn that the installer is from an unknown publisher. Review
> the source, verify the published SHA-256 and proceed only if you trust this
> artifact. Use `More info -> Run anyway` for this file if you choose to install;
> do not disable SmartScreen or other system-wide protections.

Provenance can describe executed native automation and optional observations,
not independent audit, vendor approval or universal manual coverage.
