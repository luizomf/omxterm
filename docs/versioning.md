# Versioning policy

OMXTerm uses [Semantic Versioning 2.0.0](https://semver.org/). Published releases are formatted as `MAJOR.MINOR.PATCH` and tagged `vMAJOR.MINOR.PATCH`.

- `package.json` and `package-lock.json` define the application version.
- Versions ending in `-dev.N` (for example `0.20.3-dev.0`) mark the development baseline on `main` between releases.
- Published releases and binaries are available in [GitHub Releases](https://github.com/luizomf/omxterm/releases). See [release.md](release.md) for the release build and publication checklist.

Explicitly selected partial development previews may retain their `-dev.N`
version and publish as **non-Latest prereleases**, following the Files/SSH lanes
in [release.md](release.md). They do not become stable releases or automatically
advance main to the next patch baseline. Preserve exact binary/source identities
and re-evaluate extension compatibility before any version change. The explicit
`0.24.1-dev.N` maintenance bridge and separately assigned `0.25.0-dev.N`
minor-development bridge have distinct endpoint requirements in the
[compatibility contract](extension-installation-foundation.md#archive-contract).
Neither automatically extends to another patch or minor development family;
review compatibility and capabilities deliberately at each transition. The stable
suffix-removal and complete-asset procedure below remains unchanged.

## Post-0.25.0 development baseline

Stable 0.25.0 uses a frozen cut; main already has later features, so its next
target is `0.26.0-dev.0`. Main stays at `0.25.0-dev.22` for now because the
[current compatibility rules](extension-installation-foundation.md#archive-contract)
would reject pinned Snippets and existing catalog offers on `0.26.0-dev.0` (and
`0.25.1-dev.0`). Before changing the three root version fields, add and test a
reviewed next-family compatibility rule. Keep the original archive bytes, engine
ranges, API and capability floors unchanged.

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

## Development-version ownership

The maintainer or agent assigned to integrate into `luizomf/omxterm` owns development-version maintenance as part of that integration, without needing separate permission for the bump. This does not authorize an otherwise unassigned integration, release, tag, or publication.

Contribution PRs and forks leave application-version metadata unchanged unless a maintainer explicitly assigns versioning work. The integrator selects the version against current upstream `main`, updates `package.json` and both root version fields in `package-lock.json` together, and records the resulting version with the delivered changes in the integration commit or PR. A coordinated batch receives one bump, not one per contributor commit; concurrent integrations must reconcile against the version that landed first.

## Development baseline between releases

`MAJOR.MINOR.PATCH` identifies the intended release; `-dev.N` distinguishes application-changing integrations before publication.

- After publishing `X.Y.Z`, `main` advances to `X.Y.(Z+1)-dev.0`.
- The first new user-facing feature or intentional `0.x` contract change in that release cycle advances the target to `X.(Y+1).0-dev.0`, relative to the latest published release. Further features in the same cycle do not repeatedly advance the minor number.
- When the target version stays the same, each integration that changes the application or its packages increments `N` once. This includes fixes, features, runtime dependencies, bundled assets, and packaging changes. A new target version starts at `dev.0` instead of also incrementing `N`.
- Test-only, documentation-only, and CI-only changes that do not change the application or its packages leave the development version unchanged. Local builds and package commands do not increment it automatically.
- At release time, remove the `-dev.N` suffix so `package.json`, `package-lock.json`, `TERM_PROGRAM_VERSION`, `linux_install.sh --version`, the Git tag `vX.Y.Z`, and all installer filenames match `X.Y.Z`.

For example, after `0.22.0`:

| Integration                       | Development version        |
| --------------------------------- | -------------------------- |
| Post-release baseline             | `0.22.1-dev.0`             |
| First new feature                 | `0.23.0-dev.0`             |
| Application fix                   | `0.23.0-dev.1`             |
| Another feature in the same cycle | `0.23.0-dev.2`             |
| Tests or documentation only       | `0.23.0-dev.2` (unchanged) |

A development version identifies an integrated application revision, not every local build or uncommitted edit. Keep exact source and artifact identities when diagnosing a package; version numbers do not replace the evidence in [release.md](release.md). A version-only adjustment needs the focused consistency check, not the full behavioral suite; rebuilding and verifying packages is required only when producing new artifacts.
