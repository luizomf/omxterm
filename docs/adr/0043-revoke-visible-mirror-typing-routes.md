# Revoke visible Mirror Typing routes

## Decision

The optional, separately installed Linux ARM64 [Mirror Typing preview](../mirror-typing.md)
owns setup and deliberate Start; core owns a revocable, visible input route.
This is a narrow exception to single-pane keyboard delivery, not an extension
PTY API, command runner or semantic keyboard translator. The implementation
contract does not itself establish native qualification or release availability.

An action captures the original window, terminal tab and live mounted focused
pane before opening setup. An ended or initializing original focus refuses;
core never substitutes a live sibling. Setup exposes opaque handles, ordinal
labels and sanitized titles, not session authority, cwd or output. Start consumes
a fresh token for an inspected fixed subset of 2–16 live panes, including the
original focus. New splits never join. Member loss stops the entire group.

One setup per extension/window is retained. A new action revokes old authority
and waits for settled retirement before replacing that setup; busy or uncertain
retirement refuses rather than accumulating views/pins. Returning to a retained
page stops mirroring and requires fresh setup authority for another explicit
Start, still bound to the original context. No authority is persisted, restored
by Saved Layout or activated by installation, enable, startup or focus return.

## Input and visible authority

The portable Surface hook observes genuine keyboard payloads after final source
PTY mapping. Core sends identical bytes once to the source and fixed recipients;
target modes do not reencode them. Pointer-origin prompt reports, application
mouse, program/focus/parser replies and graphical field edits stay local.
Extensions never receive keyboard payloads. Existing input is unchanged without
an active route. [ADR0025](0025-use-restty-as-the-terminal-surface.md) owns the
prepared-runtime origin/mapping and semantic-gesture seams.

Paste, snippets and drops synchronously revoke the route before clipboard reads,
confirmation or ordinary original-target delivery, including empty/unsupported
terminal paste. Cancellation leaves mirroring stopped. Protected Paste remains
Surface-owned and single-target; a late local approval cannot arm a group.

Core shows an in-flow status and keyboard-reachable Stop independent of hidden
title/tab chrome or extension responsiveness, plus distinct source/member marks.
Preparing is input-inert and cancellable before the first asynchronous package
admission. Only then may the acknowledged native hide handoff begin; Start
revalidates original focus/context before arming. Leave-and-return navigation
invalidates the attempt rather than merely checking its final selected page. Start/Stop
activation keys, repeats and releases must not leak to terminals. Escape remains
terminal input, not a new global Stop shortcut.

## Lifetime and process boundaries

Main authenticates the core renderer and retains fixed window-owned native
sessions behind an opaque lease. A distinct typed route carries sequence, source
identity and bounded keyboard data; extension IPC cannot supply that payload.
Renderer and main independently fence generations and revoke stale starts/input.
Claimed input rejected after revocation is dropped, never retried locally.
No per-key backend RPC, filesystem validation, queue, history or replay is added.

Stop closes admission before cleanup. Local disable/update/uninstall, backend
lifetime loss, view destruction, renderer/window teardown, member loss, tab or
unselected-pane selection, modal entry and hide/minimize revoke authority.
The backend lifetime signal and native-view admission-loss notifications revoke
input before native settlement, including cleanup failure. They are not proof
that views, processes or pins settled. Ordinary active-window blur
suspends input admission without ending the group; pending Start cancels on blur.
Resize, reorder, theme/language changes and chrome visibility alone retain it.
There is no instantaneous cross-application management revocation promise.

## Tradeoffs

Use matching terminal programs/modes. Identical source-mode bytes may mean
something different in a recipient, including application-cursor and Kitty modes.
This is not shell-state synchronization or equivalent arbitrary SSH/tmux/TUI
behavior. A key may cause each program to read its own clipboard. Stop neither
undoes input nor sends synthetic releases. Native writes are sequential and
best-effort, not an atomic multi-PTY transaction; partial delivery is possible
and never rolled back or retried. Detectable write failure shows a fixed localized
notice warning that only some panes may have received the input.

Semantic per-target encoding and multi-pane Protected Paste would require a
different contract. They are not silently approximated by this typing-only route.
Focused headless contracts, actual prepared-runtime checks and separately owned
native composed evidence must remain distinct; source wiring is not qualification.
