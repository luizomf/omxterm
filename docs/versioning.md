# Versioning policy

OMXTerm uses [Semantic Versioning 2.0.0](https://semver.org/). Published versions
are `MAJOR.MINOR.PATCH`, tagged `vMAJOR.MINOR.PATCH`.

The current published release is
[0.20.1](https://github.com/luizomf/omxterm/releases/tag/v0.20.1). The source carries
**0.20.2-dev.0**, a development baseline, not a published release.
`package.json` is the application-version source; `package-lock.json` must agree.
Release preparation and publication follow [release.md](release.md).

## Public contract

The SemVer public contract is observable behavior described by [spec.md](spec.md):
user interactions and terminal behavior, configuration/theme schemas,
security/privacy/capability boundaries, supported platforms and artifact formats.
Implementation details are not public API. Specs and ADRs evolve with the product;
correcting inaccurate documentation of unchanged code is not a compatibility
break or a demand to implement the former description.

Configuration and theme schema versions are independent of the app version.

## Initial development: `0.y.z`

While the major version is zero:

- **PATCH:** compatible bug/security fixes, documentation corrections, dependency
  maintenance and internal changes.
- **MINOR:** user-visible functionality or intentional contract changes. Describe
  incompatible changes and required user action/migration prominently in notes.
- **1.0.0:** a deliberately reviewed stable public contract. Afterward, breaking
  changes require MAJOR, compatible functionality MINOR and compatible fixes PATCH.

Documentation-only changes do not require an immediate release or version bump.
Ordinary fixes and maintenance leave the current development baseline unchanged.

## Version sources and identifiers

On a release commit, these agree on final `X.Y.Z`:

- `package.json` and `package-lock.json`;
- the app version and `TERM_PROGRAM_VERSION`;
- tag `vX.Y.Z` and its GitHub Release;
- `OMXTerm-X.Y.Z-arm64.dmg`, `OMXTerm-X.Y.Z-arm64.AppImage` and
  `OMXTerm-X.Y.Z-arm64.exe`, each with a same-basename `.sha256` file;
- `linux_install.sh --version`, with `linux_install.sh.sha256` and an exact
  versioned release URL identifying the helper.

Pre-release identifiers may serve a concrete testing need. Build metadata is not
used. A `-dev` baseline is never tagged or uploaded as a published release.

## Development baseline between releases

After publishing `X.Y.Z`, `main` normally moves to `X.Y.(Z+1)-dev.0`. A PR adding
user-visible functionality or intentionally changing the contract moves it to
the next minor `-dev.0` unless that move already happened in the same cycle.
Update both package files together. Release preparation selects the final version
and removes the prerelease suffix.

Identify development builds by both `-dev` version and full source SHA: the
baseline alone does not identify the running code.

## Schema compatibility

User Configuration and Terminal Theme each use `"version": 1`. A compatible
optional field can retain the schema version while requiring an application
MINOR release. A breaking format change needs a new schema version and app
version selected under this policy.

OMXTerm does not rewrite or migrate user files. Schema-change notes must explain
manual changes; a PATCH release continues accepting files accepted by the
previous release in the same minor series.

## Release integrity

Published tags and artifact bytes are immutable. Do not move an existing tag,
replace an attachment or reuse a version. Changed product/artifact bytes need a
new release and exact-artifact verification. Documentation corrections do not
require rebuilding unchanged packages or publishing a new version.

GitHub release notes identify:

- material changes and fixes;
- incompatible changes/manual migration, or their absence;
- platforms, unsigned-publisher status and the Linux sandbox exception;
- macOS ad-hoc integrity seal, lack of Developer ID signing and notarization;
- exact artifact filenames, SHA-256 and verification scope;
- known user-facing limitations.

Keep execution results and evidence in GitHub release/issue/PR records, with exact
local artifacts in the primary checkout's ignored `release/` directory. Current
docs contain operating procedures, not a per-release history. Evidence reuse
follows [release.md](release.md#changed-inputs-and-build-to-tag-comparison).
