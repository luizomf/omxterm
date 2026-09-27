# Documentation

## Start here

| I want to…                                    | Read                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Download and install OMXTerm                  | [Installation](../README.md#installation)                                                                                   |
| Learn the controls or solve a common problem  | [Everyday use](usage.md)                                                                                                    |
| Update or uninstall the application           | [Update/uninstall](../README.md#updating-or-uninstalling)                                                                   |
| Set up background transparency or Linux blur  | [Background effects and desktop tips](configuration.md#background-transparency-and-blur)                                    |
| Set up a complete example configuration       | [macOS](quick-start/macos.md) · [Linux](quick-start/linux.md) · [Windows](quick-start/windows.md)                           |
| Change a setting, shortcut, theme, or snippet | [Configuration](configuration.md)                                                                                           |
| Edit and preview a theme in the browser       | [OMXTerm Studio workflow](configuration.md#edit-visually-with-omxterm-studio)                                               |
| Help without writing code or report a problem | [Feedback and bug reports](../CONTRIBUTING.md#help-without-writing-code)                                                    |
| Contribute a documentation or code change     | [Contributing](../CONTRIBUTING.md#your-first-documentation-or-code-change)                                                  |
| Help add x64 support                          | [Linux #223](https://github.com/luizomf/omxterm/issues/223) · [Windows #224](https://github.com/luizomf/omxterm/issues/224) |
| Report a vulnerability privately              | [Security policy](../SECURITY.md)                                                                                           |

The guides describe the current source tree. The [README](../README.md) identifies
both the latest download and the development version; [release notes](releases/)
record the changes and limitations of each published version.

You do not need the technical references below to install, use, or customize
OMXTerm. Start with the guides above; code/build tools are only for source work.

## Development and maintenance

- [Product contract](spec.md) — current behavior and security boundaries.
- [Project vocabulary](../CONTEXT.md) and [architecture decisions](adr/README.md).
- [Restty development](restty-development.md) — renderer integration, pinned
  dependencies, restoration, and regression coverage.
- [Versioning](versioning.md) and [release procedures](release.md) — native
  verification, artifact records, and publication.
- [MIT License](../LICENSE) and [Third-Party Notices](../THIRD_PARTY_NOTICES.md).

## Historical technical evidence

These are investigation records, not setup instructions. Their measurements
apply to the recorded source and environment, not automatically to later builds.

- [Restty migration](restty-cutover-evidence.md)
- [Emoji shaping and memory](emoji-shaping-experiment.md)
- [Hidden-tab rendering](hidden-rendering-evidence.md)
- [WebGL depth attachment](webgl-depth-evidence.md)
- [macOS privacy permissions across builds](macos-privacy-identity.md) — includes
  an unadopted signing proposal; normal packaging is unchanged.
