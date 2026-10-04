# One live session per window: superseded by tabs

[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md) owns the current
model: independent windows contain one or more tabs, with one session per tab.

The earlier one-session-per-window restriction kept the initial release small
and expected tmux to cover multiplexing. Dogfooding showed that tmux did not
replace native tabs. The single lifetime-owner principle survives, now at the
tab boundary. The old prohibition of tabs and other future capabilities is not
current guidance; Git retains the original decision.
