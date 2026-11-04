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

Please coordinate public disclosure with the maintainer.

## Local diagnostics and isolation

OMXTerm makes application network requests only for explicit official-catalog
Browse/Refresh and HTTPS extension archive installation, using bounded acquisition
in the main process. It does not fetch the catalog at startup or Settings reopen,
or make telemetry or background update requests. Owned browser sessions disable
unused spellchecking; on Linux/Windows their selected dictionary list is cleared
at session creation so Chromium does not acquire dictionaries in the background.
This is a product policy, not a network block or a change to literal text input
or explicit extension acquisition. See the
[specification](docs/spec.md#configuration-and-local-state) for the network
boundary and platform qualification. Programs you run retain their usual network
access, and explicitly opened web links use the OS. Operational logs omit
terminal, clipboard, command, configuration, and environment contents.
Developer Tools can expose private runtime state, and user-file notices include
actionable paths. Native font-read errors can also propagate local font paths
through the renderer bridge; that error route is not fully redacted. Review
errors and screenshots before sharing them.

Renderer Node integration is disabled and context isolation is enabled on all
platforms. Chromium sandboxing is enabled on macOS and Windows but deliberately
disabled on Linux; see the [Linux policy](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).
Commands run with your account's permissions.

## Destructive native tests

Windows installer verification can replace an existing installation, even with
a temporary destination. It requires an authorized disposable VM, a recovery
snapshot, and the explicit CLI opt-in in the
[Windows release procedure](docs/release.md#windows-arm64-and-x64).
[Native fixture interruption tests](docs/development.md#interruption-regressions)
also require an authorized disposable VM and an OS-appropriate recovery method.
