# ARM64 release procedures

An owner request to prepare and publish a release covers the complete delivery:
version selection, build-environment preparation, native verification, release
records, tags, uploads and download verification. Carry that scope through to
subagents. Do not add per-step approval requests or a separate exact-artifact
acceptance round. Ask only when missing information blocks progress or a
necessary destructive consequence is outside the scope already given.

The technical checks below describe the current release workflow, not a frozen
set of historical promises. Update this guide and the related spec/ADRs when the
workflow changes; Git retains earlier text. A failed check must be reported and
assessed, not silently turned into a pass. Manual testing is optional.

## Release path

1. Select the version using [the versioning policy](versioning.md).
2. Compare with the previous published tag and record changed boundaries.
3. Reconcile existing evidence and resume the missing or invalidated steps on
   each native Supported Platform; build only when package inputs changed.
4. Collect the exact artifacts, checksums and verification evidence in the
   primary checkout's ignored `release/` directory.
5. Review source/version consistency, publish the release, then download and
   verify every uploaded file.

Keep issue/PR state and [`docs/releases/`](releases/) accurate. These records
capture work and evidence; they are not additional permission gates.

## Cross-platform release policy

The Supported Platforms and application packages are macOS arm64 DMG, Linux
arm64 AppImage and Windows arm64 NSIS. Linux also provides its per-user AppImage desktop installer, `linux_install.sh`,
with an embedded release version and a separate `.sha256` file. Build natively on each target,
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
Reuse valid evidence when its relevant inputs are unchanged, not merely when
its version matches. [ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md)
separates four steps:

| Step                        | Evidence identity                                                                                            | When to repeat                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Behavioral tests            | Full tested source SHA, commands, assertions/fixtures, prepared dependencies and relevant native environment | Changed behavior, dependencies, test inputs or environment, on affected seams/platforms |
| Package build               | Full build source SHA, version, build/packager inputs and native platform                                    | Changed packaged bytes, version metadata, dependencies or build recipe                  |
| Exact-artifact verification | Build SHA, filename, size, SHA-256, native verifier inputs/result and cleanup                                | New artifact bytes or changed applicable verification inputs/requirements               |
| Publication                 | Intended tag SHA, build-to-tag comparison, exact asset identities and download checks                        | Missing publication/download evidence; never rebuild just to publish                    |

Keep a compact record of prior PASS evidence and why inputs remain equivalent.
Unknown/missing source, dependency or artifact provenance fails reuse for that
evidence, not every other recorded step. A current applicable check that fails
needs diagnosis and a recorded disposition before publication. Retain the
original FAIL even after a later pass; explain changed inputs, an identified
fixture/environment failure, a fix, or the remaining risk. Do not relabel an
observed failure as UNVERIFIED. Historical failures and missing old evidence are
not automatically blockers for every future release or documentation correction:
establish their relevance to the candidate, track supported bugs separately,
and record unavailable coverage honestly. Resume the failed/missing applicable
step, not `npm ci`, `check` and `build` from the beginning merely because the
request says release.

### Changed inputs and build-to-tag comparison

Record each artifact's exact full build SHA; never relabel it as the tag SHA.
Each target's artifact-affecting inputs must match the intended tag; shared
product inputs must agree across platforms. Before publication, prove every build
commit is the intended tag or its ancestor, then inspect the **complete** diff
between them, including package-file field changes. For example:

```sh
git merge-base --is-ancestor <build-sha> <tag-sha>
git diff --stat <build-sha> <tag-sha>
git diff <build-sha> <tag-sha>
```

Classify by inputs, not file extensions or a blanket directory allowlist:

- Non-packaged docs (including contracts/ADRs) and test-only/fixture-only changes
  leave product artifacts valid when they are not consumed by the build. Run
  affected changed tests and record their actual results; reuse unaffected PASS
  evidence. If the task changes applicable verification requirements, assess the
  preserved artifact against those requirements; correcting a description alone
  does not create a new check or historical rerun requirement. Packaged
  notices/licenses are not documentation-only inputs.
- Version-only package metadata changes require a native build and version/package
  verification for each affected artifact, not wholesale behavioral reruns when
  their other inputs are identical. Never reuse an old-version package.
- Product, runtime/dependency, asset, preparation or build/packaging changes
  invalidate only affected evidence and platform artifacts. If impact is unclear,
  conservatively invalidate the potentially affected steps/platforms.
