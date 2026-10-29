# Documentation

## Using OMXTerm

1. **[Install OMXTerm](installation.md)** on macOS, Linux, or Windows.
2. **[Try your first session](../README.md#first-session)** with the built-in defaults.
3. **[Customize your setup](configuration.md)** using the starter files or [OMXTerm Studio](configuration.md#edit-visually-with-omxterm-studio).

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

Optional Linux ARM64 development extensions: [Files](files-development-preview.md),
[SSH Connect](ssh-connect.md), [Saved Layout](saved-layout.md) and
[Mirror Typing](mirror-typing.md).
They are separately installed, not bundled
features or a stable extension SDK.

Downloads and checksums are listed in the [README](../README.md#platforms-and-downloads), and full changelogs are in [GitHub Releases](https://github.com/luizomf/omxterm/releases).

---

## Development and Contributing

Developer and architecture docs for contributors and coding agents:

- **[Contributing](../CONTRIBUTING.md)** — reporting bugs, setting up a local checkout, running checks, and opening pull requests.
- **[Contributing translations](translations.md)** — a beginner-friendly browser-only correction, catalog examples, and maintainer help with new languages and checks.
- **[AGENTS.md](../AGENTS.md)** — quick command reference and repository rules for coding agents.
- **[Native development](development.md)** — OS prerequisites, test suites, graphical test precautions, and packaging verification.
- **[UI style guide](ui-style-guide.md)** — the small palette, spacing, control and responsive-layout vocabulary implemented by Settings.
- **[Restty Terminal Surface](restty-development.md)** — rendering integration, pinned dependencies, WASM core rebuilds, and optional diagnostics.
- **[Terminology](../CONTEXT.md)**, **[Product contract](spec.md)**, and **[Architecture Decision Records](adr/README.md)** — domain terms, observable behavior, and architectural rationale.
- **[Security policy](../SECURITY.md)** — private vulnerability reporting and security boundaries.
- **[MIT License](../LICENSE)** and **[Third-Party Notices](../THIRD_PARTY_NOTICES.md)**.

### Maintainer references

- **[Versioning policy](versioning.md)** and **[Release procedures](release.md)**.
- **Issue tracker:** [operations](agents/issue-tracker.md), [triage labels](agents/triage-labels.md), and [domain references](agents/domain.md).
