# ARM64 release policy and native procedures

The policy below applies to all initial OMXTerm Release Artifacts. This document
implements the native procedures for the macOS DMG containing an ad-hoc-sealed,
unnotarized application, Linux ARM64 AppImage, and Windows ARM64 NSIS
installer. Nothing here authorizes a tag,
GitHub Release, upload, signing, notarization, or any other publication. Those
actions require separate approval from the release owner.

## Cross-platform release policy

The initial Supported Platforms and artifact formats are macOS arm64 DMG, Linux
arm64 AppImage, and Windows arm64 NSIS. Initial artifacts carry no verified
publisher identity; publisher signing, Apple notarization, certificates, and
paid signing services are deferred. The macOS application receives a complete
ad-hoc code seal for internal bundle integrity without gaining a publisher
identity.

Every release candidate is built and verified natively. macOS builds run on
Apple Silicon. Linux arm64 and Windows arm64 builds run on native runners or in
native Parallels VM clones using the VM's native filesystem, never a host shared
folder. Each exact artifact requires its own automated checks. Manual testing is
optional and never gates acceptance or publication. A material changed boundary
that automation cannot observe is recorded as unverified rather than inferred
as passing. Rebuilding or changing an artifact invalidates its identity and
automated evidence.

Exact-artifact acceptance and publication are separate owner gates. Acceptance
never authorizes a tag, upload, or GitHub Release; publication remains manual
and requires separate authorization from the release owner. x64, Intel macOS,
additional package formats, signing and notarization, paid CI, and automatic publication
remain deferred.

The macOS, Linux, and Windows steps below are the implemented procedures for
those platforms. The macOS procedure preserves its Gatekeeper policy; the Linux
procedure records the unsigned AppImage and FUSE limitations; the Windows
procedure records the unsigned NSIS installer and SmartScreen limitation.

### Artifact-affecting and documentation-only changes

Each native record keeps the exact **artifact build commit** used for its
package. The three artifact build commits normally match. They may differ only
when every intervening change qualifies for the documentation-only exception
below; all artifact-affecting source must remain identical across the three
packages.

A change qualifies only when every changed path is a non-packaged Markdown file
and none is:

- `docs/spec.md` or a file under `docs/adr/`, because these define the product
  contract and durable decisions;
- `THIRD_PARTY_NOTICES.md`, because it is packaged in every artifact; or
- a license, package/version file, executable or test source, dependency,
  configuration, build or packaging input, asset, generated application file,
  or any other non-Markdown path.

Eligible examples include `README.md`, `CONTRIBUTING.md`, tutorials, agent
instructions, release procedures, and platform guidance that is not packaged.
Such a change does not alter or invalidate an unchanged artifact. If it adds or
changes required automation or changed-boundary evidence, the existing exact
artifact must satisfy the current requirement before acceptance or publication;
documentation-only status avoids a rebuild, not the new gate.

Any non-eligible change after an artifact build invalidates every earlier native
record for that version. Rebuild those packages from the new accepted source and
start new exact-artifact records. Record every artifact build commit; before
publication, compare each one with the intended tag and confirm that every
intervening path is eligible under this section. If that proof fails, do not tag
or publish.

This exception applies only before publication. Published releases are
immutable: never move their tags, replace their artifacts or checksums, or reuse
their GitHub Releases. Later documentation corrections ship from `main` or with
a future release without rewriting the published one.

## Version selection and consistency

Select the release version under the [versioning policy](versioning.md) in an
explicitly authorized release preparation issue. This procedure does not choose
or increment a version by itself. A `-dev` development baseline version is
never releasable; release preparation removes the prerelease suffix.

Before building a release candidate, confirm that `package.json` and
`package-lock.json` contain the same accepted `X.Y.Z` version. The application
version, intended `vX.Y.Z` tag, `TERM_PROGRAM_VERSION`, native artifact
filenames, checksum filenames, and GitHub Release must all identify that same
version. The intended tag points to every artifact build commit directly or to
a descendant that differs from it only through the documentation-only exception
above. The package names are `OMXTerm-X.Y.Z-arm64.dmg`,
`OMXTerm-X.Y.Z-arm64.AppImage`, and `OMXTerm-X.Y.Z-arm64.exe`. Linux also
produces `OMXTerm-X.Y.Z-arm64.AppImage-installer.sh`; its embedded `--version`,
filename, and checksum must identify the same version.

## Build and automated verification

### macOS arm64

Use an accepted release commit for `X.Y.Z`, with `vX.Y.Z` recorded as the
intended tag, on the macOS Supported Platform: the current maintainer-operated
Apple Silicon (`arm64`) Mac. Install Node.js 22.13 or later in the Node.js 22
line, or Node.js 24 or newer, check out the accepted source
without local or private files, and run:

