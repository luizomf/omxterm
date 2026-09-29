# Versioning policy

OMXTerm uses [Semantic Versioning 2.0.0](https://semver.org/) for published
versions. A release number has the form `MAJOR.MINOR.PATCH`, and its Git tag adds
`v`; for example, version `0.13.0` has tag `v0.13.0`.

The latest published version is **0.18.0**; its
[release record](releases/0.18.0.md) identifies the immutable exact artifacts,
completed native verification and verified post-upload downloads. The source
tree now carries **0.19.0-dev.0**, the next-minor development baseline for the
expanded Local Image Preview path-reference contract (#439). This is
not a published release and does not change the 0.18.0 tag, assets or release body.

This policy explains version selection and consistency. An owner request to
release covers version preparation, builds, verification, tags and publication
through the [release procedure](release.md), without extra approval rounds.

## Public contract

For this desktop application, the SemVer public contract is the observable
behavior defined by [`docs/spec.md`](spec.md), including:

- supported user interactions and terminal behavior;
- User Configuration and Terminal Theme schemas;
- security, privacy, IPC, filesystem, clipboard, and network boundaries;
- supported platform and published Release Artifact expectations.

Implementation details that do not change this contract are not public API.
The configuration and theme schema versions are independent data-format
versions; they are not the OMXTerm application version.

## Initial development: `0.y.z`

OMXTerm remains in initial development while its major version is zero. The
project uses a stronger compatibility rule than SemVer requires for `0.y.z`:

- `PATCH` releases contain backward-compatible bug fixes, security fixes,
  documentation corrections, dependency maintenance, or internal changes. They
  do not intentionally break the published contract.
- `MINOR` releases add user-visible functionality or intentionally change the
  published contract. Any incompatible change must be called out prominently
  in release notes with the required user action or migration.
- `1.0.0` will mark a deliberately reviewed, stable public contract. After
  `1.0.0`, incompatible contract changes require a `MAJOR` release,
  backward-compatible functionality requires a `MINOR` release, and
  backward-compatible fixes require a `PATCH` release.

Documentation-only changes do not require an immediate release and do not by
themselves determine a version increment. They ship with the next accepted
version.

## Version sources and identifiers

`package.json` is the source of the application version. On an accepted release
commit, all version-bearing surfaces must agree:

- `package.json` and `package-lock.json` contain `X.Y.Z`;
- the application reports `X.Y.Z` through `TERM_PROGRAM_VERSION`;
- the source tag is `vX.Y.Z`;
- the DMG is named `OMXTerm-X.Y.Z-arm64.dmg` and its checksum file adds
  `.sha256`;
- the AppImage is named `OMXTerm-X.Y.Z-arm64.AppImage` and its checksum file
  adds `.sha256`;
- the optional Linux desktop installer is named `linux_install.sh`, reports
  `X.Y.Z` through `--version`, and its checksum file is `linux_install.sh.sha256`;
  the versioned release URL and embedded version identify it. Releases through
  0.17.0 retain their original `OMXTerm-X.Y.Z-arm64.AppImage-installer.sh` assets;
- the NSIS installer is named `OMXTerm-X.Y.Z-arm64.exe` and its checksum file
  adds `.sha256`;
- the GitHub Release targets `vX.Y.Z` and describes each exact artifact.

Pre-release identifiers such as `0.2.0-rc.1` may be used when there is a
concrete testing need. Build metadata is not currently used.

## Development baseline between releases

After `X.Y.Z` is published, `main` normally moves to
`X.Y.(Z+1)-dev.0`, reserving a next-patch baseline while development continues.
Ordinary fixes, maintenance, documentation, and pull requests leave that value
alone.

A pull request that adds user-visible functionality moves the development
baseline to the next minor `-dev.0`. Intentional contract changes during `0.x`
follow the same rule. For example, if `main` is at `0.13.1-dev.0` and accepts a feature, that
feature's pull request updates both package files to `0.14.0-dev.0`. A later
feature in the same cycle sees that the move already happened and makes no
version change.

Release preparation chooses the final version and removes the prerelease
suffix. A development baseline is never tagged, uploaded, attached to a GitHub
Release, or described as a published release.

Because many commits share one baseline, identify a development build with both
its `-dev` version and exact source commit SHA. `0.14.0-dev.0` alone does not say
which dogfood build is running.

## Schema compatibility

User Configuration `"version": 1` and Terminal Theme `"version": 1` identify
their respective JSON schemas. Adding an optional compatible field may retain
the schema version while requiring an application `MINOR` release. A breaking
format change requires a new schema version and an application version selected
under this policy.

Because OMXTerm deliberately does not rewrite or migrate user files, release
notes for a schema change must explain exact manual changes. A `PATCH` release
must continue accepting configuration and theme files accepted by the previous
release in the same minor series.

## Release integrity

Published versions are immutable. Never move an existing release tag, replace
an attachment under the same version, or silently edit the meaning of a
published version. A correction requires a new version and new exact-artifact
verification.

Release notes must identify:

- material user-visible changes and fixes;
- incompatible changes and manual migration, or explicitly state that there
  are none;
- supported platforms and verified-publisher status; for macOS, state whether
  the application has its required ad-hoc integrity seal, Developer ID
  signature, and notarization;
- the exact artifact filename and SHA-256;
- known limitations relevant to users.

The [local arm64 release procedure](release.md) defines the required automated
checks, changed-boundary evidence, provenance language, and separate
publication steps.
