# Contributors and origins

OMXTerm is maintained by [Luiz Otávio Miranda (@luizomf)](https://github.com/luizomf).
Thank you to everyone who contributes code, reports, testing, documentation, and
ideas. This page can grow without expanding the application's compact About dialog.

## Adapted contributions

- **Rafael Ruscher (@ruscher)** — the compact About implementation adapts
  text-safe rendering, named link buttons, runtime-version delivery, and the
  typed fixed-link route from [PR #622](https://github.com/luizomf/omxterm/pull/622),
  source commit [`b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38`](https://github.com/ruscher/omxterm/tree/b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38).
  The selected source files are `src/renderer/about/about-dialog.ts`,
  `src/main/about-wiring.ts`, `src/shared/about.ts`, and
  `src/preload/about-bridge.ts`. OMXTerm adds compact credits, owner lifetime
  handling, and integration with its existing terminal input policy; this is
  selective reuse, not integration of the entire PR. The resizable Auxiliary
  Panel also adapts the lazy exclusive-view/visible-dismiss ideas from
  `src/renderer/workspace-sidebar.ts` and pointer/keyboard divider ideas from
  `src/renderer/pane-view.ts` at the same source commit. OMXTerm adds deactivation,
  async lifetime guards, bounded per-window geometry, complete capture cleanup,
  clipboard routing and overlay integration; no workspaces or splits are included.
- **AshyTerm / Community Big** — the contributed About source identifies its
  presentation as AshyTerm-style. We credit that presentation origin without
  claiming that all About code originated in AshyTerm. Its retained
  [Community Big MIT notice](assets/licenses/ashyterm-MIT.txt), supplied with
  the same contribution, is also shipped with OMXTerm.

## Licenses

OMXTerm uses the permissive [MIT License](LICENSE), not a copyleft license.
Credits do not replace copyright or license notices. See
[third-party notices](THIRD_PARTY_NOTICES.md) for bundled components and their
separately retained terms.
