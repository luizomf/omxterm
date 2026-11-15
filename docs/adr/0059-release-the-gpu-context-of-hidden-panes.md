# Release the GPU context of hidden panes

Status: accepted. Amends
[ADR 0025](0025-use-restty-as-the-terminal-surface.md) for
[#1202](https://github.com/luizomf/omxterm/issues/1202).

## Context

Every pane's Terminal Surface draws through its own WebGL2 context. Chromium
keeps at most 16 live WebGL contexts per renderer process, and each window is
one renderer. Creating a 17th logs "Too many active WebGL contexts. Oldest
context will be lost." and loses the oldest one, so the 17th pane in a window
(tabs and splits alike) closed the session of the first one with "The
terminal's renderer stopped". Every pane after that closed one more.

Raising the cap (`--max-active-webgl-contexts`) only moves the cliff and keeps
a drawing buffer per pane in GPU memory. Dropping a canvas doesn't free its slot
until garbage collection; `WEBGL_lose_context.loseContext()` frees it at once.
A context can't be recreated on the same canvas without an asynchronous
restore, which would show a blank frame.

## Decision

**Hidden panes give their context back.** A prepared-runtime correction adds
`render.release()` and `render.restore()`. Release stops the render loop, swaps
in a fresh canvas and frees the context through `WEBGL_lose_context`. Restore
builds a new context on that canvas and restarts the loop. Only rendering is
dropped: the Ghostty core keeps cells, scrollback, modes and grid, and the
session never notices. `destroy()` frees its context the same way.

**A budget per window decides when.** Up to 12 contexts stay live. When a
Surface is about to create or restore one past that, the hidden Surfaces shown
least recently release first. Shown Surfaces never do, and a tab holds at most
16 panes, so the visible ones always fit. The slack above 12 covers Surfaces
still starting, which can't release yet. Recently used tabs keep their context,
so switching among them costs nothing new.

**Showing a released pane is synchronous.** The selection refit (or the
ResizeObserver that sees the layout box come back) restores the context,
refits and draws in the same task, before the frame is presented.

**Loss stays fatal.** A context lost without the Surface asking is still a
rendering failure. Listeners follow the live canvas, so a deliberate release
is never reported as one.

## Tradeoffs

- **Showing a long-unused tab rebuilds its GPU state.** Shaders compile again
  and glyphs rasterize again for what is on screen; the core is not touched.
- **The canvas element changes.** Restty's pane focus target follows the canvas
  in the pane (a second, checksum-guarded correction), and the Surface moves its
  link and loss listeners to the new canvas.
- **One budget per window, not per app.** Each window is its own renderer
  process, which is what Chromium counts.
