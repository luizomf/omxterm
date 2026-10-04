# Restty preparation input fixture

`restty-runtime-history.json` contains reverse line deltas for the prior runtime
inputs currently accepted by `prepareResttyRuntime`. It is active test data, not
product guidance or a record of release qualification.

Reconstruction starts with the installed corrected runtime. Each record has a
name, expected SHA-256 and edits applied to `source.split("\n")`. An edit gives
`start`, `deleteCount` and replacement `lines`; edits within a record run in
descending line order. The resulting state becomes the next record's input.
This keeps the fixture small without importing production correction arrays
into the test.

[`restty-runtime-history.test.ts`](../integration/restty-runtime-history.test.ts)
checks each reconstructed input against its pinned digest, prepares it to the
same reviewed output, checks idempotency and rejects modified input without
rewriting it. The current corrected runtime is tested as an additional state.
The [emoji experiment runtime test](../unit/emoji-experiment-runtime.test.ts)
also uses a prior state to verify rejection of stale probe inputs.

When accepted preparation inputs change, keep the reverse deltas and expected
hashes consistent with the actual prepared bytes. These checks establish runtime
preparation behavior; they do not rerun native rendering or package qualification.
