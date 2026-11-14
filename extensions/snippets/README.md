# Optional Snippets package

This separately built package preserves the built-in Snippets YAML v1 catalog,
search, exact text, Insert/Run and a body tooltip per row. Current host source uses
optional Snippets on Linux ARM64/x64, macOS ARM64 and Windows ARM64; Windows x64
retains built-in Snippets. See the [migration guide](https://github.com/luizomf/omxterm/blob/main/docs/dev/snippets-migration.md)
for distribution and qualification boundaries.

Build committed source with `node scripts/build-snippets-extension.mjs`. The
archive, checksum and receipt are separate artifacts; the receipt starts with
`qualification.status: not-run`. Install the archive through the ordinary
Extensions management path. Installation does not create or change a catalog.
Production intentionally omits the package's duplicate action: the existing
Toggle Snippets menu, palette and shortcut command opens or closes the single
installed companion. Absent/disabled packages open Extensions guidance instead.
The host's [new-profile default](https://github.com/luizomf/omxterm/blob/main/docs/dev/default-snippets.md) uses the pinned
`0.1.4` archive, not this package. Building this source does not publish, install
or enable it, or change a catalog listing. Updating an installed copy requires a
deliberate update and ordinary package trust; it is not automatic.

Snippets `0.1.1` reads `snippets.yaml` beside
the host's `config.json`: a nonempty `XDG_CONFIG_HOME` takes precedence; otherwise
it uses the OS account home, independent of `HOME` or `USERPROFILE`. The existing
published `0.1.0` instead uses the environment-sensitive home
when XDG is unset or empty, so it can read a different catalog. Installing or
updating this package does not change the host's bundled default. A missing catalog
is an empty state. To create
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
