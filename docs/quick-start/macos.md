# macOS quick start

[Install OMXTerm](../installation.md#macos) and open it. Your account shell,
bundled font, and colors are ready to use. This short walkthrough makes one
setting change and tries a saved command. Prefer a coordinated set of files?
Jump to the [complete ready-to-use setup](#complete-ready-to-use-setup-optional)
for configuration, snippets, and an editable theme.

## 1. Open your settings folder

On first launch, OMXTerm creates `config.json`, `snippets.json`, and an editable
theme. Run this in Zsh or Bash to open their folder in Finder:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir" && open "$config_dir"
```

The default is `~/.config/omxterm`; a non-empty `XDG_CONFIG_HOME` selects another
root. Back up files before editing. Use a plain-text editor; in TextEdit, choose
**Format → Make Plain Text**, disable smart quotes, and keep the `.json` extension.

If you already had a configuration before installing, OMXTerm keeps it and
skips the starter kit. Create a missing `config.json` with the
[minimal configuration](../configuration.md#quick-start-use-the-bundled-defaults);
that alone does not create snippets or an editable theme. Steps 3 and 4 cover
those missing files.

## 2. Make the text comfortable

Open `config.json`, find `size` inside the `font` object (`font.size`), and change
`16` to `18`. If `font` or `size` is missing, use the
[complete font example](../configuration.md#add-one-display-change) to add the
missing fields while preserving your other settings. Save, then choose
**View → Reload User Configuration** (`Cmd+Shift+,`) in the macOS menu bar.
The text gets larger; change it back to `16` to undo it. If a notice reports an
error, fix the named field and reload.

For temporary font zoom, use `Cmd++` / `Cmd+-`; `Cmd+0` returns to your configured
size. See [fonts and spacing](../configuration.md#add-one-display-change) for
line height, padding, and installed fonts.

## 3. Try a snippet

Open **View → Toggle Snippets** (`Cmd+Shift+S`) and click the starter greeting.
Review the inserted command, then press Enter. Snippets are saved text you can
insert into the current tab.

Edit `snippets.json` to add your own commands, then close and reopen the sidebar.
If there is no starter greeting, create `snippets.json` with the
[single-line snippet example](../configuration.md#snippets), reopen the sidebar,
and try that snippet instead. Its `execute: false` leaves the final Enter to you.

## 4. Make it yours

- **Colors:** edit a `#RRGGBB` value in `themes/omtheme.json` and reload, or use
  [OMXTerm Studio](../configuration.md#edit-visually-with-omxterm-studio).
  If the theme file is missing, [create and select a complete theme](../configuration.md#terminal-themes).
- **Background:** try [transparency and blur](../configuration.md#background-transparency-and-blur).
  macOS blur has fixed strength; both effects start off.
- **Window bars:** `Cmd+Shift+D` toggles the title bar; `Cmd+Shift+B` toggles
  the tab bar. [Set defaults for new windows](../configuration.md#start-with-hidden-bars).
- **Option keys:** keep `keyboard.optionAsAlt` at `none` for normal Option
  characters, or choose `left`, `right`, or `both` for terminal Alt shortcuts.
- **Next steps:** [everyday use](../usage.md), [shortcuts](../configuration.md#keybinds),
  and [when settings take effect](../configuration.md#reloading-user-configuration).

<a id="optional-complete-examples"></a>

## Complete ready-to-use setup (optional)

These files work with **OMXTerm 0.17.0 or newer** and use bundled fonts and all
built-in shortcuts.

Use these three files together; destinations are inside your
[settings folder](#1-open-your-settings-folder):

| Download                                               | Copy to               |
| ------------------------------------------------------ | --------------------- |
| [config.json](files/macos/config.json)                 | `config.json`         |
| [snippets.json](files/macos/snippets.json)             | `snippets.json`       |
| [themes/omtheme.json](files/macos/themes/omtheme.json) | `themes/omtheme.json` |

Download each linked file using GitHub's **Download raw file** button. To get
all examples together, choose **Code → Download ZIP** on the repository's
**main** branch, extract it, and open `docs/quick-start/files/macos/`.

Back up the destination files, then copy `config.json` and `snippets.json` into
your settings folder and `omtheme.json` into its `themes` subfolder. Replacing
these files replaces your current preferences; merge individual settings to
keep other choices. Reload configuration and reopen the snippets sidebar.

Try **Open current folder**: it inserts ` open .`; press Enter to open Finder.
All seven snippets are single-line and have `execute: false`. They use macOS
tools (`open`, `ifconfig`, `nslookup`, and `pbcopy`); the Git example needs Git
and the palette example uses Zsh/Bash syntax.

### Copy from an extracted ZIP in the terminal

Set `example` to your extracted folder. This Zsh/Bash block backs up existing
files and stops at symlink destinations so it does not overwrite their targets.

```sh
example="/path/to/extracted/omxterm/docs/quick-start/files/macos"
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
retrying. To undo later, even in a fresh Zsh/Bash session, replace the backup path
below with the one you saved. Use the same `XDG_CONFIG_HOME` as OMXTerm (or set
`config_dir` to the original settings folder if that environment has changed).
Check that destinations are still ordinary files, not symlinks, before restoring:

```sh
backup="/path/to/saved/omxterm-quick-start-backup.ABC123"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
cp -p "$backup/config.json" "$config_dir/config.json"
```

Repeat for `snippets.json` and `themes/omtheme.json` if they have backups. Remove
only newly added files without originals, not the whole settings folder. Reload
configuration and reopen the snippets sidebar.

<details>
<summary>Optional shell and Vim preferences</summary>

The example [zshrc](files/macos/zshrc), [bashrc](files/macos/bashrc),
[bash_profile](files/macos/bash_profile), [inputrc](files/macos/inputrc), and
[vimrc](files/macos/vimrc) customize the shell/editor separately from OMXTerm.
Download them as above and copy individual settings into your existing dotfiles
(hidden preference files such as `.zshrc`).

These examples enable vi-style editing (`Esc` or `jj` leaves insert mode), quiet
bells, and history that skips leading-space commands. Vim uses `slate` colors,
two-space indentation, and `Space w` to save. When started without file arguments,
it saves/loads per-directory sessions under `~/.vim/sessions/`. Those contain
executable Vim commands and paths; load only trusted sessions. Clipboard support
depends on your Vim build.

### Replace selected dotfiles with backups

This replaces existing prompts, aliases, and plugins in the selected files.
Set `example` to the extracted macOS example folder first, as in the block
above. If you use `ZDOTDIR` or `INPUTRC`, adapt the destinations.

For Bash, choose `bashrc inputrc vimrc` instead of `zshrc vimrc` in the loop.
Bash login shells read only the first readable file among `~/.bash_profile`,
`~/.bash_login`, and `~/.profile`. If one exists, preserve its login setup:
back it up before merging the example `bash_profile`'s `.bashrc`-sourcing block
into that file, rather than replacing it. Creating `.bash_profile` would bypass
an existing `.bash_login` or `.profile`. If none exists, you can add
`bash_profile` to the copy list below to create it with the other files.

```sh
copy_optional_dotfiles() {
  dot_backup="$(mktemp -d "$HOME/omxterm-dotfiles-backup.XXXXXX")" || return 1
  printf 'Dotfile backup: %s\n' "$dot_backup"
  for name in zshrc vimrc; do # Default macOS Zsh; add Bash files only if wanted
    target="$HOME/.$name"
    [ -f "$example/$name" ] || { echo "Example missing: $name"; return 1; }
    [ ! -L "$target" ] && { [ ! -e "$target" ] || [ -f "$target" ]; } || { echo "Refusing $target"; return 1; }
    if [ -e "$target" ]; then cp -p "$target" "$dot_backup/.$name" || return 1; fi
    cp "$example/$name" "$target" || return 1
  done
}
copy_optional_dotfiles
```

Keep the printed backup path. If you also edit an existing Bash login file,
back it up in that folder first; for example, for `.profile`, use
`cp -p "$HOME/.profile" "$dot_backup/.profile"` in the same shell. Substitute
`.bash_profile` or `.bash_login` when that is the selected file.

Start a new shell or Vim to apply changes. To restore in a fresh Zsh/Bash session,
replace this backup path with the one you saved. Check that destinations are
still ordinary files, not symlinks, before restoring:

```sh
dot_backup="/path/to/saved/omxterm-dotfiles-backup.ABC123"
cp -p "$dot_backup/.zshrc" "$HOME/.zshrc"
```

Use the filename you backed up: for Bash, for example,
`cp -p "$dot_backup/.bashrc" "$HOME/.bashrc"` in the same shell. Restore any
backed-up login file too, or remove `.bash_profile` only if you newly created it.
Adapt destinations if you used `ZDOTDIR` or `INPUTRC`. Keep the earliest backup
if you repeat the copy; remove only newly added files without originals. Start
a new shell or Vim after restoring.

</details>
