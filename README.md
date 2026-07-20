# OMXTerm

OMXTerm is an open-source personal desktop terminal for Apple Silicon macOS.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The current published release is `v0.3.0`, available from the
[GitHub Releases page](https://github.com/luizomf/omxterm/releases) as an
unsigned, non-notarized Apple Silicon DMG with its SHA-256 checksum. Between
releases, `main` carries a `-dev` development baseline version under the
[versioning policy](docs/versioning.md); any DMG built from `main` is a local
verification artifact, not a published release.

## Development

Requires Node.js 22 or newer on Apple Silicon macOS.

```sh
npm install
npm run dev
```

`npm run dev` builds the application and launches one native Terminal Window
containing the user's operating-system-configured interactive login shell. The
shell starts in the user's home directory. Use the native File and Window menus
to create and control additional independent Terminal Windows.

Project checks are available as root scripts:

- `npm run format` formats source files;
- `npm run format:check` checks formatting without changing files;
- `npm run typecheck` checks strict TypeScript types;
- `npm test` runs the complete automated test suite, including the scoped local
  PTY integration check;
- `npm run build` creates the unpackaged development build under `dist/`;
- `npm run package:mac` creates a local unsigned, non-notarized Apple Silicon
  DMG under `release/` and never publishes it;
- `npm run check` runs formatting, typechecking, the complete test suite, the
  arm64 DMG build, packaged-content inspection, and packaged-startup check.

See the [local arm64 release procedure](docs/release.md) for prerequisites, the
exact-DMG manual checklist, checksum generation, Gatekeeper guidance, and the
separately authorized publication gate.

## Configuration

OMXTerm optionally reads `$XDG_CONFIG_HOME/omxterm/config.json`, or
`~/.config/omxterm/config.json` when `XDG_CONFIG_HOME` is unset or empty. The
file is strict JSON: `version` is required and must be `1`. All preferences are
optional, so this is a complete configuration:

```json
{
  "version": 1
}
```

OMXTerm also optionally reads `snippets.json` from the same directory:
user-defined snippets listed in a per-window sidebar toggled with
`Cmd+Shift+S`, filtered by search, and injected into the terminal with a
click. Application shortcuts are remappable through the `keybinds`
preference.

See the [complete configuration guide](docs/configuration.md) for every field,
Otávio's real configuration, keybinds, snippets, external Terminal Themes, the
optional Ghostty conversion helper, and troubleshooting. OMXTerm never
creates, rewrites, migrates, or reloads these files.

## Documentation

- [Documentation map](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [First-release specification](docs/spec.md)
- [Versioning policy](docs/versioning.md)
- [Local arm64 release procedure](docs/release.md)
- [0.1.0 release notes](docs/releases/0.1.0.md)
- [0.2.0 release notes](docs/releases/0.2.0.md)
- [0.3.0 release-note draft](docs/releases/0.3.0.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.

## License

OMXTerm source code is available under the [MIT License](LICENSE). Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