- Orchestration-only changes may leave artifacts valid only with proof that
  retained metadata, prepared dependency bytes, build inputs and effective
  packager argv are unchanged. The pinned electron-builder 26.15.3 removes
  `scripts` from both build metadata and the packaged `package.json` via
  `readPackageJson` and `createTransformer`; the regression seam is
  `test/unit/release-packaged-metadata.test.ts`. This is **not** permission to
  ignore all package-file or script changes: version/dependencies/main remain
  product inputs, and changes to build/preparation commands can change bytes.

A descendant tag may therefore differ through verified non-artifact changes,
including tests/docs and proven orchestration-only metadata edits. Record that
comparison alongside the original build SHA and digest. If equivalence cannot
be established, rebuild the affected artifact from the intended source; never
silently accept stale product bytes.

Published tags and artifact bytes are immutable: do not move published tags,
replace assets or reuse a published version. Documentation and evidence records
can be corrected, explicitly preserving actual results and artifact identities;
old prose remains in Git.

## Version consistency

`package.json` and `package-lock.json` must contain the same final `X.Y.Z`.
The application version, `TERM_PROGRAM_VERSION`, tag `vX.Y.Z`, filenames,
checksum basenames and GitHub Release must agree. A `-dev` baseline is not
releasable. The Linux helper's embedded `--version` must also agree.

An ordinary release includes all three Supported Platforms. A platform omission
is a change in delivery scope, not an inferred pass, and must be stated in the
release record and notes.

## Build and automated verification

For an unprepared checkout or changed locked dependency inputs, use `npm ci`;
its `postinstall` runs Electron installation and the checksum-guarded node-pty
and Restty preparation scripts. If only preparation inputs changed, rerun
`npm run postinstall` against the locked installed dependencies. Unknown
dependency bytes fail preparation rather than silently reusing
a stale patched runtime. An already prepared checkout with recorded matching
locked dependencies, corrections, native runtime and environment needs no new
`npm ci` merely for version-only metadata, tests/docs or publication. Worktrees
must own any dependency copy they prepare; never edit shared dependency dirs.

Portable checks include the production-Chromium image fixture with isolated
userData/sessionData. On Windows and Linux its non-activating window is visible:
hidden windows can stall actual frames. Production CSP, renderer isolation,
real animation frames, deadlines and exact bitmap comparisons remain required.
Elapsed time alone is not frame readiness.

