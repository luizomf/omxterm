# Documentation

## Use OMXTerm

1. **[Install](installation.md)** on macOS, Linux, or Windows.
2. **[Try your first session](../README.md#first-session)** with the built-in defaults.
3. **[Make it yours](configuration.md)** using the starter files or
   [OMXTerm Studio](configuration.md#edit-visually-with-omxterm-studio).

| I want to…                                             | Read                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Understand the terminal, shell, and session            | [How it works](how-it-works.md)                                         |
| Use tabs, shortcuts, copy/paste, and images            | [Everyday use](usage.md)                                                |
| Fix a problem                                          | [Troubleshooting](usage.md#troubleshooting)                             |
| Change fonts, colors, settings, shortcuts, or snippets | [Configuration](configuration.md)                                       |
| Add transparency or blur                               | [Background effects](configuration.md#background-transparency-and-blur) |
| Set up GNOME, KDE Plasma, Hyprland, or VM graphics     | [Linux desktop tips](linux-desktop.md)                                  |
| Add OMXTerm to the Linux application menu              | [Desktop helper](linux-installer.md)                                    |
| Update or uninstall                                    | [Installation guide](installation.md#updating-or-uninstalling)          |

The [README](../README.md#platforms-and-downloads) links the latest download;
[release notes](https://github.com/luizomf/omxterm/releases) describe each
published version.

## Contribute

Humans and coding agents use the same technical references:

- [Contributing](../CONTRIBUTING.md) — report a problem, set up a checkout, verify
  a change, and open a PR. [AGENTS.md](../AGENTS.md) adds concise agent guidance.
- [Development](development.md) — prerequisites grouped by OS, native tests,
  packaging checks, and fixture safety.
- [Terminology](../CONTEXT.md), [product contract](spec.md), and
  [architecture decisions](adr/README.md) — behavior, boundaries, and rationale.
- [Restty development](restty-development.md) — terminal rendering and dependencies.
- Focused diagnostics: [emoji shaping](emoji-shaping-diagnostics.md),
  [hidden rendering](hidden-rendering-diagnostics.md), and
  [WebGL depth attachments](webgl-depth-diagnostics.md).
- [Security policy](../SECURITY.md) — report vulnerabilities privately.
- [MIT License](../LICENSE) and [Third-Party Notices](../THIRD_PARTY_NOTICES.md).

## Maintain OMXTerm

[Maintainer responsibilities](../CONTRIBUTING.md#maintainer-integration-and-releases)
cover integration separately from contributing a PR:

- [Versioning](versioning.md) and [release procedures](release.md).
- Tracker references: [operations](agents/issue-tracker.md),
  [triage labels](agents/triage-labels.md), and [domain references](agents/domain.md).
