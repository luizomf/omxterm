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
file is strict JSON: `version` is required and must be `1`; all preferences are
optional. OMXTerm does not create, rewrite, migrate, or reload this file.

```json
{
  "version": 1,
  "confirmClose": true,
  "logLevel": "info",
  "font": { "family": "Fira Code", "size": 16, "lineHeight": 1.15 },
  "terminal": {
    "padding": { "top": 0, "right": 8, "bottom": 8, "left": 8 }
  },
  "scrollback": { "lines": 10000 },
  "keyboard": { "optionAsAlt": "none" },
  "window": { "alwaysOnTop": false },
  "theme": { "path": "./themes/my-theme.json" }
}
```

`font.size` accepts integral pixel sizes from 8 through 72 (inclusive) and
defaults to 16. `font.lineHeight` is an independent row-height multiplier from
1.0 through 2.0 (inclusive), supports fractional values, and defaults to 1.0;
it does not change glyph size. A configured `font.family` must exactly match an
installed system font family.

`terminal.padding` accepts only the explicit `top`, `right`, `bottom`, and
`left` integer CSS-pixel fields. Each side accepts 0 through 128 (inclusive) and
defaults to `0`, `8`, `8`, and `8`, respectively. The configured top padding is
added below OMXTerm's fixed 30 px native title/drag inset, which cannot be
configured, so zero top padding never overlaps the traffic-light controls or
drag region. The selected Terminal Theme background continues behind all
padding. Native minimum window bounds remain at least 320 x 200 px and grow at
startup when the configured font or padding needs more room for a visible
terminal grid.

For a flush configurable content box, set every padding side to `0`. A roomier
example is `{"top":8,"right":12,"bottom":8,"left":12}`.
`scrollback.lines` accepts integers from 0 through 100,000. `logLevel` accepts
`error`, `info`, or `debug`; `keyboard.optionAsAlt` accepts `none`, `left`,
`right`, or `both`. Unknown keys and invalid values stop startup with an
actionable error. OMXTerm reads configuration only at startup, so every edit
requires restarting it.

### Terminal Theme

When `theme` is absent, OMXTerm uses the bundled canonical
[`omtheme`](docs/omtheme.json). To use a separate theme, copy that complete
example, edit the copy, and select it with `theme.path`. An absolute path is
used as written; a relative path is resolved from the directory containing
`config.json`. OMXTerm does not expand `~`, environment variables, shell
syntax, or URLs. A symlink works when its final target is a readable regular
file.

The theme file is strict, versioned JSON. Its root must contain exactly
`version`, `name`, and `colors`; `version` must be `1`; `name` must be a
non-empty printable single line of at most 64 Unicode code points; and `colors`
must contain every field shown in the canonical example. Each color must be an
exact hexadecimal `#RRGGBB` value. Partial palettes, alpha colors, CSS
names/functions/variables, inheritance, and imports are unsupported.

An explicitly configured missing, unreadable, non-regular, invalid UTF-8,
invalid JSON, or invalid theme stops startup with the configuration path,
resolved theme path, and actionable reason. OMXTerm never falls back silently
or changes either file. The theme is read once during startup, so theme and
configuration changes require restarting OMXTerm.

- [First-release specification](docs/spec.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

OMXTerm Web, the browser-based SSH broker previously named OMXTerm, is a
separate product.
