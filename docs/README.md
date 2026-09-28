# Documentation

## Get started

1. **[Install OMXTerm](installation.md)** for macOS, Linux, or Windows.
2. **[Try your first session](../README.md#first-session)** and learn a few shortcuts.
3. **[Make it yours](configuration.md)** with fonts, colors, and snippets.

## Find what you need

| I want to…                                    | Read                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Learn shortcuts, tabs, copy/paste, and images | [Everyday use](usage.md)                                                                          |
| Fix a problem                                 | [Troubleshooting](usage.md#troubleshooting)                                                       |
| Try a complete configuration                  | [macOS](quick-start/macos.md) · [Linux](quick-start/linux.md) · [Windows](quick-start/windows.md) |
| Change a setting or shortcut                  | [Configuration](configuration.md)                                                                 |
| Edit themes visually                          | [OMXTerm Studio workflow](configuration.md#edit-visually-with-omxterm-studio)                     |
| Add transparency or blur                      | [Background effects](configuration.md#background-transparency-and-blur)                           |
| Add OMXTerm to the Linux application menu     | [Desktop helper](linux-installer.md)                                                              |
| Update or uninstall                           | [Installation guide](installation.md#updating-or-uninstalling)                                    |
| Give feedback or contribute                   | [Contributing](../CONTRIBUTING.md)                                                                |
| Report a vulnerability privately              | [Security policy](../SECURITY.md)                                                                 |

The guides follow the current source. [Release notes](releases/) record what
shipped in each version; the [README](../README.md#platforms-and-downloads) links
to the latest download.

For GNOME, KDE Plasma, Hyprland, and VM graphics setup, see
[Linux desktop tips](quick-start/linux-desktop.md).

## For developers

- [Development setup](../CONTRIBUTING.md#development-environment) and
  [native prerequisites and tests](development.md).
- [Product contract](spec.md), [project vocabulary](../CONTEXT.md), and
  [architecture decisions](adr/README.md).
- [Restty development](restty-development.md) — terminal rendering and dependencies.
- [Versioning](versioning.md) and [release procedures](release.md).
- [MIT License](../LICENSE) and [Third-Party Notices](../THIRD_PARTY_NOTICES.md).

<details>
<summary>Past technical investigations</summary>

Measurements here describe the recorded builds and environments:

- [Restty migration](restty-cutover-evidence.md)
- [Emoji shaping and memory](emoji-shaping-experiment.md)
- [Hidden-tab rendering](hidden-rendering-evidence.md)
- [WebGL depth attachment](webgl-depth-evidence.md)
- [macOS privacy permissions](macos-privacy-identity.md), including an unadopted
  signing proposal

</details>
