# Configuration and internationalization

## Configuration layers

| Layer                                               | Written by | Format and safety                                                                                                            |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `config.json`, `snippets.json`, `themes/`           | the user   | Existing contract in [docs/configuration.md](../configuration.md); hot reload; invalid files fall back with a visible banner |
| `sessions.json`, `highlights.json`, `commands.json` | OMXTerm    | Versioned envelope `{version, data}`, migrations per schema, atomic writes, quarantine, newer versions untouched (ADR 0034)  |
| Credential Store (`credentials.json`)               | OMXTerm    | `safeStorage` ciphertext only; refuses Linux `basic_text`                                                                    |
| `.omxbackup`                                        | OMXTerm    | Encrypted export of the first two rows (see [docs/spec.md](../spec.md#settings-backup))                                      |

New preferences that users would hand-edit go into `config.json` through the
existing validated schema. State that OMXTerm manages through UI goes into
Application Data. That keeps `config.json` free of machine-written churn.

New keybind actions extend the existing keybind schema with platform
defaults. Conflict checking and the reserved-key warning apply to them
automatically: `splitRight`, `splitDown`, `closePane`, `focus*Pane`,
`toggleMaximizePane`, `equalizePanes`, `toggleBroadcast`, `toggleSessions`,
`toggleCommands`.

## Internationalization

- `src/shared/i18n.ts` holds the catalogs.
  - English (`locales/en.ts`) is the source catalog and defines the key
    type.
  - Brazilian Portuguese (`locales/pt-BR.ts`) must cover every key. Its
    type rejects unknown keys, and a unit test (`missingTranslations`)
    fails on any missing one.
- `resolveLocale(navigator.languages)` picks an exact match, then the same
  language, then English.
- Messages are plain templates (`{name}`) or plural forms chosen by
  `Intl.PluralRules`. Numbers, dates and sorting use `Intl.NumberFormat`,
  `Intl.DateTimeFormat` and `Intl.Collator`.
- Built-in command names and labels have their own overlay
  (`command-builtins/pt-BR.ts`, also checked for completeness). Command
  text, option values, highlight patterns and file names are never
  translated.
- **Scope:** renderer UI added by the port (sidebars, modals, banners, the
  Command Manager, backup dialogs).
- **Not translated yet:**
  - the native application menu;
  - native confirmations;
  - the pre-existing English UI strings.

  Moving those needs main-process locale resolution from
  `app.getPreferredSystemLanguages()`; this is planned with the Preferences
  window.

## Planned

- A Preferences window that edits `config.json` through the validated
  schema and the Application Data documents through their services.
- An explicit language override in `config.json`.
