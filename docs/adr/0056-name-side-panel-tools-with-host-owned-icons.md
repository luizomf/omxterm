# Name side-panel tools with host-owned icons

Status: accepted, for
[#1191](https://github.com/luizomf/omxterm/issues/1191).

## Context

The side panel's header printed the open tools' names. With two or three open
they truncated to "Fil…", "Snipp…", "SSH Conn…", so the switcher became icon
buttons whose tooltip and accessible name carry the name. Each tool then needs
an icon, and a tool is an installed package: Files, Snippets and SSH Connect
today, the only views the host docks in the panel.

Two things constrain where the icon can come from. The manifest is strict: a
host rejects a field it does not know, so a new `view.icon` would make every
package that uses it uninstallable on older hosts. And installed packages are
immutable and never update on their own, so an icon carried by the package
would be missing from every archive already installed.

## Decision

**The host owns the icon.** Main maps each official panel tool to an icon from
OMXTerm's one icon set (`folder`, `code`, `server`) and sends its name in the
view's descriptor. The preload accepts only names on that short list, and the
renderer draws the icon itself. The manifest does not change.

**Anything else shows a monogram**: the first letter of the view's title, set
as text. That is the fallback for a panel tool the host has no icon for, not a
contribution point.

**An extension never supplies icon markup.** No SVG, HTML, image or font from
a package reaches the window chrome.

## Tradeoffs

- Archives installed before this change get their icon at once, and no
  official extension needs a new version or a higher host floor.
- A new official panel tool needs a host release to get its icon. It already
  needs one to be docked in the panel at all.
- Two tools without an icon and with the same initial look alike until
  hovered. No such pair can exist today; if packages outside this repository
  ever dock in the panel, an optional manifest field naming an icon from the
  host's set is the next step, under the contribution surface of
  [#669](https://github.com/luizomf/omxterm/issues/669). Markup from a package
  stays out either way.
