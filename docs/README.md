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
| [Saved Layout](saved-layout.md)      | Save a window's tabs, splits and folders       | Linux, Macs with Apple silicon, Windows on ARM                           |
| [Mirror Typing](mirror-typing.md)    | Type into several panes of a tab at once       | Linux on ARM64, Macs with Apple silicon, Windows on ARM                  |

Downloads and checksums are listed in the [README](../README.md#platforms-and-downloads), and full changelogs are in [GitHub Releases](https://github.com/luizomf/omxterm/releases).

---

## Development and Contributing

Developer and architecture docs for contributors and coding agents:

- **[Contributing](../CONTRIBUTING.md)** — reporting bugs, setting up a local checkout, running checks, and opening pull requests.
- **[Contributing translations](translations.md)** — a beginner-friendly browser-only correction, catalog examples, and maintainer help with new languages and checks.
- **[AGENTS.md](../AGENTS.md)** — quick command reference and repository rules for coding agents.
- **[Native development](development.md)** — OS prerequisites, test layers and suites, graphical test precautions, the performance benchmark, and packaging verification.
- **[First-time reader audit](first-time-reader-audit.md)** — newcomer blockers, documentation dispositions, and platform walkthroughs still needed.
- **[SSH Connect development notes](ssh-connect-development.md)** — launch handoff to core, build, tests and current limits.
- **[Saved Layout development notes](saved-layout-development.md)** — capture, opening, storage, build, tests and current limits.
- **[Mirror Typing development notes](mirror-typing-development.md)** — how the setup page and core input route fit together, build, tests and limits.
- **[Files development notes](files-development-preview.md)** — package, backend, view, build, tests and platform limits.
- **[Snippets extension](snippets-migration.md)** — which hosts use it, terminal-input rules, build, test and publish.
- **[Extension composition records](macos-extension-composition.md)** — platform-specific foundation, hosted-view and packaging evidence; see also [Linux x64](linux-x64-extension-composition.md) and [Windows ARM64](windows-arm64-extension-composition.md).
- **[Design system](ui-style-guide.md)** — tokens, shared components and wording rules that every official OMXTerm surface and extension uses.
- **[Restty Terminal Surface](restty-development.md)** — rendering integration, pinned dependencies, WASM core rebuilds, and optional diagnostics.
- **[Usage development notes](usage-development.md)** and **[configuration development notes](configuration-development.md)** — edge cases the user guides leave out.
- **[Terminology](../CONTEXT.md)**, **[Product contract](spec.md)**, and **[Architecture Decision Records](adr/README.md)** — domain terms, observable behavior, and architectural rationale.
- **[Security policy](../SECURITY.md)** — private vulnerability reporting and security boundaries.
- **[MIT License](../LICENSE)** and **[Third-Party Notices](../THIRD_PARTY_NOTICES.md)**.

### Maintainer references

- **[Versioning policy](versioning.md)** and **[Release procedures](release.md)**.
- **Issue tracker:** [operations](agents/issue-tracker.md), [triage labels](agents/triage-labels.md), and [domain references](agents/domain.md).
