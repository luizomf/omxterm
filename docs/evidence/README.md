# Evidence inventory and scope

These files preserve bounded historical observations, not current product
requirements or automatic release blockers. Current behavior and verification
procedures live in the [spec](../spec.md) and [release procedure](../release.md).
The documentation reconciliation in
[#567](https://github.com/luizomf/omxterm/issues/567) changed none of these historical
measurements and added no native qualification runs.

| Record                                                           | Provenance and interpretation                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue-314-emoji.json`                                           | #314 macOS original/compact Apple emoji comparison: source/lockfile/runtime hashes, 18 runs, parser equivalence, paired rendering/geometry and separate memory domains. See [experiment](../emoji-shaping-experiment.md).                                             |
| `issue-316-hidden-rendering.json`                                | #316 baseline/reviewed-candidate comparison with source digests and measured hidden GL/CPU, reveal, ingestion and image behavior. See [report](../hidden-rendering-evidence.md).                                                                                      |
| `issue-316-review-verification.json`                             | Separate post-review fixture result, including synchronized reveal. This JSON has no standalone source/runtime digest; its association with the final runtime is documented in the [report](../hidden-rendering-evidence.md), not independently encoded in this file. |
| `issue-317-depth-original.json`, `issue-317-depth-disabled.json` | #317 matching fixture/lockfile pair with distinct variant-runtime hashes, `alpha:false`, native GL and process-memory observations. Current rendering uses `alpha:true`; see [re-evaluation](../webgl-depth-evidence.md#current-depth-re-evaluation).                 |
| `macos-direct-blur.md`                                           | #415 uncommitted-candidate integration and unpacked-app evidence on macOS 27, not proof of visible desktop blur or older-OS compatibility. Later shipped in 0.17.0.                                                                                                   |
| `issue-416-linux-native-resize.md`                               | #416 Electron 43.1.1/43.4.1 native pointer differential, candidate integration and non-installing package evidence on recorded Linux desktops. Later shipped in 0.17.0.                                                                                               |

The raw JSON is retained unchanged. Browser compatibility user-agent strings
are not native host identity. API success, parsed PTY output, captured pixels,
process memory and GPU allocation are distinct evidence domains. Neither source
base alone nor a development version identifies uncommitted candidate bytes;
recorded file digests matter. A historical local retention path does not promise
that its files exist in a fresh checkout.

## Audit #566: release-evidence gaps

[#566](https://github.com/luizomf/omxterm/issues/566) reports the following gaps;
they are separate from its product-behavior findings. Their preservation does
not carry forward its instruction to treat old contracts as immutable.

- **Exact Linux helper uninstall:** `scripts/verify-packaged-app.mjs` invokes
  the exact helper's `--version` and `install`, then removes the isolated fixture
  home recursively. It does not invoke `uninstall`. Thus its `FULL` result is
  not exact-artifact uninstall evidence. Source-helper unit tests exercise
  uninstall with synthetic AppImages; those are a different seam. The
  [0.20.1 record](../releases/0.20.1.md) retains this limitation. Historical
  records that explicitly report supplemental uninstall observations are not
  erased or inferred solely from the present verifier. A focused future
  verifier improvement can exercise exact-helper uninstall and preservation of
  unrelated fixture files; no such new run is claimed here.
- **Historical Windows Chrome crash:** available release records leave a crash
  unexplained. [#561](https://github.com/luizomf/omxterm/issues/561) is closed and
  has no additional comments establishing a cause. The recorded acceptance and
  later passing run stand as observations, not a diagnosis. Recover the failing
  source/environment and assess relevance before reusing it as current
  qualification or filing a current Windows defect; absence of that evidence
  alone does not reopen a published release or block a new one.
- **Cinnamon/Xfce/MATE source identities:** the
  [desktop reports](../linux-installer.md) lack full tested SHAs. Their bounded
  observations remain useful compatibility context, but a shared development
  version cannot establish exact-build qualification. Recover source provenance
  if exact-input reuse is needed, or record identities in a new focused check.
  Do not invent SHAs or infer a currently failing product from missing provenance.

These are documentation/provenance and targeted automation follow-ups, not
fresh native reproductions. Current release decisions belong to the maintained
release procedure and the relevance of actual evidence, not a checklist imported
from this historical inventory.
