# Documentation

New here? [Install OMXTerm](installation.md), then try your
[first session](../README.md#first-session).

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

Install them from **Settings → Extensions → Browse official extensions**.
They are previews, offered only where they have been tested.

| Add-on                               | What it does                                   | Offered on                                                               |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| [Files](files-availability.md)       | Browse folders, move and delete files          | Linux on ARM64, Macs with Apple silicon                                  |
| [SSH Connect](ssh-connect.md)        | Open a terminal session on another computer    | Linux on ARM64, Macs with Apple silicon                                  |
| [Snippets](snippets-availability.md) | Save commands or text and insert them in a tab | Linux, Macs with Apple silicon, Windows on ARM (built in on Windows x64) |
| [Saved Layout](saved-layout.md)      | Save a window's tabs, splits and folders       | Linux, Macs with Apple silicon, Windows on ARM                           |
| [Mirror Typing](mirror-typing.md)    | Type into several panes of a tab at once       | Linux on ARM64, Macs with Apple silicon, Windows on ARM                  |

Changelogs are in [GitHub Releases](https://github.com/luizomf/omxterm/releases).

---

## For contributors

Start with [Contributing](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md).

- **Product:** [Terminology](../CONTEXT.md), [product contract](spec.md),
  [Architecture Decision Records](adr/README.md), [design system](ui-style-guide.md).
- **Building and shipping:** [native development](development.md),
  [versioning](versioning.md), [release procedures](release.md),
  [translations](translations.md), issue tracker
  ([operations](agents/issue-tracker.md), [labels](agents/triage-labels.md),
  [domain references](agents/domain.md)).
- **[Developer records](dev/README.md):** per-feature development notes,
  extension internals, and platform qualification records.
- **Add-on notes:** [Saved Layout](saved-layout-development.md),
  [Mirror Typing](mirror-typing-development.md).
- [Security policy](../SECURITY.md), [MIT License](../LICENSE),
  [Third-Party Notices](../THIRD_PARTY_NOTICES.md).
