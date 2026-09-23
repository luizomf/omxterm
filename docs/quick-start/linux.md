# Linux ARM64 quick start

[Install OMXTerm](../../README.md#linux) first. It needs WebGL2, fontconfig and X11 (or XWayland under Wayland). Linux launches without the Chromium sandbox; see the [installation/security notes](../../README.md#linux). This example does not change the shell selected by your account. The Snippets shown here assume Bash; other shells may need edits.

## Get the files

While signed in to GitHub with access to this currently private repository, choose **Code → Download ZIP** on the desired branch. Extract it and find `docs/quick-start/files/linux/` inside the extracted repository. No Git installation is needed. Do not rely on unauthenticated raw-file URLs. The complete files are [config.json](files/linux/config.json), [snippets.json](files/linux/snippets.json), and [themes/omtheme.json](files/linux/themes/omtheme.json); inspect them before copying. They are examples, not executable installers.

## Back up and apply OMXTerm files

In your Bash shell, change `example` to the **actual extracted directory** (do not type the angle brackets). This backs up each existing regular file into a new directory in your home, refuses a symlink or directory at any destination, and installs the three files together. Keep the backup directory until you're satisfied. If your configuration directory itself is a symlink, stop and resolve its destination manually instead.

```bash
example="/path/to/extracted/omxterm/docs/quick-start/files/linux"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
backup="$(mktemp -d "$HOME/omxterm-quick-start-backup.XXXXXX")"
apply_quick_start() {
  [ -n "$backup" ] && [ -d "$example/themes" ] && [ -f "$example/config.json" ] && [ -f "$example/snippets.json" ] && [ -f "$example/themes/omtheme.json" ] || { echo 'Check backup or example path'; return 1; }
  [ ! -L "$config_dir" ] && { [ ! -e "$config_dir" ] || [ -d "$config_dir" ]; } || { echo 'Configuration directory is not a plain directory'; return 1; }
  mkdir -p "$config_dir/themes" || return 1
  [ ! -L "$config_dir/themes" ] && [ -d "$config_dir/themes" ] || { echo 'Theme directory is not a plain directory'; return 1; }
  for name in config.json snippets.json themes/omtheme.json; do
    target="$config_dir/$name"
    [ ! -L "$target" ] && [ ! -d "$target" ] || { echo "Refusing $target"; return 1; }
    if [ -e "$target" ]; then
      mkdir -p "$backup/$(dirname "$name")" || return 1
      cp -p "$target" "$backup/$name" || return 1
    fi
    cp "$example/$name" "$target" || return 1
  done
  printf 'Backup (including only files that already existed): %s\n' "$backup"
}
apply_quick_start
```

If any command fails, stop; check which files were installed before retrying. To undo, copy each backed-up file from `$backup` to its original matching path under `$config_dir` (for example `cp -p "$backup/config.json" "$config_dir/config.json"`). Delete only newly installed files that had no backup, after checking them. Never delete the whole config directory. `XDG_CONFIG_HOME`, if non-empty, determines the location; do not move files to `~/.config` when your environment selects another root.

The example explicitly sets every supported shortcut, uses bundled fonts (no `font.family`), and selects an editable external copy of the [standard palette](../omtheme.json) at `./themes/omtheme.json`. Its top padding is **0 px**, like the runtime default; the other sides are 8 px. You can edit the theme's colors later. Use **View → Reload User Configuration** (`Ctrl+Shift+,`) after copying; an error notice means you should fix the reported path or JSON and reload again.

Open **View → Toggle Snippets** (`Ctrl+Shift+S`), click “Open current folder,” review the inserted ` xdg-open .`, then press Enter yourself. All seven snippets are JSON with `execute: false`, not automatic commands. The initial space avoids shell history when the optional Bash `HISTCONTROL=ignoreboth` preference is active (shell behavior varies). The examples use `xdg-open` (desktop integration), `ip`, `nslookup` (may need a DNS utilities package), `git` (optional), and `base64 -w0` (GNU coreutils) for OSC 52 clipboard writes. Change any command for your distribution/shell. [Snippet behavior and limits](../configuration.md#snippets) explain Protected Paste and how to reopen the sidebar after edits.

## Optional shell, Readline and Vim preferences

The Vim preset uses the `slate` syntax colors over the Terminal Theme background, two-space indentation without automatic indentation, no mouse capture, trailing-whitespace highlighting, and cursor-position restoration. Space is the leader: `Space w` saves, `Space h` clears search highlighting, and `Tab`/`Shift+Tab` switch buffers. Clipboard integration depends on the installed Vim build and desktop; `clipboard=unnamed` does not add clipboard support to a build that lacks it (and on X11 it selects the primary selection rather than the clipboard selection).

OMXTerm does **not** install or require shell integration or Vim. The files [bashrc](files/linux/bashrc), [inputrc](files/linux/inputrc), and [vimrc](files/linux/vimrc) are personal preferences, not application configuration. Only consider them if you use Bash, Readline, and Vim respectively. Read your existing dotfiles first; replacing them can remove your own aliases, prompt, plugins, and settings. To copy a subset, use this separate command (edit the list to the files you actually want). It creates a fresh dotfile backup each time, so retrying cannot overwrite the earlier originals:

```bash
copy_optional_dotfiles() {
  dot_backup="$(mktemp -d "$HOME/omxterm-dotfiles-backup.XXXXXX")" || return 1
  printf 'Dotfile backup: %s\n' "$dot_backup"
  for name in bashrc inputrc vimrc; do
    target="$HOME/.$name"
    [ -f "$example/$name" ] || { echo "Example missing: $name"; return 1; }
    [ ! -L "$target" ] && { [ ! -e "$target" ] || [ -f "$target" ]; } || { echo "Refusing $target"; return 1; }
    if [ -e "$target" ]; then cp -p "$target" "$dot_backup/.$name" || return 1; fi
    cp "$example/$name" "$target" || return 1
  done
}
copy_optional_dotfiles
```

If you opened another shell, set `example` to the extracted example path before running this block. Keep the printed backup path; use the earliest backup to recover your original preferences after repeated copies. To restore an existing dotfile, `cp -p "$dot_backup/.bashrc" "$HOME/.bashrc"` (substitute its name); remove a newly installed dotfile only if it had no backup and you have checked its contents. A new shell/Vim process reads these preferences; OMXTerm reload does not.

The Bash example enables vi editing (`Esc` or `jj` to leave insert mode), ignores history entries starting with a space, and loads Bash completion only if present. `.inputrc` silences Readline's bell; Vim's `belloff=all` silences Vim separately. The Vim example maps `jj` in insert mode and, when Vim is opened with no file arguments, automatically loads/saves a per-working-directory session under `~/.vim/sessions/`. Session files contain executable Vim commands and may record file paths: keep that directory private and don't source others' sessions. Remove the session block from `vimrc` if you prefer a fresh editor. See the [configuration reference](../configuration.md) for further customization.
