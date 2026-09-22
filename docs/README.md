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

**Latest published release: [0.14.0](https://github.com/luizomf/omxterm/releases/tag/v0.14.0)**
for macOS, Linux, and Windows ARM64. Use the
[download table](../README.md#platforms-and-downloads) to choose your package.
The [0.14.0 release notes and record](releases/0.14.0.md) describe the tab-bar
toggle, fullscreen and other fixes, limitations, exact checksums and verification.

These guides follow the **0.14.1-dev.0** source tree. The release notes remain
the exact guide to the published packages. The repository is currently private, so GitHub downloads
require repository access.

OMXTerm keeps evolving through everyday use and reported problems. The
[contribution guide](../CONTRIBUTING.md) explains how to share a useful report
or propose an improvement.

### Release history

Published records retain the notes, package identities, and evidence for their
original release:

- [0.13.0](releases/0.13.0.md) — configured font styles and shared resources;
- [0.12.2](releases/0.12.2.md) — Neovim/TUI rendering after zoom and reload;
- [0.12.1](releases/0.12.1.md) — native rendering verification and Windows catch-up;
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
- [macOS privacy identity investigation](macos-privacy-identity.md) — measured
  permission retention across development builds, limitations, and an unadopted
  private-signing proposal; release signing policy is unchanged.

## Legal

- [MIT License](../LICENSE)
- [Third-Party Notices](../THIRD_PARTY_NOTICES.md)