The default suite includes native Restty WebGL2 and owned-PTY fixtures for
Default Shell and explicit-command startup, input/output, resize, shutdown,
renderer loss, fonts, configuration notices and Pi/Chafa images. Platform guards
and opt-in tests limit the actual run; see
[qualification scope](development.md#qualification-scope). A green aggregate
command establishes its executed assertions, not every behavior mentioned in an
old spec/ADR. Unit mocks, controlled failure injection and synthetic DOM input do
not establish physical keyboard/pointer, native dialog interaction or visible
behind-window blur. Missing WebGL2 must fail initialization; irrecoverable
context loss must fail the affected session visibly without a fallback renderer.

Packaged verification launches the actual package with a synthetic owned PTY
command. A visible marker and `CSI 16 t` must produce a positive cell-size reply
from the packaged Surface before the proof file is created. Startup events or
a live shell alone are insufficient. The probe uses no user shell, configuration,
payload or persistent profile; its state is removed after verified termination.

### Resume and version-only commands

The aggregate `check`, `check:linux` and `check:win` commands are full checks for
missing evidence: `check:portable` builds once, then `package-built:*` packages
that output without another build. Standalone `package:mac`, `package:linux`
and `package:win` always build fresh.

After a successful build (including `check:portable`), use the matching explicit
step only while `dist`, product/build inputs and prepared dependencies still
match the recorded native build:

```sh
npm run package-built:mac    # or package-built:linux / package-built:win
npm run package:verify      # Windows requires the disposable-VM option below
```

`package-built:*` deliberately has no implicit cache/skip heuristic; the caller
must establish current build provenance. If it is missing, use `package:*`.
These commands do not run behavioral tests or establish release acceptance.

For a version-only change with valid behavioral PASS evidence and unchanged
prepared dependencies, update both package files with
`npm version X.Y.Z --no-git-tag-version --ignore-scripts` (substitute the selected
version), then on each native target:

```sh
npm run package:mac         # or package:linux / package:win; includes fresh build
npm run package:verify      # Windows: -- --disposable-vm-allow-omxterm-replacement
```

The existing verifier checks package/runtime version consistency; the source
version test is `npx vitest run test/unit/release-version.test.ts`. macOS still
requires the exact-DMG mount check below, Linux the exact AppImage/helper paths,
and Windows the exact NSIS transaction and cleanup. If packaging succeeded but
verification failed or is missing, run only `package:verify` against the preserved
artifact (plus macOS's mounted DMG), not another package build. If all evidence
is valid and artifact checksums still match, proceed directly to publication.

### macOS arm64

Use Apple Silicon, Xcode Command Line Tools (Apple clang and the macOS SDK),
and Node.js 22.13+ in the 22 line, or Node.js 24+:

```sh
npm ci
npm run check
```

This runs portable checks, builds `release/OMXTerm-<version>-arm64.dmg` and
verifies the packaged `release/mac-arm64/OMXTerm.app` with isolated state. The
verifier checks architecture, renderer, Surface, bundled fonts, native PTY helper,
licenses, startup and parsed output. It rejects source maps, tests, source trees,
alternate-architecture PTY binaries and common private/secret files.

That staging-app check does not verify the final DMG. Before recording macOS
acceptance, verify the exact image and run the same verifier against its
read-only mounted application. From the repository root:

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

The cleanup trap attempts detachment even when verification fails. A failed
mount or detach is not acceptance: inspect the reported mount point, finish
cleanup, and record the failure before retrying. Never delete a mounted volume.

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
`npm run package:mac` followed by `npm run package:verify`; release acceptance
also requires the exact-DMG check above.

### Linux arm64

Use native Linux arm64 and a supported Node.js version. Before `npm ci`, complete
[the Linux platform prerequisites](development.md#linux), including `patch`,
process-inspection tools and installed fixture fonts. Use an authenticated
X11/XWayland session; native Wayland is not claimed.
GUI tests need an unlocked desktop; arrange the session and a bounded
idle inhibitor as part of test setup rather than treating locking as a product
failure. Preserve unrelated user activity.

Run as an ordinary user. The shipped Linux-only `--no-sandbox` policy is fixed
(ADR 0024); no privileged sandbox helper or host-policy change is needed.

```sh
npm ci
npm run check:linux
```

Postinstall builds the pinned node-pty Node-API v8 addon for Linux ARM64 with the
native exec-status correction. The full command runs portable/native checks,
packages the AppImage, creates the exact `linux_install.sh` desktop helper and
both checksums, then verifies them.
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
The verifier removes its isolated installation home after successful provisioning;
it does not invoke the exact helper's `uninstall` command. Source-helper tests
with synthetic AppImages cover uninstall separately. Neither coverage should be
reported as exact published-helper uninstall qualification. Packaged startup pins
`--ozone-platform=x11`; it does not prove the default-backend relaunch path.

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
Behavioral evidence: <tested full SHA, commands/result; reuse rationale if applicable>
Package build: <native platform, prepared dependencies and build command>
Native automated verification: <PASS/FAIL, verifier inputs and safe summary>
Build-to-tag comparison: <tag full SHA and non-artifact differences, or identical>
Changed boundaries: <automated seam or UNVERIFIED risk>
Optional observations: <none, or non-blocking observations>
Cleanup: <COMPLETE/INCOMPLETE with reason>
Publication: <PENDING/PUBLISHED with URL>
```

Do not put private paths, credentials, configuration contents, Terminal Payload,
clipboard data or transcripts in public evidence. Failed applicable candidate
checks, missing exact-artifact identity proof or incomplete owned cleanup prevent
claiming completed verification and publication under this procedure. An unrelated
historical gap does not by itself invalidate a verified candidate. No owner
sign-off is added after these checks pass within the requested release scope.

### Checksums

After native verification, preserve each exact filename:

```sh
# macOS, from release/
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256

# Linux, checksums generated by package:linux
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check linux_install.sh.sha256
./linux_install.sh --version
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
verified non-artifact differences, passing native verification and complete
cleanup. Create the tag and GitHub Release within the owner's release request;
there is no additional approval checkpoint.

Summarize changes, migrations or their absence, known limitations and provenance.
Attach exactly these eight files for an ordinary three-platform release:

- `OMXTerm-<version>-arm64.dmg` and its `.sha256`;
- `OMXTerm-<version>-arm64.AppImage` and its `.sha256`;
- `linux_install.sh` and `linux_install.sh.sha256`;
- `OMXTerm-<version>-arm64.exe` and its `.sha256`.

The stable helper filename starts with the release after 0.17.0. Never rename
past attachments or rewrite their release records. When updating public download
links and install examples, use the new helper filename only for the new release;
verify its embedded version against that release's AppImage.

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
