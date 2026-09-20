# Documentation

Start with installation and everyday use, then explore customization or the
project's design and development guides.

## Using OMXTerm

- [Download and install](../README.md#platforms-and-downloads) — ARM64 packages,
  checksums, prerequisites, and installation instructions.
- [Everyday use](usage.md) — windows, tabs, shortcuts, copy and paste, file
  paths, links, images, and local diagnostics.
- [User configuration](configuration.md) — fonts, themes, keybinds, snippets,
  examples, and troubleshooting.

## Releases

**0.12.1 is accepted and authorized for publication; publication is pending.**
The [0.12.1 release notes and record](releases/0.12.1.md) cover the corrections,
Windows catch-up, compatibility, platform limitations, and exact package
identities. [Issue #323](https://github.com/luizomf/omxterm/issues/323) records
owner acceptance and separate publication authorization for the unchanged eight
files. The [download table](../README.md#platforms-and-downloads) is prepared
for 0.12.1 and labels those links as pending.

Until publication, the available releases remain
[0.12.0 for macOS/Linux](https://github.com/luizomf/omxterm/releases/tag/v0.12.0)
and [0.11.0 for Windows](https://github.com/luizomf/omxterm/releases/tag/v0.11.0).
There was no Windows 0.12.0 package. The repository is currently private;
GitHub downloads require repository access.

### Release history

Published records retain the notes, package identities, and evidence for their
original release:

- [0.12.0](releases/0.12.0.md) — Restty transition, macOS and Linux;
- [0.11.0](releases/0.11.0.md) — Chafa support, Linux launch policy, and Windows
  transport fix;
- [0.10.0](releases/0.10.0.md);
- [0.9.0](releases/0.9.0.md);
- [0.8.0](releases/0.8.0.md);
- [0.4.1](releases/0.4.1.md) — macOS bundle-integrity packaging fix;
- [0.4.0](releases/0.4.0.md) — first macOS, Linux, and Windows ARM64 release;
- [0.3.0](releases/0.3.0.md) — terminal tabs;
- [0.2.0](releases/0.2.0.md) — configuration, keybinds, and snippets;
- [0.1.0](releases/0.1.0.md) — first Apple Silicon release.

## Contributing and development

- [Contributing](../CONTRIBUTING.md) — development setup, issue workflow,
  engineering guidelines, checks, and pull requests.
- [Security policy](../SECURITY.md) — private vulnerability reporting and safe
  diagnostic details.
- [Restty development](restty-development.md) — renderer, pinned dependencies,
  restoration, resource limits, and failure behavior.
- [Restty cutover evidence](restty-cutover-evidence.md) — migration history and
  regression coverage.

## Design and product reference

- [Product contract](spec.md) — the authority for observable behavior, supported
  platforms, security, privacy, and architecture boundaries.
- [Domain language](../CONTEXT.md) — shared project terms.
- [Architecture decisions](adr/README.md) — decisions, tradeoffs, and their
  original reasoning.

The practical guides summarize the product contract; they do not replace it.

## Maintaining releases

- [Release policy and native procedures](release.md) — native builds,
  verification, checksums, explicit acceptance, and separately authorized
  manual publication.
- [Versioning](versioning.md) — compatibility, development baselines, tags,
  and immutable published releases.

## Legal

- [MIT License](../LICENSE)
- [Third-Party Notices](../THIRD_PARTY_NOTICES.md)
