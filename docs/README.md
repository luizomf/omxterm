# Documentation

## Using OMXTerm

1. **[Install OMXTerm](installation.md)** on macOS, Linux, or Windows.
2. **[Try your first session](../README.md#first-session)** with the built-in defaults.
3. **[Open Settings](configuration.md#settings)** for preferences and shortcuts; use the [configuration guide](configuration.md) for theme files and snippets.

| Task                                                       | Guide                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Understand how the terminal, shell, and sessions fit       | [How it works](how-it-works.md)                                         |
| Use tabs, shortcuts, copy/paste, links, and image previews | [Everyday use](usage.md)                                                |
| Solve common setup or display issues                       | [Troubleshooting](usage.md#troubleshooting)                             |
| Change fonts, themes, shortcuts, or snippets               | [Configuration](configuration.md)                                       |
| Enable background transparency and blur                    | [Background effects](configuration.md#background-transparency-and-blur) |
| Configure GNOME, KDE Plasma, Hyprland, or VM graphics      | [Linux desktop tips](linux-desktop.md)                                  |
| Add OMXTerm to the Linux application menu                  | [Linux desktop installer](linux-installer.md)                           |
| Update or uninstall OMXTerm                                | [Installation guide](installation.md#updating-or-uninstalling)          |

## Optional tools

**[OMXTerm 0.25.0 is published and Latest](https://github.com/luizomf/omxterm/releases/tag/v0.25.0).**
Files and SSH are installed separately. Snippets is included as a removable
default for new profiles on the targets below. Updating an existing profile does
not install or update tools.

- **[Files](files-development-preview.md)** and
  **[SSH Connect 0.3.1](ssh-connect.md)** are published previews offered through
  the official catalogs on **Linux and macOS ARM64**. Follow each tool's guide
  for installation, compatible hosts and platform/qualification limits.
- **[Snippets](snippets-migration.md)** is optional on stable 0.25.0 for
  **Linux ARM64/x64, macOS ARM64 and Windows ARM64**. The official catalog offers
  0.1.1; new packaged profiles try to install the 0.1.0
  [removable default](default-snippets.md) once. Existing users choose installation. Your YAML and disabled/removed choices stay intact. Windows x64
  retains built-in Snippets. Windows ARM64 has
  [unresolved public-install failures and testing gaps](snippets-migration.md#stable-0250-release-disposition);
  users needing built-in Snippets may remain on 0.23.0.
- **[Saved Layout](saved-layout.md)** and **[Mirror Typing](mirror-typing.md)**
  are source-only previews with no published archive or catalog offer. Their
  availability notes summarize the limits; developer records retain build and
  qualification details.

Development source also has Files 0.8 path insertion/drop and #818's revised
palette preview. Neither is in stable 0.25.0, which cannot run Files 0.8. See each
tool's guide for the host versions actually tested.

### Historical preview and composition evidence

The [Snippets migration guide](snippets-migration.md) retains the earlier exact
preview pairs, source/package/public-HTTPS checkpoints and failed occurrences.
The [macOS ARM64](macos-extension-composition.md),
[Linux x64](linux-x64-extension-composition.md) and
[Windows ARM64](windows-arm64-extension-composition.md) composition guides retain
separate foundation, hosted-view and packaging evidence. Their historical
built-in-Snippets checkpoints do not qualify later optional-Snippets artifacts;
the linked guides preserve exact inputs and remaining limits.

Downloads and checksums are listed in the [README](../README.md#platforms-and-downloads), and full changelogs are in [GitHub Releases](https://github.com/luizomf/omxterm/releases).

---

## Development and Contributing

Developer and architecture docs for contributors and coding agents:

- **[Contributing](../CONTRIBUTING.md)** — reporting bugs, setting up a local checkout, running checks, and opening pull requests.
- **[Contributing translations](translations.md)** — a beginner-friendly browser-only correction, catalog examples, and maintainer help with new languages and checks.
- **[AGENTS.md](../AGENTS.md)** — quick command reference and repository rules for coding agents.
- **[Native development](development.md)** — OS prerequisites, test suites, graphical test precautions, and packaging verification.
- **[Saved Layout development record](saved-layout-development.md)** — source build, storage behavior, compatibility and qualification limits.
- **[Mirror Typing development record](mirror-typing-development.md)** — source build, input behavior, capability contract and qualification limits.
- **[Native subsystem fixture reference](native-test-reference.md)** — focused fixture prerequisites, commands, limits, and evidence boundaries.
- **[UI style guide](ui-style-guide.md)** — the small palette, spacing, control and responsive-layout vocabulary implemented by Settings.
- **[Restty Terminal Surface](restty-development.md)** — rendering integration, pinned dependencies, WASM core rebuilds, and optional diagnostics.
- **[Usage development notes](usage-development.md)** and **[configuration development notes](configuration-development.md)** — implementation details retained from the concise user guides.
- **[Terminology](../CONTEXT.md)**, **[Product contract](spec.md)**, and **[Architecture Decision Records](adr/README.md)** — domain terms, observable behavior, and architectural rationale.
- **[Security policy](../SECURITY.md)** — private vulnerability reporting and security boundaries.
- **[MIT License](../LICENSE)** and **[Third-Party Notices](../THIRD_PARTY_NOTICES.md)**.

### Maintainer references

- **[Versioning policy](versioning.md)** and **[Release procedures](release.md)**.
- **Issue tracker:** [operations](agents/issue-tracker.md), [triage labels](agents/triage-labels.md), and [domain references](agents/domain.md).
