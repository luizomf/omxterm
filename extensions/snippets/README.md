# Optional Snippets package

This separately built package preserves the built-in Snippets YAML v1 catalog,
search, exact text, Insert/Run and core-owned preview. Linux ARM64 development
source uses this installed tool; other targets retain built-in Snippets. This
source does not announce a published replacement. See the
[migration guide](../../docs/snippets-migration.md) and its release prerequisite.

Build committed source with `node scripts/build-snippets-extension.mjs`. The
archive, checksum and receipt are separate artifacts; the receipt starts with
`qualification.status: not-run`. Install the archive through the ordinary
Extensions management path. Installation does not create or change a catalog.
Production intentionally omits the package's duplicate action: the existing
Toggle Snippets menu, palette and shortcut command opens or hides the single
installed companion. Absent/disabled packages open Extensions guidance instead.
Native qualification uses unchanged production composition. No automatic
installation, enablement or catalog listing is implied.

The backend reads `snippets.yaml` beside the host's `config.json`, honoring the
same XDG/home configuration root. A missing catalog is an empty state. To create
a catalog deliberately, use `snippets.example.yaml` as an example; do not replace
an existing file. Literal block bodies preserve their exact text. `execute:
false` adds no final Enter, but embedded line breaks/control characters can still
execute. Protected Paste remains core-owned. No expansion or conversion occurs.

Each logical panel activation reads one immutable catalog and assembles all
bounded pages before replacing rows. Temporary overlay/layout hiding does not
reactivate the panel. Query/scroll survive hiding; live language changes relabel
controls without rebuilding them. Disabling/uninstalling leaves user files and
terminal sessions intact. Accepted terminal delivery remains Surface-owned.

The archive includes OMXTerm's MIT license and the bundled YAML parser's license
at `licenses/yaml.txt`. See ADR 0044 for qualification and platform-cutover gates.
