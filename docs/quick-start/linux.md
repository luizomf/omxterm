# Linux quick start

[Install OMXTerm](../installation.md#linux) and open it. Your account shell,
bundled font, and colors are ready to use. This short walkthrough makes one
setting change and tries a saved command.

## 1. Open your settings folder

On first launch, OMXTerm creates `config.json`, `snippets.json`, and an editable
theme. Run this in Bash to print their folder:

```bash
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir"
```

Open that path in your file manager; **Ctrl+L** accepts a path in many file
managers. The default is `~/.config/omxterm`; a non-empty `XDG_CONFIG_HOME`
selects another root. Back up files before editing them with a plain-text editor.

If you already had a configuration before installing, OMXTerm keeps it. For
missing files, use the [minimal examples](../configuration.md#quick-start-use-the-bundled-defaults).

## 2. Make the text comfortable

Open `config.json`, find `font.size`, and change `16` to `18`. Save, then press
and release **Alt alone** to open the application menu. Choose **View → Reload
User Configuration** (`Ctrl+Shift+,`). The text gets larger; change it back to
`16` to undo it. If a notice reports an error, fix the named field and reload.

For temporary font zoom, use `Ctrl++` / `Ctrl+-`; `Ctrl+0` returns to your
configured size. See [fonts and spacing](../configuration.md#add-one-display-change)
for line height, padding, and installed fonts.

## 3. Try a snippet

Open **View → Toggle Snippets** (`Ctrl+Shift+S`) and click the starter greeting.
Review the inserted command, then press Enter. Snippets are saved text you can
insert into the current tab.

Edit `snippets.json` to add your own commands, then close and reopen the sidebar.
Start with the [single-line snippet example](../configuration.md#snippets).
Its `execute: false` leaves the final Enter to you.

## 4. Make it yours

- **Colors:** edit a `#RRGGBB` value in `themes/omtheme.json` and reload, or use
  [OMXTerm Studio](../configuration.md#edit-visually-with-omxterm-studio).
- **Background:** try [transparency and blur](../configuration.md#background-transparency-and-blur).
  For GNOME, KDE Plasma, or Hyprland setup, see [Linux desktop tips](linux-desktop.md).
- **Window bars:** `Ctrl+Shift+D` toggles the title bar; `Ctrl+Shift+B` toggles
  the tab bar. [Set defaults for new windows](../configuration.md#start-with-hidden-bars).
- **Small interface or VM graphics trouble:** see [HiDPI scaling](linux-desktop.md#small-interface-text-on-a-hidpi-display)
  or [Try Omarchy troubleshooting](linux-desktop.md#try-omarchy-vm-graphics-troubleshooting).
- **Next steps:** [everyday use](../usage.md), [shortcuts](../configuration.md#keybinds),
  and [when settings take effect](../configuration.md#reloading-user-configuration).

## Optional complete examples

<details>
<summary>Use a full configuration, editable theme, and seven Bash snippets</summary>

These files work with **OMXTerm 0.17.0 or newer** and use bundled fonts and all
built-in shortcuts. The snippets assume Bash; the configuration keeps your
account shell:

- [config.json](files/linux/config.json)
- [snippets.json](files/linux/snippets.json)
- [themes/omtheme.json](files/linux/themes/omtheme.json)

Download each linked file using GitHub's **Download raw file** button. To get
all examples together, choose **Code → Download ZIP** on the repository's
**main** branch, extract it, and open `docs/quick-start/files/linux/`.

Back up the destination files, then copy `config.json` and `snippets.json` into
your settings folder and `omtheme.json` into its `themes` subfolder. Replacing
these files replaces your current preferences; merge individual settings to
keep other choices. Reload configuration and reopen the snippets sidebar.

Try **Open current folder**: it inserts ` xdg-open .`; press Enter to open your
file manager. All seven snippets are single-line and have `execute: false`.
They use `xdg-open`, `ip`, `nslookup`, `git`, and GNU `base64 -w0`. Install a
missing tool through your distribution or edit the snippet. The palette example
uses Bash syntax.

### Copy from an extracted ZIP in the terminal

Set `example` to your extracted folder. This Bash block backs up existing files
and stops at symlink destinations so it does not overwrite their targets.

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

Keep the printed backup path. If copying stops, inspect what was copied before
retrying. Restore originals to undo, for example
`cp -p "$backup/config.json" "$config_dir/config.json"`; remove only newly
added files without originals, not the whole settings folder.

</details>

<details>
<summary>Optional Bash and Vim preferences</summary>

The example [bashrc](files/linux/bashrc), [inputrc](files/linux/inputrc), and
[vimrc](files/linux/vimrc) customize the shell/editor separately from OMXTerm.
Download them as above and copy individual settings into your existing dotfiles
(hidden preference files such as `.bashrc`).

These examples enable vi-style editing (`Esc` or `jj` leaves insert mode), quiet
bells, and history that skips leading-space commands. Vim uses `slate` colors,
two-space indentation, and `Space w` to save. When started without file arguments,
it saves/loads per-directory sessions under `~/.vim/sessions/`. Those contain
executable Vim commands and paths; load only trusted sessions. Clipboard support
depends on your Vim build; `unnamed` uses the primary selection on X11.

### Replace selected dotfiles with backups

This replaces existing prompts, aliases, and plugins in the selected files.
Set `example` to the extracted Linux example folder first, as in the block
above. If you use `INPUTRC`, adapt its destination.

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

Start a new shell or Vim to apply changes. To restore, use, for example,
`cp -p "$dot_backup/.bashrc" "$HOME/.bashrc"`. Keep the earliest backup if you
repeat the copy; remove only newly added files without originals.

</details>
