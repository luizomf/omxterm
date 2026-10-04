# Use standard xterm terminal capabilities

OMXTerm launches every Live Terminal Session with `TERM=xterm-256color`,
`COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and `TERM_PROGRAM_VERSION` set to
the installed application version. These values describe the new PTY and
replace misleading inherited values. The rest of the user's environment is
inherited and remains outside log content.

Restty's parsed output seam answers device attributes, cursor-position reports
(CPR) and cell-size reports once. Current CPR coordinates can disagree with
Ghostty after wide/combining text and pending-wrap resize because OutputFilter
uses a UTF-16 cursor hint before core ingestion (#566). This is a compatibility
defect, not a desired protocol variation; exactly-once replies and advertised
capabilities do not establish complete xterm correctness. See
[ADR 0025](0025-stage-restty-behind-an-unpackaged-opt-in.md#keyboard-input-and-terminal-controls).

The standard xterm capability vocabulary describes protocol compatibility; it
does not refer to OMXTerm's former renderer. OMXTerm therefore uses the widely
available `xterm-256color` contract and does not define `xterm-omxterm`, install
custom terminfo, or propagate terminfo automatically over SSH. A branded entry
would make ordinary shell, tmux, SSH, and full-screen application behavior
depend on installation state outside OMXTerm. That operational cost needs a
demonstrated capability gap before it is justified.
