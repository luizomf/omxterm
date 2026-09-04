# Documentation

Use this map to move from practical guidance to authoritative contracts and
project history. Each detailed topic has one primary owner; linked documents
should be used instead of copying their procedures elsewhere.

## User guidance

1. [Project landing page](../README.md) — product identity, Supported Platforms,
   current release, checksum-safe installation, and quick start.
2. [Everyday OMXTerm use](usage.md) — windows, tabs, sessions, controls,
   shortcuts, clipboard and Protected Paste behavior, file-path insertion,
   links, bells, and local Operational Events.
3. [User Configuration](configuration.md) — `config.json`, keybinds,
   `snippets.json`, external Terminal Themes, reload behavior, examples, and
   troubleshooting.

The guides are practical summaries. When wording differs, the normative product
contract below is authoritative.

## Contribution and development

- [Contributing](../CONTRIBUTING.md) is the single guide for development setup,
  issue and fork-and-pull workflow, engineering boundaries, verification,
  commits, and pull requests.
- [Security policy](../SECURITY.md) defines supported reports, the private
  reporting route, required safe details, excluded sensitive data, and
  disclosure coordination.

## Normative contracts and language

- [Current product contract](spec.md) defines observable behavior, Supported
  Platforms, security and privacy boundaries, architecture boundaries, and the
  release contract.
- [Domain language](../CONTEXT.md) defines canonical OMXTerm terms used across
  the project.

Issues, pull requests, guides, and release notes may describe a point in time,
but they do not replace the maintained product contract.

## Durable decisions

- [Architecture decision record index](adr/README.md) lists every durable
  decision, its current status, superseding relationships, and links to the
  original reasoning. The ADRs own architectural and product tradeoffs; the
  product contract owns current observable behavior.

## Release procedure and version policy

- [ARM64 release policy and native procedures](release.md) is the operational
  owner for native building, exact-artifact verification, acceptance,
  checksum generation, and separately authorized manual publication.
- [Versioning policy](versioning.md) defines compatibility rules, version
  sources, development baselines, tags, and release immutability.
- [Publication visibility](../README.md#publication-visibility) records that the
  canonical repository remains private and that unauthenticated GitHub release
  and issue links have not been validated. Documentation does not change
  repository visibility.

## Release status

### 0.10.0 exact release candidates

[0.10.0 candidate notes](releases/0.10.0.md) record the exact ARM64 candidates
built and verified natively from source commit
`2711f502d45cd86056ce76bffba22e1f8f92499d`, including their identities and
changed-boundary results. Owner acceptance remains pending, publication remains
blocked, and the intended `v0.10.0` tag has not been created. The exact eight
candidate filenames are:

- `OMXTerm-0.10.0-arm64.dmg`;
- `OMXTerm-0.10.0-arm64.dmg.sha256`;
- `OMXTerm-0.10.0-arm64.AppImage`;
- `OMXTerm-0.10.0-arm64.AppImage.sha256`;
- `OMXTerm-0.10.0-arm64.AppImage-installer.sh`;
- `OMXTerm-0.10.0-arm64.AppImage-installer.sh.sha256`;
- `OMXTerm-0.10.0-arm64.exe`; and
- `OMXTerm-0.10.0-arm64.exe.sha256`.

These exact candidates exist in verified release state, but they are not
accepted, uploaded, published, or available through this documentation.

### Current published release: 0.9.0

- [0.9.0 release notes](releases/0.9.0.md) describe the current published
  release, exact accepted artifact identities, native and changed-boundary
  verification evidence, optional observations, compatibility, and known
  limitations.
- The canonical publication record is the
  [v0.9.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.9.0).

The 0.9.0 record is immutable published history. Its optional observations are
factual non-automation, non-reusable provenance rather than a release gate for
another artifact or version.

## Earlier immutable published release history

Published release records are historical and must not be rewritten to describe
the current release or development baseline:

- [0.1.0](releases/0.1.0.md) — first published Apple Silicon version;
- [0.2.0](releases/0.2.0.md) — resilient configuration, keybinds, and Snippets;
- [0.3.0](releases/0.3.0.md) — Terminal Tabs;
- [0.4.0](releases/0.4.0.md) — first macOS, Linux, and Windows ARM64 release;
- [0.4.1](releases/0.4.1.md) — macOS bundle-integrity packaging fix; and
- [0.8.0](releases/0.8.0.md) — previous published release.

## Legal

- [MIT License](../LICENSE) defines the rights granted for OMXTerm source.
- [Third-Party Notices](../THIRD_PARTY_NOTICES.md) records bundled components
  that retain their own terms.
