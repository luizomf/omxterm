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

## Optional add-ons

Some features are add-ons you install from **Settings → Extensions → Browse
official extensions**. They are previews, offered only where they have been
tested.

| Add-on                               | What it does                                   | Offered on                                                               |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| [Files](files-availability.md)       | Browse folders, move and delete files          | Linux on ARM64, Macs with Apple silicon                                  |
| [SSH Connect](ssh-connect.md)        | Open a terminal session on another computer    | Linux on ARM64, Macs with Apple silicon                                  |
| [Snippets](snippets-availability.md) | Save commands or text and insert them in a tab | Linux, Macs with Apple silicon, Windows on ARM (built in on Windows x64) |

[Saved Layout](saved-layout.md) and [Mirror Typing](mirror-typing.md) are still
in development and can't be installed yet.

Downloads and checksums are listed in the [README](../README.md#platforms-and-downloads), and full changelogs are in [GitHub Releases](https://github.com/luizomf/omxterm/releases).

---

## Development and Contributing

Developer and architecture docs for contributors and coding agents:

- **[Contributing](../CONTRIBUTING.md)** — reporting bugs, setting up a local checkout, running checks, and opening pull requests.
- **[Contributing translations](translations.md)** — a beginner-friendly browser-only correction, catalog examples, and maintainer help with new languages and checks.
- **[AGENTS.md](../AGENTS.md)** — quick command reference and repository rules for coding agents.
- **[Native development](development.md)** — OS prerequisites, test suites, graphical test precautions, and packaging verification.
- **[First-time reader audit](first-time-reader-audit.md)** — newcomer blockers, documentation dispositions, and platform walkthroughs still needed.
- **[SSH Connect development record](ssh-connect-development.md)** — exact package evidence, integration contract, and qualification limits.
- **[Saved Layout development record](saved-layout-development.md)** — source build, storage behavior, compatibility and qualification limits.
- **[Mirror Typing development record](mirror-typing-development.md)** — source build, input behavior, capability contract and qualification limits.
- **[Files development record](files-development-preview.md)** — package, backend, view, build, tests and platform limits.
- **[Snippets migration record](snippets-migration.md)** — exact release limits, historical preview pairs and qualification evidence.
- **[Extension composition records](macos-extension-composition.md)** — platform-specific foundation, hosted-view and packaging evidence; see also [Linux x64](linux-x64-extension-composition.md) and [Windows ARM64](windows-arm64-extension-composition.md).
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
