# Versioning policy

OMXTerm uses [Semantic Versioning 2.0.0](https://semver.org/). Stable application versions are `MAJOR.MINOR.PATCH`. New stable target releases use `<os>-<arch>-vMAJOR.MINOR.PATCH` tags; the target prefix is not part of the application version. Once every target of a version has shipped, a complete `vMAJOR.MINOR.PATCH` release with the same assets is GitHub's Latest (see [release](release.md#complete-release)).

- `package.json` and `package-lock.json` define the application version.
- Versions ending in `-dev.N` (for example `0.20.3-dev.0`) mark the development baseline on `main` between releases.
- Published releases and binaries are available in [GitHub Releases](https://github.com/luizomf/omxterm/releases). See [release.md](release.md) for the release build and publication checklist.

Explicitly selected partial development previews may retain their `-dev.N`
version and publish as **non-Latest prereleases**, following the Files/SSH lanes
in [release.md](release.md). They do not become stable releases or automatically
advance main to the next patch baseline. Preserve exact binary/source identities
and re-evaluate extension compatibility before any version change. The explicit
`0.24.1-dev.N`, `0.25.0-dev.N`, `0.26.0-dev.N`, `0.26.1-dev.N`, `0.27.0-dev.N`,
`0.27.1-dev.N`, `0.28.0-dev.N`, `0.28.1-dev.N`, `0.29.1-dev.N`, `0.30.1-dev.N`, `0.31.0-dev.N`, `0.31.1-dev.N` and `0.32.0-dev.N` bridges have distinct
endpoint requirements in the
[compatibility contract](dev/extension-installation-foundation.md#archive-contract).
None automatically extends to another patch or minor development family;
review compatibility and capabilities deliberately at each transition. The stable
suffix-removal rule still applies to stable cuts; stable assets now ship per target.

## Post-0.27.0 development baseline

Stable 0.27.0 uses a frozen cut; the next development baseline is
`0.27.1-dev.0`. Its explicit [compatibility bridge](dev/extension-installation-foundation.md#archive-contract)
admits ranges that accept both stable `0.27.0` and `0.27.1`, so the pinned
Snippets and current Files/SSH ranges (Files' `>=0.26.0`, SSH Connect 0.4's
`>=0.27.0-dev.0`) stay installable without changing archive bytes, engine
ranges, API or capability validation. Upper bounds still apply, including Saved
Layout's `<0.26.0`; admission is not native qualification.

The first feature in this cycle, reopening windows at startup (#969), moved
`main` to `0.28.0-dev.0`. Its bridge admits ranges that accept both `0.27.0` and
`0.28.0`, so the same archives stay installable; Saved Layout 0.3.0 needs
`>=0.28.0-dev.0`.

## Post-0.28.0 development baseline

Stable 0.28.0 uses the frozen cut `ed0ed9e1`; the next development baseline is
`0.28.1-dev.0`. Its bridge admits ranges that accept both `0.28.0` and
`0.28.1`, so every catalog archive, including Saved Layout 0.3.0, stays
installable unchanged.

## Post-0.29.0 development baseline

Stable 0.29.0 uses the frozen cut `aefba704`; the next development baseline is
`0.29.1-dev.0`. Its bridge admits ranges that accept both `0.29.0` and
`0.29.1`. Saved Layout 0.3.1 and Mirror Typing 0.3.0 need `>=0.29.1-dev.0`.

## Post-0.30.0 development baseline

Stable 0.30.0 uses the frozen cut `980c2e27`; the next development baseline is
`0.30.1-dev.0`. Its bridge admits ranges that accept both `0.30.0` and
`0.30.1`. Every catalog archive stays installable unchanged.

Swap panes (#1022) is the first feature of this cycle, so main moved to
`0.31.0-dev.0`. Its bridge admits ranges that accept both `0.30.0` and
`0.31.0`, and every catalog archive stays installable unchanged.

## Post-0.31.0 development baseline

Stable 0.31.0 uses the frozen cut `dda89897`; the next development baseline is
`0.31.1-dev.0`. Its bridge admits ranges that accept both `0.31.0` and
`0.31.1`. Every catalog archive stays installable unchanged.

The agent API's `press` command (#1048) is the first feature of this cycle,
so main moved to `0.32.0-dev.0`. Its bridge admits ranges that accept both
`0.31.0` and `0.32.0`, and every catalog archive stays installable unchanged.

`list` returning the window's tabs and panes (#1049) is the next change in this
family: `0.32.0-dev.1`.

Tab and pane shortcuts for `press` and the agent mark's error tone (#1050)
follow: `0.32.0-dev.2`.

`keys`, which lists the shortcuts an agent can press (#1051), follows: `0.32.0-dev.3`.

The remaining shortcut actions for agents (#1052) follow: `0.32.0-dev.4`.

## Public contract

The versioned public contract covers the user-facing behavior documented in [`spec.md`](spec.md):

- Terminal, tab, and window behavior
- Configuration, theme, and snippet schemas
- Security and privacy boundaries
- Supported platforms and installer formats

Internal module boundaries are not a public API. Configuration (`config.json`), theme (`themes/*.json`), and snippet (`snippets.yaml`) schema versions (`"version": 1`) are versioned independently of the application release number.

## Versioning during `0.y.z`

While the major version is `0`:

- **PATCH (`0.y.Z`):** bug fixes, security fixes, documentation updates, dependency maintenance, and internal refactoring.
- **MINOR (`0.Y.0`):** new user-facing features or intentional contract changes. Any breaking changes or manual configuration updates are highlighted in the release notes.
- **`1.0.0`:** marks a stable public contract. Thereafter, breaking changes bump `MAJOR`, backward-compatible features bump `MINOR`, and bug fixes bump `PATCH`.

## Development-version ownership and release authority

The upstream integration maintainer and the assigned integrating agent share
development-version maintenance and release decisions for this repository.
Development-version bumps happen as part of integrating into `luizomf/omxterm`,
without needing separate approval.

The same authority decides when accumulated, verified user-facing change justifies a
release, and carries out the cut, tag and publication. Publication follows
[release.md](release.md); recorded gaps are assessed there for their relevance to the
application cut, as described in
[ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse).

Contribution PRs, forks and unassigned parties never publish, tag or choose the
application version. Contribution PRs and forks leave application-version metadata
unchanged unless the maintainer explicitly assigns versioning work. The integrator
selects the version against current upstream `main`, updates `package.json` and both
root version fields in `package-lock.json` together, and records the resulting version
with the delivered changes in the integration commit or PR. A coordinated batch
receives one bump, not one per contributor commit; concurrent integrations must
reconcile against the version that landed first.

## Development baseline between releases

`MAJOR.MINOR.PATCH` identifies the intended release; `-dev.N` distinguishes application-changing integrations before publication.

- After selecting and shipping a cut `X.Y.Z`, `main` advances once to `X.Y.(Z+1)-dev.0`, after reviewing compatibility for that family. A later target from the same cut does not advance it again.
- The first new user-facing feature or intentional `0.x` contract change in that release cycle advances the target to `X.(Y+1).0-dev.0`, relative to the latest selected application cut. Further features in the same cycle do not repeatedly advance the minor number.
- When the target version stays the same, each integration that changes the application or its packages increments `N` once. This includes fixes, features, runtime dependencies, bundled assets, and packaging changes. A new target version starts at `dev.0` instead of also incrementing `N`.
- Test-only, documentation-only, and CI-only changes that do not change the application or its packages leave the development version unchanged. Local builds and package commands do not increment it automatically.
- At cut time, remove the `-dev.N` suffix so `package.json`, `package-lock.json`, `TERM_PROGRAM_VERSION`, `linux_install.sh --version`, and installer filenames match `X.Y.Z`. Target tags contain that same version after their OS/architecture prefix.

One application version identifies one reviewed frozen cut across targets. Later unchanged targets can ship that cut without a version bump or rebuilding already shipped targets. Code, dependency or build-input corrections after a target ships require a new application version and cut; retain the original actual build SHA and proven non-artifact differences as described in [release.md](release.md#reusing-test-and-build-results).

For example, after `0.22.0`:

| Integration                       | Development version        |
| --------------------------------- | -------------------------- |
| Post-release baseline             | `0.22.1-dev.0`             |
| First new feature                 | `0.23.0-dev.0`             |
| Application fix                   | `0.23.0-dev.1`             |
| Another feature in the same cycle | `0.23.0-dev.2`             |
| Tests or documentation only       | `0.23.0-dev.2` (unchanged) |

A development version identifies an integrated application revision, not every local build or uncommitted edit. Keep exact source and artifact identities when diagnosing a package; version numbers do not replace the evidence in [release.md](release.md). A version-only adjustment needs the focused consistency check, not the full behavioral suite; rebuilding and verifying packages is required only when producing new artifacts.
