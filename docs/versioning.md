# Versioning policy

OMXTerm uses [Semantic Versioning 2.0.0](https://semver.org/). Published releases are formatted as `MAJOR.MINOR.PATCH` and tagged `vMAJOR.MINOR.PATCH`.

- `package.json` and `package-lock.json` define the application version.
- Versions ending in `-dev.N` (for example `0.20.3-dev.0`) mark the development baseline on `main` between releases.
- Published releases and binaries are available in [GitHub Releases](https://github.com/luizomf/omxterm/releases). See [release.md](release.md) for the release build and publication checklist.

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

## Development baseline between releases

- After publishing `X.Y.Z`, `main` advances to `X.Y.(Z+1)-dev.0`.
- When a PR introduces a new user-facing feature, the baseline advances to `X.(Y+1).0-dev.0` if it has not already moved to the next minor version in the current cycle.
- Ordinary bug fixes, tests, and documentation changes keep the current `-dev.0` baseline unchanged.
- At release time, the `-dev.0` suffix is removed so `package.json`, `package-lock.json`, `TERM_PROGRAM_VERSION`, `linux_install.sh --version`, the Git tag `vX.Y.Z`, and all installer filenames match `X.Y.Z`.
