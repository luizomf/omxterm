# macOS privacy permissions across development builds

Investigation and proposal for [#286](https://github.com/luizomf/omxterm/issues/286).
The observations below are historical experiments, not current-build
qualification, an adopted signing policy or a promise of permission retention.
There is no supported private-certificate build mode in the current packaging
configuration. Packaging remains ad-hoc, without Developer ID signing or
notarization, under [ADR 0015](adr/0015-publish-tested-unsigned-arm64-releases.md).

## Finding and recommendation

Ad-hoc identity churn reproduces the reported Desktop permission problem:
replacing one build with another at `/Applications/OMXTerm.app` caused a new
permission prompt. Signing both builds with the same experimental local
certificate retained the tested Desktop, Full Disk Access, Accessibility and
Finder Automation access across replacement and subsequent guest reboot.

The smallest supported proposal is an **explicitly opt-in private development
signing identity**, separate from release packaging, if the maintainer chooses
to adopt it. Do not change the default release identity, introduce permission
resets on startup, or purchase Developer ID solely on the assumption that it
preserves every privacy service. Adoption needs a separate accepted decision,
key-lifecycle plan, implementation, and corresponding spec/ADR updates.

For today's ad-hoc builds, expect some privacy approvals to need renewal after
replacement. Quit OMXTerm before replacing it, keep one intended installation
at a stable path, and use macOS Privacy & Security to approve only the access
needed by the user's terminal workflow. Neither Full Disk Access nor the other
permissions is a prerequisite for ordinary terminal use. `sudo` is not a
substitute for native privacy consent. Removing/re-adding an app or resetting a
decision may recover an individual workflow but does not stabilize identity.

## Experimental design

The decisive confirmation used a disposable macOS 27.0 ARM64 guest, build
26A428, with an interactive desktop. This is one OS build, not a compatibility
claim for other macOS releases or all privacy services.

- Build A came from source `17fa153`; build B came from
  `ee3d737f9a717876c3642889ef36c026c4b1258d`. Both used the same bundle ID,
  `com.otaviomiranda.omxterm`, and development version.
- Both retained local-signed app archives were hash-checked, extracted, and
  validated with `codesign --verify --deep --strict` in the replacement guest.
  No experimental signing key or certificate was installed there.
- All runs launched the exact `/Applications/OMXTerm.app` through LaunchServices
  with the supported `-e` contract. External probes ran through the real PTY;
  no probe was embedded in the app or its renderer. File/Automation probes
  recorded `TERM_PROGRAM=OMXTerm` and a terminal stdin.
- Each app exited before replacement. Other experimental bundles remained in a
  scratch staging directory; none was intentionally launched or concurrently
  running. Native consent prompts identified OMXTerm.
- Native approvals were explicit. The guest's pre-existing SSH Full Disk Access
  did not make the OMXTerm file probe universally authorized: the protected
  directory operation failed before the OMXTerm grant and succeeded afterward.
- No TCC database was read or modified. No SIP bypass, host trust change,
  private-key transfer, enrollment, purchase, or publication was performed.

An earlier guest produced matching Desktop observations but later suffered
unresolved VM failures. The results below are from the replacement guest, not
inferred from the earlier guest or its snapshots.

### Identity controls

The retained local A and B shared the default requirement:

```text
identifier "com.otaviomiranda.omxterm" and certificate leaf = H"d38ff5841a43845ee529d6b2d33f36979fc1f74d"
```

It pins the exact certificate as well as the bundle identifier; no permissive
custom requirement was introduced. Earlier mutual requirement checks passed
for both local artifacts, while the original ad-hoc pair failed each other's
requirements.

For the healthy-guest comparison, separate copies of these same artifacts were
resealed ad-hoc, preserving identifiers, entitlement payloads and non-ad-hoc
flags across 18 checked Mach-O/root entries. Both passed deep/strict
verification. They were **resealed controls**, not independent new builds or
Release Artifacts. Their root requirements differed:

```text
A: cdhash H"2352835b192a06a615d5c31b440cc1df839c6029"
B: cdhash H"dc81c7775275009992dd2affde75b11b768d1a29"
```

The initial local-signing experiment used nested-first Electron signing and
compared 727 signing targets before/after for identifiers, entitlements and
non-ad-hoc flags. That target count is distinct from the later Mach-O/root
control count; neither count is an assertion about total runtime coverage.

## Observed results and limits

| Permission                 | Exact operation                                                                 | Observed result                                                                                                                                                                                                      | Limit                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files and Folders: Desktop | Read one synthetic marker on Desktop                                            | Ad-hoc A succeeded after approval and on an unattended same-A relaunch. B requested permission again; deliberately denying it produced exit 1. Local A→B and local-B post-reboot succeeded without another approval. | Desktop only, not Documents, Downloads, network or removable volumes. The signed Desktop experiment preceded the OMXTerm FDA grant.                                  |
| Full Disk Access           | Open the existing Mail directory read-only, without listing it or reading mail  | Local B failed with EPERM before grant, succeeded after grant, retained success through B→A→B and reboot.                                                                                                            | One protected directory operation, not every FDA-protected resource.                                                                                                 |
| Accessibility              | Query Finder's application role through AX                                      | Initial trust query was false. After approval, trust survived B→A. A refined functional probe succeeded on A, after A→B, and after reboot.                                                                           | The original focused-application query returned `-25204` even when trusted and is not counted as a functional pass. The refined probe does not exercise UI mutation. |
| Automation                 | Ask Finder to count its windows, without retaining the count or any window data | Explicit OMXTerm→Finder native prompt on A, successful completion after approval, success after A→B and reboot without another approval.                                                                             | One target/event path. Reading Finder's version succeeded without a permission entry and was rejected as a non-discriminating oracle.                                |
| Media & Apple Music        | Not exercised                                                                   | Unverified                                                                                                                                                                                                           | The existing bundle has no `NSAppleMusicUsageDescription`; no library data was accessed and no purpose string was added for this investigation.                      |
| Developer Tools            | No discriminating before/after oracle established                               | Unverified                                                                                                                                                                                                           | Successful execution of our local probes is not evidence for retention of this permission. Debugger access is not substituted for this test.                         |
| App Management             | No protected sacrificial target established                                     | Unverified                                                                                                                                                                                                           | No installed third-party or system app was modified to manufacture a result.                                                                                         |

As an additional negative control, replacing the approved local identity with
ad-hoc B made the protected-directory operation fail with EPERM and the refined
AX probe return untrusted / `-25211`. This supports identity-sensitive behavior
for these paths, but is **not** an ad-hoc A→B FDA or Accessibility retention
comparison: ad-hoc A never received those two grants.

A settings toggle alone is not functional evidence. A pass is limited to the
operation, responsible app, target, OS and lifecycle actually exercised. Code
identity, path, duplicate installations, attribution through child processes,
and the service's own policy can all matter; this experiment does not isolate
every possible cause of the original reports.

## Private certificate versus Developer ID

| Concern                 | Persistent private local identity                                                 | Developer ID distribution identity                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Evidence here           | Runtime replacement/reboot results above                                          | Documentary comparison only; no Developer ID artifact was tested                                                    |
| Identity continuity     | Same identifier and exact certificate-pinned requirement matched these two builds | A separate Apple-issued distribution identity; its actual requirements and privacy behavior still need verification |
| Gatekeeper/notarization | Does not establish Apple publisher trust or notarization                          | Distribution signing and notarization are separate concerns, not interchangeable with privacy approval              |
| Consent                 | Initial grants remained necessary                                                 | Must not be presented as granting privacy access or preserving every service                                        |
| Project status          | Proposal only, not a supported build mode                                         | Still deferred by release policy; requires owner authorization                                                      |

Apple's [TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)
and [Code Signing Requirement Language](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html)
explain designated requirements and certificate constraints. A shared bundle ID
alone is not equivalent to a matching code requirement.

### Key lifecycle and multiple Macs

The pilot used a 30-day self-signed certificate and an isolated guest keychain.
Creating a usable signing identity required explicit guest-only code-signing
trust and signing-tool key access. The private key was imported non-extractable;
its temporary PEM was removed. Only signed app archives and non-secret evidence
left that guest. Successful recipient checks did not require installing or
trusting the experimental certificate there.

That pilot is not a durable production identity. Any adopted workflow must:

- keep the private key out of Git, artifacts, logs, synchronization and automatic
  transfers; define storage, authorized access, loss and compromise handling;
- avoid regenerating an identity for every build; certificate renewal or
  replacement changes this exact certificate pin, so approval continuity must
  be retested rather than promised;
- define expiration/renewal handling before depending on it; no expiry, renewal,
  revocation or key-loss experiment was completed;
- choose a deliberate multi-Mac model. One signing Mac distributing only signed
  artifacts avoids key copying. Independent per-Mac identities do not share this
  pin. A shared-key scheme would need a separately authorized secure provisioning
  design, not automatic key export;
- preserve nested Electron bundle signatures, executable identifiers,
  entitlements, runtime flags and the existing renderer/preload boundaries;
- verify deep/strict integrity and requirement continuity on every exact output;
  never retain a permissive requirement merely to make approvals carry over.

Do not replace release packaging's explicit `mac.identity: "-"` or relax its
unexpected-signing-authority checks as part of this proposal. A development-only
path would need separate verification so its certificate-bearing output cannot
be mistaken for the current ad-hoc release contract.

## Remaining evidence boundaries

Music, Developer Tools and App Management remain unverified rather than being
folded into the four observed results. Apple's
[`NSAppleMusicUsageDescription` documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapplemusicusagedescription)
requires a purpose string for media-library access, including macOS apps linked
against the macOS 15 SDK or later. This investigation does not add that string,
change linkage, or assume that a child executable supplies a safe workaround
for the unchanged terminal bundle.

In particular, Apple's
[WWDC22 privacy session](https://developer.apple.com/videos/play/wwdc2022/10096/)
describes App Management consent for modification outside an app's permitted
updater policy. Same-team signing and `NSUpdateSecurityPolicy` exceptions can
allow updates without that consent, so merely writing inside an arbitrary
`.app` directory would not be a valid negative/positive control.

The investigation establishes a bounded mitigation proposal, not adoption or a
universal fix. A future adopted workflow must keep these limitations visible
and validate any additional privacy-dependent workflow it claims to support.
No spec or ADR behavior changes are made by this report.
