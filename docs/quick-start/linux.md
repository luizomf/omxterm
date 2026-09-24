# Linux: set up fonts, colors, and snippets

[Install OMXTerm](../../README.md#linux) first. This optional tutorial gives you
an editable theme and seven example snippets while keeping the bundled fonts
and default shortcuts. The snippets assume Bash; your account shell is unchanged.

## 1. Get the examples

In the repository on GitHub, select **main**, then choose **Code → Download ZIP**
and extract it. Sign in if GitHub asks. Open `docs/quick-start/files/linux/` in
the extracted folder. These examples are for OMXTerm 0.14.0 or newer.

You need three files:

- [config.json](files/linux/config.json) — settings and shortcuts;
- [snippets.json](files/linux/snippets.json) — example commands;
- [themes/omtheme.json](files/linux/themes/omtheme.json) — editable colors.

## 2. Copy the files

In Bash, create your configuration folder:

```bash
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir/themes"
printf '%s\n' "$config_dir"
```

Open the printed path in your file manager (`Ctrl+L` accepts a path in many
file managers). Copy the two JSON files into it and `omtheme.json` into its
`themes` subfolder. **Back up any existing destination files before replacing
them.** If you already have a configuration you like, merge only the settings
you want instead of replacing it.

Your files should look like this (a non-empty `XDG_CONFIG_HOME` replaces `~/.config`):

```text
~/.config/omxterm/
├── config.json
├── snippets.json
└── themes/
    └── omtheme.json
```

<details>
<summary>Prefer copying in the terminal? Use this backup-aware block.</summary>

Set `example` to the extracted example folder. Run in Bash. It backs up existing
files and refuses symlink destinations rather than overwriting them.

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

Keep the printed backup path. If copying fails, check the copied files before
retrying. To undo, restore each original to its matching path, for example
`cp -p "$backup/config.json" "$config_dir/config.json"`. Remove only files newly
added by this tutorial, not the whole configuration folder.

</details>

## 3. Reload and try it

1. Choose **View → Reload User Configuration** (`Ctrl+Shift+,`). If an error
   appears, correct the named file or field and reload.
2. Open **View → Toggle Snippets** (`Ctrl+Shift+S`).
3. Click **Open current folder**, review the inserted ` xdg-open .`, and press
   Enter. Your desktop file manager should open the shell's current folder.

All seven example snippets have `execute: false`: OMXTerm does not append Enter.
The commands use `xdg-open`, `ip`, `nslookup`, `git`, and GNU `base64 -w0`.
If a tool is missing, install it through your distribution or edit that snippet.
The palette snippet uses Bash syntax.

To see a visible setting change, edit `font.size` in `config.json` from `16` to
`18` and reload. To customize colors, edit a `#RRGGBB` value in
`themes/omtheme.json` and reload. Restoring `16` or your backed-up files reverses
the change. More options: [Configuration](../configuration.md).

## Optional Bash and Vim preferences

OMXTerm does not require dotfiles. The examples [bashrc](files/linux/bashrc),
[inputrc](files/linux/inputrc), and [vimrc](files/linux/vimrc) are separate
shell/editor preferences. Prefer copying individual settings into your existing files.

They enable vi-style command-line editing (`Esc` or `jj` leaves insert mode),
quiet bells, and history that skips leading-space commands. Vim uses the `slate`
colors, two-space indentation, and `Space w` to save. When started without file
arguments, it saves/loads a session per directory under `~/.vim/sessions/`.
Those session files contain executable Vim commands and paths; do not load
untrusted sessions. Clipboard support depends on your Vim build; `unnamed` uses
the primary selection on X11 rather than the clipboard selection.

<details>
<summary>Replace selected dotfiles with backups (optional)</summary>

This replaces the chosen files, including their existing prompt, aliases, and
plugins. Set `example` as above and edit the file list to choose what to copy.
If you use `INPUTRC`, adapt its destination.

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

Start a new shell or Vim to apply its settings. To restore an original, use,
for example, `cp -p "$dot_backup/.bashrc" "$HOME/.bashrc"`. Keep the earliest
backup if you repeat this step; remove only newly added files without originals.

</details>
