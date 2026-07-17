# Use standard xterm terminal capabilities

OMXTerm will launch every Live Terminal Session with
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and
`TERM_PROGRAM_VERSION` set to the installed application version. These values
are owned by OMXTerm and override inherited values that would misdescribe the
new PTY; the rest of the user environment is inherited without becoming log
content.

The first version will not define `xterm-omxterm`, install a custom terminfo
entry, or add automatic terminfo propagation over SSH. A branded capability
identity would couple normal shell, tmux, SSH, and full-screen application
behavior to installation state outside the application. OMXTerm prefers the
widely available `xterm-256color` contract until a demonstrated capability gap
justifies that operational cost.
