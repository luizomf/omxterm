# Select the interface language explicitly

## Context

OMXTerm's own interface text (native menus, dialogs, Window Chrome, the
Auxiliary Panel, Settings, snippet preview, Local Image Preview, About and Scrollback Search controls) was
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
Terminal Surface receives its labels through its configuration, including replay
after a pending pane mount, and imports no catalog. Pane menus, singular Close
Pane/plural Close Tab dialogs, Surface regions and separators use that same
language; existing controls relabel without rebuilding the split layout. It reports structured failure
identity and separate diagnostic detail; the window host translates and retains
the visible notice until teardown, including after initial mount rejection.
Document language, accessible names, resize value text and already-visible
application notices follow the same live binding.

Settings exposes the same exact language tags through a live General-page
selector. Options keep their self-names, **English (United States)** and
**Português (Brasil)**, in every interface language; removing the preference
still inherits en-US. It shares main's strict
validation, serialized writes/reloads and setting lifetimes. Settings pages,
controls, choices, placeholders, accessibility labels and existing statuses
relabel without building/adopting/filling the editor or initiating a read/save.
Draft bytes/revisions, unfinished graphical edits, focus/caret/selection, scroll,
selected page and pending operations remain owned by their existing lifetimes.

The small Settings IPC message contract distinguishes literal diagnostic strings
from bounded app-owned identities for read/decoding/JSON/object/symlink errors,
conflicts, write/application failure, reload frames and deferred font fields.
Main's existing user-file banner remains rendered text; Settings receives the
identity and renders it using its current language, including a late response.
No English-sentence matching, general notification framework or second save
system is involved. Validator and warning detail is interpolated literally.

Snippet row labels update on retained controls instead of rebuilding rows. An
open preview relabels controls and its unavailable notice without recapturing a
pane/Surface target, replacing its body, resetting disabled actions, resubscribing or moving
focus. User-owned names/descriptions/bodies are never translated. Settings,
About, local-image and snippet previews do not stack; all use the window's same
language owner, and each removes its bindings at teardown.

These stay English: the validator's diagnostic detail inside a translated reload
notice, technical cause detail inside a translated Surface failure notice,
failures reported before the configuration loads, Operational Events and
logs ([ADR 0004](0004-log-the-operational-envelope-not-terminal-payload.md)), `snippets.yaml`
diagnostics, and text owned by the operating system, Electron or Restty that
OMXTerm does not set.

## Consequences

Adding a language means adding one complete catalog and its tag; the config
schema, docs and tests list the accepted tags. Terminal Payload, shell output and
program text are never translated. Diagnostics stay in a single language for
support and issue reports.
