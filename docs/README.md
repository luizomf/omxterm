# Documentation

## Start here

| I want to…                                    | Read                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Download and install OMXTerm                  | [Installation](../README.md#installation)                                                         |
| Learn the controls or solve a common problem  | [Everyday use](usage.md)                                                                          |
| Set up a complete example configuration       | [macOS](quick-start/macos.md) · [Linux](quick-start/linux.md) · [Windows](quick-start/windows.md) |
| Change a setting, shortcut, theme, or snippet | [Configuration](configuration.md)                                                                 |
| Report a bug or contribute a change           | [Contributing](../CONTRIBUTING.md)                                                                |
| Report a vulnerability privately              | [Security policy](../SECURITY.md)                                                                 |

The guides describe the current source tree. The [README](../README.md) identifies
both the latest download and the development version; [release notes](releases/)
record the changes and limitations of each published version.

## Development and maintenance

- [Product contract](spec.md) — current behavior and security boundaries.
- [Project vocabulary](../CONTEXT.md) and [architecture decisions](adr/README.md).
- [Restty development](restty-development.md) — renderer integration, pinned
  dependencies, restoration, and regression coverage.
- [Versioning](versioning.md) and [release procedures](release.md) — native
  verification, artifact acceptance, and publication.
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
