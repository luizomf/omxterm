# Split panes and tab groups

## Split panes (implemented)

Decision: [ADR 0035](../adr/0035-split-tabs-into-independent-terminal-panes.md).
Each pane is its own Restty Surface with its own session. A tab holds an
n-ary layout tree (`pane-layout.ts`) of rows and columns with weights.

- **Limits:** at most 16 panes per tab (`MAX_PANES_PER_TAB`).
- **Visibility:** hidden panes (another tab, or maximized siblings) are set
  `hidden` and never draw.
- **New panes:** a new pane inherits the focused pane's working directory.
  The source is OSC 7, or `/proc/<pid>/cwd` on Linux. Main checks that the
  directory still exists.
- **Selection:**
  - The selection sent to main includes `tabSessionIds` only for split tabs.
  - It is reported only after the Surface mount returns (R7).
  - Busy-session checks cover the whole tab.
- **Commands:** split right or down, close pane, focus next, previous or by
  direction, toggle maximize, equalize, toggle broadcast. All are remappable
  keybinds and menu items under **Terminal**.
- **Close Pane:** asks for confirmation when that pane's session is busy
  (`prepare-close-pane`).
- **Dividers:** draggable, and keyboard-resizable with arrow keys
  (`role="separator"`).
- **Broadcast:**
  - Mirrors only keyboard input from the focused pane to its siblings.
  - Needs a native confirmation and shows an indicator.
  - Stops when the tab drops to one pane.
  - Commands injected by OMXTerm (snippets, the Command Manager) are not
    broadcast.

Tests: `pane-layout`, `renderer-terminal-panes`, `terminal-ipc-panes`, the
native tab suites.

## Tab groups (planned)

AshyTerm groups tabs by name and color. The planned OMXTerm design:

- the group is a tab property in the renderer (`groupId`, name, color);
- a tab context menu offers rename, color, move to group, and duplicate;
- groups drag together in the strip;
- workspace restore will persist group membership.

None of this is implemented yet; see `G` rows in
[01-feature-parity.md](01-feature-parity.md).
