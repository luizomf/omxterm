# Security policy

## Report a vulnerability privately

Send suspected vulnerabilities to the email address on the
[maintainer's GitHub profile](https://github.com/luizomf), rather than opening a
public issue or PR. Reports affecting current `main` or the latest published
release are considered; older releases may not receive fixes.

Include the affected version or commit, a minimal safe reproduction, the
security impact, and a possible mitigation if known. Use synthetic data: keep
real terminal or clipboard contents, session transcripts, command history,
configuration or environment contents, credentials, and private paths or
hostnames out of the report.

Responses are best effort, without a guaranteed acknowledgment or fix timeline.
Please coordinate public disclosure with the maintainer.

## Destructive native tests

Windows installer verification can replace an existing installation, even with
a temporary destination. It requires an authorized disposable VM, a recovery
snapshot, and the explicit CLI opt-in in the
[Windows release procedure](docs/release.md#windows-arm64).
[Native fixture interruption tests](docs/development.md#interruption-regressions)
also require an authorized disposable VM and recovery snapshot.
