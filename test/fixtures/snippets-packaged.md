# Installed Snippets native qualification

This fixture exercises an ordinary `.omxext` install and explicit trust through
Settings, followed by real hosted-page requests through production semantic
admission, presentation, Surface and PTY delivery. It is not qualification of an
unchanged packaged host, physical keyboard, default GPU, or platform cutover.

## Composition supplied by the integration owner

`OMXTERM_SNIPPETS_PACKAGED_ENTRY` must be an absolute path to a built Electron
main entry with unchanged production Linux ARM64 composition, lifecycle and
assets. Production routes the ordinary Snippets command to the optional installed
companion or Extensions guidance, with no duplicate action or built-in view. Retain production
`registerSemanticInputIpc`, renderer semantic capture/preview, native gesture
ownership and hosted presentation wiring. Do not bypass admission or expose a
fixture terminal-injection API. The entry must honor the isolated configuration
root and `-e /bin/sh -i` arguments and join normal shutdown.

The fixture imports this entry after installing test-only observers for PTY writes,
backend retirement, native chooser and trust responses. Observed PTY writes are
forwarded unchanged; no input is admitted by those observers. Catalog and profile
are created inside the supervisor-owned temporary root. The supplied archive and
entry are read only. The archive digest is checked before launch, at consent, in
the result, and after execution; the entry digest is checked before/after.

On the assigned disposable Linux ARM64 desktop only, run the normal source build,
then `node test/fixtures/snippets-qualification-build.mjs /absolute/new/qualification`
to copy its artifacts and rebuild main/renderer without source substitutions.
The builder refuses output reuse and records source hashes and `differences: []`. It leaves shipping `dist` unchanged. The copied host
uses the source's installed dependencies; keep both until qualification settles.

```sh
OMXTERM_SNIPPETS_PACKAGED_ENTRY=/absolute/qualification/main/index.js \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_PACKAGED_EVIDENCE=/absolute/evidence \
  npm test -- test/integration/snippets-packaged.test.ts
```

With none of these variables set, the test skips without opening Electron. Partial
configuration fails rather than silently skipping. `runNativeFixture` supervises
launch, timeout, cancellation and cleanup. A successful result requires normal
exit, no cleanup errors, joined backend/PTY shutdown and exactly one scenario
receipt. The integration owner should retain the supervisor receipts alongside
host commit/build and archive provenance.

## Oracles and limits

- Absent/disabled package guidance without implicit installation or enablement;
  retained compatibility toggle with catalog readiness before row interaction.
- Dormant install, exact archive trust, one active native child/backend, and no
  built-in Snippets DOM in the core renderer.
- Exact PTY bytes for Insert and Run, with shell output receipts proving actual
  execution. Native Enter activation, repeat after focus handoff, and release
  must not append additional input. Chromium repeat receipt is checked explicitly.
- Both preview intent overrides; literal preview body; native-child exclusion;
  Cancel emits no bytes and restores the initiating control's native focus.
- Retained query across hide/reactivate; live en-US/pt-BR labels via real Settings
  language changes without replacing the query.
- Disable/uninstall joins backend retirement, preserves catalog bytes, and leaves
  the same canvas and PTY usable for a subsequent shell command.

Rendering explicitly selects ANGLE SwiftShader, not the default GPU. Optional
evidence retains supervisor results, child/core/preview captures and failure
DOM outside the cleaned fixture profile. Input uses DOM clicks and Electron
`sendInputEvent`, plus `/usr/bin/xdotool` XTest events for the held Enter sequence
across native focus handoff (install xdotool in the assigned guest). Keydown,
and repeat are observed through Electron on the child/core respectively. Release
is verified with X11 `XQueryKeymap` (Python 3 and libX11), followed by exact PTY
byte isolation and a fresh Enter that must reach the terminal. A minimal Electron
comparison reproduced missing `before-input-event` and DOM keyUp after prevented
autorepeat, even without OMXTerm; this fixture does not claim an Electron keyUp
receipt for that suppressed sequence. This is synthetic X11 input, not physical keys. Consent is
controlled. There is a bounded post-delivery drain assertion, not proof against
arbitrarily delayed events. This fixture does not cover Kitty protocol, Protected
Paste, stale selection, missing targets, removal during preview, update, backend
crash, all catalog boundaries or published artifact compatibility; those require
separate evidence. Native execution remains the integration owner's responsibility.
