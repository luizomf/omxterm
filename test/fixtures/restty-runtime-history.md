# Restty runtime history fixture

`restty-runtime-history.json` preserves the 24 pre-final runtime inputs recognized
by `prepareResttyRuntime` at `c8da1adee9cedaa0fe1b104b57a59116a6874428`.
Each record contains reverse line edits from the preceding state, starting at
the installed corrected runtime. Indices address `source.split("\n")`; edits
are applied in descending order. This keeps snapshots small without importing
production correction arrays into the test.

Inputs were recovered from the locked Restty 0.3.0 npm runtime and baseline
corrections, including superseded clipboard comments, Select All, required-font
selection and split-OSC-terminator variants. Every reconstructed input matched
its existing pinned SHA-256 before use. The integration test independently
checks these hashes and exact corrected output, idempotency, and rejection of
modified input without rewriting it. The corrected runtime is also an entry. Later corrections prepend reverse
deltas to retain the preceding final input, including the pre-Space-routing
runtime and the subsequent native dead-key Space correction; each reconstructed
digest is still checked independently. The native-scroll feedback correction
prepends the exact preceding final runtime (`742a6d14…`), so both a fresh locked
npm runtime and a known prepared installation must reach identical corrected
bytes, with no changes to core WASM or event declarations.

Baseline characterization found six recognized inputs unable to reach the final
hash: `priorCorrected`, `priorAppearance`, `priorBoldColor`, `priorFamilyFilter`,
`priorFont`, and `priorScrollback`. Their two obsolete clipboard comments were
not normalized. The consolidated path normalizes them at the clipboard stage;
it does not change any final runtime bytes or accepted digest identities.
