# Sign macOS releases with a stable self-signed certificate

Status: accepted.

## Context

macOS ties privacy permissions (Files and Folders, Accessibility, Input
Monitoring, Automation and others) to an app's _designated requirement_ (DR),
the rule its code signature must satisfy. An ad-hoc seal has no certificate, so
its DR is the exact code hash (`cdhash H"…"`). Every build has a new hash, so
after each update macOS treats OMXTerm as a new app. Old grants silently stop
applying and people have to grant them again.

A Developer ID certificate would fix this, but it costs a yearly fee that this
project does not pay ([ADR 0015](0015-publish-tested-unsigned-arm64-releases.md)).

## Decision

Release builds for macOS are signed with one long-lived, self-signed
code-signing certificate, `OMXTerm Release Signing` (SHA-1
`7208E52002B019F6F948788CE6D095C117405ED3`, valid until 2056). The DR becomes:

```text
identifier "com.otaviomiranda.omxterm" and certificate root = H"7208e52002b019f6f948788ce6d095c117405ed3"
```

It stays the same from one release to the next, so macOS keeps granted
permissions across updates.

- `electron-builder.yml` keeps `identity: "-"` and adds a `mac.sign` hook
  ([`scripts/sign-macos.mjs`](../../scripts/sign-macos.mjs)). Without the
  signing keychain, the hook signs ad-hoc exactly as before, so contributors and
  CI need no secrets. With it, the hook unlocks the dedicated keychain itself
  and signs with the pinned fingerprint, without a timestamp server.
  Partial configuration fails the build instead of falling back to ad-hoc.
- The private key lives only in a dedicated keychain file on the release
  machine and in an encrypted `.p12` backup held by the maintainer. Nothing
  secret enters the repository. The fingerprint is public.
- `package:verify` accepts either seal. `package:verify -- --release` requires
  the release DR, and the macOS release procedure uses it.
- The certificate is not Apple-issued and the app is not notarized, so
  Gatekeeper's first-launch review is expected to stay as it is. That hasn't
  been checked yet with a quarantined download.

## Consequences

- The first release signed this way needs one last re-grant, because the old
  ad-hoc grants were bound to old code hashes. After that, grants carry over to
  later updates.
- The DR does not depend on the certificate being trusted, so nobody installs
  the certificate.
- If the key is lost, a new certificate means a new DR. Users re-grant once,
  as they would after a single ad-hoc update. Keep the `.p12` backup.
- Anyone holding the key can sign code that inherits OMXTerm's macOS
  permissions. The key is guarded like a password.
- Local Network permission uses a separate macOS rule store. On macOS 27 the
  rule for OMXTerm has an empty DR, so this decision is not known to change it.
  That store also tells apps apart by their executables' Mach-O UUID, which
  OMXTerm used to share with stock Electron; every build now gets its own
  (`scripts/macos-executable-uuid.mjs`, #959). The tmux note in the
  [installation guide](../installation.md) still applies.

Verified on a macOS 27 VM: a Documents-folder grant made to one signed build
still applied, with no prompt, after replacing it with a build that had
different bytes and the same certificate. Ad-hoc updates asked again.
Accessibility and Input Monitoring use the same DR check; they were not
exercised separately.
