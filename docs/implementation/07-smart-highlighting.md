# Smart output highlighting: design

## What AshyTerm does

AshyTerm gives each terminal its own PTY through `HighlightedTerminalProxy`.
Python reads the master in 4 KiB chunks and calls `term.feed()` with rewritten
bytes, adding 16-color SGR sequences so colors follow the palette.

**What passes through unchanged:**

- the alternate screen (`?1049`, `?47`, `?1047`);
- bracketed paste and readline redraws;
- bursts (more than 15 chunks of at least 1 KiB, or any chunk over 1 MiB);
- inactive tabs;
- lines that already carry color;
- output where a regular expression took longer than 50 ms.

**Buffering and rule selection:**

- Partial escape sequences, partial UTF-8 and the trailing partial line are
  held back until the rest arrives.
- On Enter, the command is read from the screen line and matched against each
  rule set's triggers.
- 51 JSON files (486 rules) ship in `data/highlights/`. A file has
  `{name, triggers[], rules[], enabled, use_global_rules}`; a rule has
  `{name, pattern, colors[] per capture group, action next|stop}`.
- Highlighting is off for new installs (`enabled_for_local` and
  `enabled_for_ssh` are both false).

## OMXTerm design

OMXTerm keeps the Ghostty core as the only VT parser. Highlighting is a pure
transform at the Surface's output boundary, applied before
`ptyCallbacks.onData`. It only inserts SGR sequences around text inside
completed lines and never rewrites or drops existing bytes.

- **Tokenizer.** A small VT-aware state machine splits output into plain text
  and control sequences (CSI, OSC, DCS, APC including Kitty images, SOS/PM, and
  single escapes). Control sequences pass through byte for byte; only plain
  text runs are candidates.
- **Bypass states.** The transform is disabled while:
  - the alternate screen is active (tracked from `?1049h/l`, `?1047`, `?47`);
  - a line already contains SGR color or carries cursor movement;
  - the data is inside a DCS, APC or OSC sequence;
  - output exceeds the rate budget (burst detection, as in AshyTerm).
- **Line completion.** Only text followed by a newline is colored. A trailing
  partial line passes through unchanged, because prompts and readline redraws
  live there. OMXTerm never holds bytes back, so latency is unchanged.
- **Regular expressions** come from the ported JSON rule sets. They are
  compiled once, rejected when patterns risk catastrophic backtracking, and
  bounded per line by length.
- **Context.** Command-aware rule sets are selected from the command line the
  user submitted. The Surface reports the line typed before Enter; nothing is
  read from screen contents and nothing is logged.
- **Default.** Off, as in AshyTerm. It is enabled per user setting, with
  per-session overrides.

Deterministic tests feed recorded VT streams (vim, htop, tmux, Kitty images,
bracketed paste, Unicode wide and combining characters) and assert byte
identity in bypass states and correct SGR insertion otherwise.
