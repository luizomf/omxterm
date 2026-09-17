# Bundled Terminal Font Stack

OMXTerm passes these tracked TTF bytes directly to Restty. The ordered bundled
faces are FiraCode Nerd Font Mono regular/bold, DejaVu Sans Mono regular/bold,
and the retained JetBrainsMono Nerd Font Mono regular coverage face. An exact
configured system face precedes them; representative operating-system emoji,
CJK, and symbol faces follow them. OMXTerm never downloads fonts at runtime.

## FiraCode Nerd Font Mono

- Source: Nerd Fonts release `v3.5.1`, `FiraCode.zip`
- Upstream: `https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.5.1`
- Base font: Fira Code 6.2
- Variants: `Mono` regular and bold, preserving patched glyphs within terminal
  cells
- `FiraCodeNerdFontMono-Regular.ttf` SHA-256:
  `53eebbaaa09c483ebb27fdd5cf21073cc4b760308e5d666728e9db2f41616c00`
- `FiraCodeNerdFontMono-Bold.ttf` SHA-256:
  `7435c06ecc46dc975d2c356bf9bf1d8bc2226fdb1a877e6e9580193aae429519`
- `FiraCode-OFL.txt` SHA-256:
  `1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c`
- License: SIL Open Font License 1.1

## DejaVu Sans Mono

- Source: DejaVu Fonts `2.37` TTF distribution
- Upstream: `https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37`
- Variants: regular (`Book` internally) and bold
- `DejaVuSansMono.ttf` SHA-256:
  `b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582`
- `DejaVuSansMono-Bold.ttf` SHA-256:
  `bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769`
- `DejaVu-LICENSE.txt` (one trailing space normalized) SHA-256:
  `f88d5294af5a772f9114eb385009e3478d62b21f3e5bbc34d159d328047c8867`
- License: Bitstream Vera/DejaVu/Arev terms in `DejaVu-LICENSE.txt`

## Retained JetBrainsMono Nerd Font Mono

- Source: Nerd Fonts release `v3.4.0`, `JetBrainsMono.zip`
- Upstream: `https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.4.0`
- Release archive SHA-256:
  `76f05ff3ace48a464a6ca57977998784ff7bdbb65a6d915d7e401cd3927c493c`
- `JetBrainsMonoNerdFontMono-Regular.ttf` SHA-256:
  `f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c`
- `JetBrainsMono-OFL.txt` SHA-256:
  `30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad`
- License: SIL Open Font License 1.1
