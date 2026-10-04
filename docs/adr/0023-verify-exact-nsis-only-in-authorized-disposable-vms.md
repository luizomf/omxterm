# Verify exact NSIS only in authorized disposable VMs

Windows release verification exercises the exact NSIS installation seam:
unpacked startup or archive extraction cannot establish the installed payload,
registration, startup or cleanup behavior.

A temporary `/D=` destination does not isolate NSIS application identity.
The pinned installer can remove a registered old version and change shared
registration and shortcuts. Environment/profile overrides do not isolate these
Windows effects. Treating a destination directory as a sandbox is unsafe.

The verifier therefore defaults to refusing installation and requires a literal
CLI opt-in for an explicitly authorized disposable VM with a recoverable
snapshot. It inspects the reviewed installer identity's HKCU/HKLM registration
in both views, default locations, shortcuts and conflicting processes. Unknown
inspection and live process conflicts remain refusals even with consent.
Intentional replacement supports only known per-user registration; it never
executes an arbitrary registry-supplied command itself. Inspection is necessary
but does not eliminate host races or installer-wide effects, so the disposable
VM requirement also applies to an apparently clean host. The pinned NSIS
installer writes an installer cache independently of `/D=` and despite the lack
of application auto-updates. A pre-existing cache is refused rather than assigned
to this transaction or overwritten. A newly created cached installer is checked
against the exact installer digest and only that unchanged file and its empty
directory are removed; unknown or additional cache state is preserved.

The transaction binds installer bytes to their digest, compares installed
payload bytes, verifies installed startup, and invokes only its owned new
uninstaller after confirming registration ownership. A byte-identical copy runs
outside the install-path termination prefix, with `_?=` selecting the owned root
and preventing a detached relaunch. This avoids NSIS terminating its own
in-place uninstaller through its PowerShell process check. Bounded cleanup must remove
registration, shortcuts and processes before temporary files are removed.
Failures preserve primary and cleanup errors and retain uncertain state for
inspection. User data is never selected for deletion. The old application is
not restored by this test; snapshot recovery is a separate environment action.

Safe unpacked diagnostics remain available and explicitly partial. Full native
Windows verification requires this exact-installer seam. Live-process conflicts
and unknown ownership are refusals, not reasons to bypass inspection. The cost
is a disposable native VM and
re-reviewing the inspection footprint when packaging inputs change. This
is preferable to changing the tested installer identity, hiding registry state,
repacking the artifact, or claiming non-mutating extraction without evidence.
