# Select the interface language explicitly

## Context

OMXTerm's own interface text (native menus, dialogs, Window Chrome, the
Auxiliary Panel, Local Image Preview, About and Scrollback Search controls) was
English only. Contributors asked for Brazilian Portuguese. Inferring a language
from the operating system would make the interface depend on host state that the
User Configuration does not record, and different processes could disagree.

## Decision

The User Configuration's optional `language` key selects the interface language
from a closed list of exact tags: `en-US` (default) and `pt-BR`. OMXTerm never
reads the system locale to choose it, and any other value is a validation error
under [ADR 0003](0003-strict-non-mutating-user-configuration.md).

English is the source catalog. Every other catalog must translate every key with
the same `{name}` placeholders, which the type system and unit tests enforce; a
missing message falls back to English at runtime. Plural forms use
`Intl.PluralRules` for the selected language. Translations are bundled static
data; parameters are interpolated as literal text.

Main reads the language from the active configuration each time it builds a
menu or opens a native dialog. Renderers receive it in the renderer
configuration and relabel existing elements in place, so a User Configuration
Reload changes the language without recreating tabs, Surfaces or sessions. The
Terminal Surface receives its labels through its configuration and imports no
catalog.

These stay English: the validator's diagnostic detail inside a translated reload
notice, failures reported before the configuration loads, Operational Events and
logs ([ADR 0004](0004-log-the-operational-envelope-not-terminal-payload.md)), `snippets.yaml`
diagnostics, and text owned by the operating system, Electron or Restty that
OMXTerm does not set.

## Consequences

Adding a language means adding one complete catalog and its tag; the config
schema, docs and tests list the accepted tags. Terminal Payload, shell output and
program text are never translated. Diagnostics stay in a single language for
support and issue reports.