```sh
npm ci
npm run check
```

`npm run check` is the complete automated verification command. It checks
formatting and types, runs every unit and integration test, builds the
application, creates `release/OMXTerm-<version>-arm64.dmg`, and starts the
packaged `release/mac-arm64/OMXTerm.app` with isolated configuration and state.
The packaged-startup check requires the arm64 executable, renderer, Terminal
Surface, bundled font, native PTY helper, project and third-party licenses, and
startup events through a running PTY. It rejects source maps, tests, source
trees, alternate-architecture PTY binaries, common secret files, and publisher
signing identities in the package. It also requires the complete ad-hoc
application seal to pass `codesign --verify --deep --strict`; inspecting only
signature metadata is insufficient.

For packaging alone, use `npm run package:mac`, which passes `--publish never`
to the packager. Run the non-publishing `npm run package:verify` command against
the unpacked app afterward.

The DMG has no publisher signature and is not notarized; the application inside
it is ad-hoc sealed only for bundle integrity. It is not a release candidate
until every automated check is green and material automation-resistant risk is
recorded honestly.

### Linux arm64

Use a native Linux arm64 clone on the VM's native filesystem, never a Parallels
shared folder. Install Node.js 22.13 or later in the Node.js 22 line, or
Node.js 24 or newer, plus `python3`, `make`, a C++ compiler
(`build-essential` on Ubuntu), `readelf` (`binutils` on Ubuntu), the `fontconfig`
utilities, and an X11 display or XWayland in a Wayland session. Native Wayland
is not currently claimed. Then run
from the accepted source commit:

```sh
npm ci
npm run check:linux
```

The postinstall rebuilds `node-pty` against Electron's Linux arm64 runtime.
`npm run check:linux` runs all portable and real-PTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.AppImage`, its checksum, the
exact versioned `release/OMXTerm-<version>-arm64.AppImage-installer.sh`, and the
helper checksum. It extracts that exact AppImage, rejects the unversioned
`libz.so` development linker dependency, and checks its arm64 executable and
native module, runtime files, version, icon, licenses, and
forbidden/private-looking files. It verifies both checksum records and helper
version agreement, installs that AppImage through the exact helper in an
isolated home, and launches the installed result through
`--appimage-extract-and-run` and through normal kernel-FUSE mounting when the
host's installation-time probe establishes that direct seam is available. Each
available startup path must reach a running PTY, and its Operational Event logs
must not contain the environment canary; an unavailable direct seam is not
inferred as passing.

For packaging alone, run `npm run package:linux`, followed on the same native
host by `npm run package:verify`. Packaging creates the AppImage, helper, and
both matching `.sha256` files without downloading or publishing anything. The statically linked AppImage runtime needs
neither zlib development headers nor a system `libfuse2` library. Normal
mounting uses kernel FUSE support. When mounting is unavailable, the safe manual
fallback is:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
```

The AppImage is intentionally unsigned and provides no verified publisher
identity. It is not a release candidate until all automated checks pass and
material automation-resistant risk is recorded honestly.

### Windows arm64

