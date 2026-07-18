# Versioning policy

OMXTerm follows [Semantic Versioning 2.0.0](https://semver.org/) for published
versions. Version numbers have the form `MAJOR.MINOR.PATCH`; Git tags add the
conventional `v` prefix, such as `v0.2.1`.

This policy assigns meaning to versions. It does not authorize a release.
Version changes, tags, artifacts, and GitHub Releases remain deliberate,
owner-authorized actions governed by the [release procedure](release.md).

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
- the DMG is named `OMXTerm-X.Y.Z-arm64.dmg`;
- the checksum file is named `OMXTerm-X.Y.Z-arm64.dmg.sha256`;
- the GitHub Release targets `vX.Y.Z` and describes that exact artifact.

The repository's `0.0.0` value denotes unreleased development. It must not be
tagged, published, or presented as an OMXTerm release. Selecting and applying
the first publishable version belongs to an explicitly authorized release
preparation issue.

Pre-release identifiers such as `0.2.0-rc.1` may be used later when there is a
concrete testing need. Build metadata is not currently used. Neither form
creates permission to publish.

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
- supported platform and the unsigned, non-notarized status;
- the exact artifact filename and SHA-256;
- known limitations relevant to users.

The [local arm64 release procedure](release.md) defines the required automated
checks, manual checks, provenance language, and separate publication gate.
