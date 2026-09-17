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
- [Restty development candidate](restty-development.md) documents the temporary
  unpackaged opt-in, pinned inputs, restoration and current limitations.

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

### Current release: 0.11.0

- [0.11.0 release notes](releases/0.11.0.md) describe Chafa support, the Linux
  launch policy, the Windows transport fix, exact accepted artifact identities,
  native verification and remaining limitations.
- [v0.11.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.11.0)
  contains the unchanged owner-accepted artifacts and checksums.

All three ARM64 builds use source `741a1cc67597bfdbe5aacf4933a01760c658f352`.
Only eligible non-packaged Markdown differs between that commit and the tag;
see the release record. Repository visibility remains private.

### Previous immutable published release: 0.10.0

- [0.10.0 release notes](releases/0.10.0.md) preserve the exact artifact
  identities and historical evidence.
- [v0.10.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.10.0)
  remains the immutable previous publication record.

## Earlier immutable published release history

Published release records are historical and must not be rewritten to describe
the current release or development baseline:

- [0.1.0](releases/0.1.0.md) — first published Apple Silicon version;
- [0.2.0](releases/0.2.0.md) — resilient configuration, keybinds, and Snippets;
- [0.3.0](releases/0.3.0.md) — Terminal Tabs;
- [0.4.0](releases/0.4.0.md) — first macOS, Linux, and Windows ARM64 release;
- [0.4.1](releases/0.4.1.md) — macOS bundle-integrity packaging fix; and
- [0.8.0](releases/0.8.0.md) — earlier published release;
- [0.9.0](releases/0.9.0.md) — earlier published release.

## Legal

- [MIT License](../LICENSE) defines the rights granted for OMXTerm source.
- [Third-Party Notices](../THIRD_PARTY_NOTICES.md) records bundled components
  that retain their own terms.