Use a native Windows arm64 clone on the VM's native filesystem, never a
Parallels shared folder, in a graphical session. Install Node.js 22.13 or later
in the Node.js 22 line, or Node.js 24 or newer, and the Visual C++ Redistributable for ARM64 (Electron's runtime requires it),
allow script execution for npm's cmd shims, and clone with
`core.autocrlf=false` and `core.symlinks=true` (symlinked repository files
must check out as symlinks; Developer Mode enables unprivileged symlinks).
Then run from the accepted source commit:

```powershell
npm ci
npm run check:win
```

`npm run check:win` runs all portable and real-ConPTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.exe` NSIS installer, inspects
the unpacked application's arm64 PE executables and win32-arm64 node-pty
runtime, version, licenses, and forbidden/private-looking files, installs the
exact installer into a throwaway directory to confirm it extracts every
executable, then launches the unpacked application with isolated
configuration, state, and user data. Startup must reach a running PTY and its
Operational Event log must not contain the environment canary.

For packaging alone, run `npm run package:win`, followed on the same native
host by `npm run package:verify`. The automated check installs the exact
installer to a temporary location — its one-click `/D=` never touches the
real per-user install — and asserts that every packaged executable and DLL
lands, then uninstalls. A real Start Menu installation is optional; when
installer or desktop-integration behavior changes beyond this automated seam,
record the remaining Windows behavior as unverified rather than requiring a
manual installation.

The installer carries a zip-compressed application payload rather than the
smaller default LZMA archive. On an ARM64 build host electron-builder
compresses executables with the ARM64 BCJ2 7-Zip filter, which the installer's
bundled extraction plugin cannot decode — it drops every PE file at install
time. The zip payload avoids that filter, so the installer is larger than a
macOS or Linux artifact of the same application but installs completely.
Because this disables the differential (blockmap) package, no `latest.yml` or
`.blockmap` is produced; OMXTerm ships no automatic updates, so nothing depends
on them.

The installer is intentionally unsigned and may trigger a Microsoft Defender
SmartScreen unknown-publisher warning. It is not a release candidate until all
automated checks pass and material automation-resistant risk is recorded
honestly.

## Automation-first exact-artifact acceptance

OMXTerm uses native automation as the routine release gate. The exhaustive
manual exercise completed for the initial three-platform 0.4.0 release is
baseline evidence, not a script to replay for each version.

Dogfood remains valuable but has a different role. The maintainer continuously
uses the macOS application and reports problems encountered during ordinary
work. This is opportunistic feedback, not a prescribed checklist, an
exact-artifact test, or a release gate. The maintainer does not manually
validate Linux or Windows; those platforms rely on native automation and later
contributor or user reports.
Exact artifact identity, native automated verification, owner acceptance, and
separate publication authorization remain mandatory.

### 1. Record changed boundaries

Before building, compare the accepted source with the previous published tag and
record every changed observable or release boundary. Classify each change under
the smallest applicable category:

- portable product behavior;
- platform-specific product behavior;
- packaging, installation, architecture, or native runtime;
- security, privacy, IPC, clipboard, input, or filesystem boundary;
- rendering, icon, window-system, or desktop integration;
- version metadata or documentation only.

For each changed boundary, name the automated seam that observes it. Record a
material boundary with no reliable automated seam as `UNVERIFIED`, together with
the affected platform and risk. Missing manual coverage is not pending release
work, and no boundary inherits the historical manual matrix.

### 2. Run mandatory native automation

Every exact artifact must pass its platform's complete documented command:

- macOS: `npm run check`;
- Linux: `npm run check:linux`;
- Windows: `npm run check:win`.

The record binds each result to source commit, filename, byte size, and SHA-256.
At minimum the command must establish formatting and type safety, portable and
native tests, package construction, target architecture, packaged contents and
licenses, embedded version agreement, package extraction or installation seam,
startup, PTY readiness, required Operational Events, and cleanup of verifier
state.

No release requires a human replay after all three native commands pass. Owner
acceptance remains explicit but does not represent manual exercise of every
artifact.

### 3. Record optional observations and unverified risk

Manual product testing is optional and non-blocking on every platform. Routine
macOS dogfood may reveal regressions during ordinary use, but no release
requires a walkthrough, visual matrix, Gatekeeper exercise, or other targeted
manual check. The maintainer does not manually validate Linux or Windows.
Community testing and later user reports are welcome but are never scheduled
release dependencies.

When automation cannot observe a material changed boundary, record it as
`UNVERIFIED` instead of manufacturing a pass. Examples include Gatekeeper or
SmartScreen presentation, native rendering, icon or window association,
desktop-shell integration, and other native UI behavior without a reliable
seam. State the affected platform, the unobserved outcome, and the user-facing
risk in the exact-artifact record or release notes. The absence of a report is
not evidence that the boundary passed.

Security protections are never disabled to manufacture a result. An optional
observation may be recorded factually, but it does not become a reusable release
gate or imply coverage of another artifact.

### 4. Rebuilds require fresh automation

Rebuilding changes artifact identity and requires fresh native automation. Prior
dogfood observations remain historical context only; they do not establish the
behavior of a rebuilt artifact. A matching version number or source claim alone
is insufficient to reuse automated evidence.

### 5. Canonical exact-artifact record

Use one compact record per platform:

```text
Version: <X.Y.Z>
Platform: <supported OS and architecture>
Source commit: <full SHA>
Artifact: <filename>
Byte size: <integer>
SHA-256: <lowercase digest>
Native automated verification: <PASS/FAIL and safe summary>
Changed boundaries: <each boundary -> automated seam or UNVERIFIED risk>
Optional dogfood observations: <none, or factual non-blocking observations>
Cleanup: <COMPLETE/INCOMPLETE with reason>
Exact-artifact acceptance: <PENDING/OWNER ACCEPTED>
Publication gate: <BLOCKED/AUTHORIZED separately>
```

Do not place private paths, Terminal Payload, clipboard contents, commands,
configuration contents, secrets, or transcripts in tracker evidence.

### 6. Acceptance and publication gates

An exact artifact may be owner-accepted when:

- mandatory native automation passed against that exact identity;
- every changed boundary maps to passing automation or an honestly recorded
  `UNVERIFIED` platform risk;
- verifier cleanup is complete; and
- public documentation accurately describes the package and known limitations.

A current automated failure, an undisclosed automation-resistant risk,
incomplete cleanup, an identity mismatch, or missing documentation blocks
acceptance. Missing manual exercise does not. Owner acceptance is a release
decision and does not represent manual exercise of the artifact. Unexecuted rows
from the historical exhaustive matrix are not release state under this policy.

Owner acceptance does not authorize publication. Tagging, uploading the exact
artifacts and checksums, and creating the GitHub Release still require a
separate explicit owner instruction. After publication, download every asset
and verify each checksum again on its native Supported Platform or an equivalent
byte-verification host.

### Public provenance

Release notes may state factually that the initial three-platform release
received exhaustive native human testing, that the macOS build is dogfooded by
the project maintainer during ordinary use, that later releases rely on native
automation without required manual testing, and that Linux and Windows
community reports are welcome. These statements are process provenance, not a
claim that every release or platform was manually exercised, an independent
security audit, platform-vendor approval, or a guarantee.

## macOS SHA-256

Generate the checksum after native automation finishes against the exact DMG. From the output directory, preserving
the artifact's filename:

```sh
cd release
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256
```

Changing or rebuilding the DMG invalidates its identity, native automation, and
checksum. Run the acceptance model against the replacement.

## Linux SHA-256

`npm run package:linux` generates checksum records for both unchanged exact
Linux assets. Recheck them after native automation:

```sh
cd release
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check OMXTerm-<version>-arm64.AppImage-installer.sh.sha256
./OMXTerm-<version>-arm64.AppImage-installer.sh --version
```

Record both asset filenames and digests in the exact-artifact record. Rebuilding,
renaming, or changing either asset invalidates its identity, native automation,
and checksum. Keep publication blocked until the release owner accepts this
exact artifact and separately authorizes publication.

## Windows SHA-256

Generate the checksum after native automation finishes against the unchanged
exact installer:

```powershell
cd release
$name = "OMXTerm-<version>-arm64.exe"
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

Confirm the digest matches a fresh `Get-FileHash` of the same file. The same
rebuild/rename invalidation and blocked-publication rules as the other
platforms apply.

## Gatekeeper and provenance release note

Use this language in any later owner-authorized release, updated only with the
accepted version and checksum:

> OMXTerm for Apple Silicon is intentionally not signed with an Apple Developer
> ID and is not notarized. macOS may warn that it cannot verify the developer or
> check the app for malicious software. Review the source, verify the published
> SHA-256, and proceed only if you trust this exact artifact. If you choose to
> open it, follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
> in System Settings -> Privacy & Security. Do not disable system-wide macOS
> security protections. This is the open-source build published and used by the
> maintainer; it is not independently audited, approved by Apple, or guaranteed
> free of defects in all code and dependencies.

## SmartScreen and provenance release note

Use this language in any later owner-authorized release that attaches the
Windows installer, updated only with the accepted version and checksum:

> OMXTerm for Windows ARM64 is intentionally not signed with a code-signing
> certificate. Microsoft Defender SmartScreen may warn that the installer is
> from an unknown publisher. Review the source, verify the published SHA-256,
> and proceed only if you trust this exact artifact. If you choose to install
> it, use SmartScreen's `More info -> Run anyway` for this one file. Do not
> disable SmartScreen or other system-wide Windows security protections. This
> is the open-source build published and used by the maintainer; it is not
> independently audited, approved by Microsoft, or guaranteed free of defects in
> all code and dependencies.

## Later owner-authorized GitHub Release

Only after the release owner accepts the exact-artifact record and separately
authorizes publication:

1. confirm the canonical repository is `luizomf/omxterm`; the package metadata,
   DMG, AppImage, installer, and checksums still match their accepted records;
   and `vX.Y.Z` points to each recorded artifact build commit or differs from it
   only through paths eligible for the documentation-only exception above;
2. create the canonical GitHub Release for that exact tag with the Gatekeeper
   and SmartScreen provenance notes above; summarize material changes, identify
   incompatible changes and migration or state that there are none, and record
   relevant known limitations;
3. attach exactly `OMXTerm-<version>-arm64.dmg`,
   `OMXTerm-<version>-arm64.dmg.sha256`,
   `OMXTerm-<version>-arm64.AppImage`,
   `OMXTerm-<version>-arm64.AppImage.sha256`,
   `OMXTerm-<version>-arm64.AppImage-installer.sh`,
   `OMXTerm-<version>-arm64.AppImage-installer.sh.sha256`,
   `OMXTerm-<version>-arm64.exe`, and
   `OMXTerm-<version>-arm64.exe.sha256` manually;
4. download all eight attachments, verify every checksum again on any trustworthy
   byte-verification host, and preserve the final release URL with the accepted
   evidence.

Do not automate these publication steps or perform them under the authority of
this repository procedure alone.
