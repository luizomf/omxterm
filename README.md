# OMXTerm

OMXTerm is an open-source personal desktop terminal for Apple Silicon macOS.

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
- `npm run check` runs formatting, typechecking, the complete test suite, and the
  build.

## Configuration

OMXTerm optionally reads `$XDG_CONFIG_HOME/omxterm/config.json`, or
`~/.config/omxterm/config.json` when `XDG_CONFIG_HOME` is unset or empty. The
file is strict JSON: `version` is required and must be `1`; all preferences are
optional. OMXTerm does not create, rewrite, migrate, or reload this file.

```json
{
  "version": 1,
  "confirmClose": true,
  "logLevel": "info",
  "font": { "family": "SF Mono", "size": 16 },
  "scrollback": { "lines": 10000 },
  "keyboard": { "optionAsAlt": "none" },
  "window": { "alwaysOnTop": false }
}
```

`font.size` accepts integral pixel sizes from 8 through 72 (inclusive) and
defaults to 16. A configured `font.family` must exactly match an installed
system font family. `scrollback.lines` accepts integers from 0 through 100,000.
`logLevel` accepts `error`, `info`, or `debug`; `keyboard.optionAsAlt` accepts
`none`, `left`, `right`, or `both`. Unknown keys and invalid values stop startup
with an actionable error. Fixing a file requires restarting OMXTerm.

- [First-release specification](docs/spec.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.
