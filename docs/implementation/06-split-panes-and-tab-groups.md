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

## Tab groups and the tab menu (implemented)

Right-click a tab, or press the context menu key or `Shift+F10` on it
(`terminal-tab-menu.ts`). The menu offers:

- **Rename Tab…:** a name that replaces the program's title; empty restores
  it.
- **Tab Color…:** AshyTerm's eight-color palette, or no color. A Saved
  Session's color applies until a tab color is chosen.
- **Duplicate Tab:** a new tab right after this one, in its group. It opens
  the focused pane's Saved Session or Quick Connect target, or a shell in the
  same directory (`inherit`).
- **Groups:** New Group from Tab…, Add to “name” for each group in the
  window, Remove from Group.

A group (`tab-groups.ts`) is a name, a palette color and a collapsed flag
shared by adjacent tabs.

- **Chip:** a colored chip leads each group. Clicking it collapses or
  expands the group; its menu renames, recolors, collapses or ungroups.
- **Collapsed:** only the chip and the selected tab stay visible.
- **Adjacency:** after a drag, a tab that is no longer next to the rest of
  its group leaves it (`normalizeGroups`).
- **Restore:** names, colors and groups are part of the workspace snapshot,
  so they come back with a restored workspace.

**Not ported:** AshyTerm's Detach Tab moves a live terminal widget to another
window. OMXTerm sessions belong to their window's IPC controller, so moving
one would mean re-parenting a PTY across windows. Duplicate Tab covers the
common case.

Tests: `renderer-tab-groups`, `workspace-restore`.
