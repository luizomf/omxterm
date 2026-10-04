# Linux quick start

[Install OMXTerm](../installation.md#linux) and open it. Your account shell,
bundled font, and colors are ready to use. This short walkthrough makes one
setting change and tries a saved command. Prefer a coordinated set of files?
Jump to the [complete ready-to-use setup](#complete-ready-to-use-setup-optional)
for configuration, snippets, and an editable theme.

The commands and optional snippets below use Bash. If your current shell is
something else (such as Fish or Zsh), type `bash` and press Enter first. Type
`exit` when finished to return to that shell. This does not change your account
shell or the shell started by new OMXTerm tabs.

## 1. Open your settings folder

On first launch, OMXTerm creates `config.json`, `snippets.json`, and an editable
theme. OMXTerm uses `XDG_CONFIG_HOME` from its application startup environment;
exports in shell startup files do not change it. If this shell uses another root,
replace `config_dir=...` in each folder/copy/restore block with
`config_dir="/actual/settings/folder/omxterm"`.

Run this in Bash to print the folder:

```bash
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir"
```

Open that path in your file manager; **Ctrl+L** accepts a path in many file
managers. The default is `~/.config/omxterm`; a non-empty `XDG_CONFIG_HOME`
selects another root. Back up files before editing them with a plain-text editor.

If you already had a configuration before installing, OMXTerm keeps it and
skips the starter kit. Create a missing `config.json` with the
[minimal configuration](../configuration.md#quick-start-use-the-bundled-defaults);
that alone does not create snippets or an editable theme. Steps 3 and 4 cover
those missing files.

## 2. Make the text comfortable

Open `config.json`, find `size` inside the `font` object (`font.size`), and change
`16` to `18`. If `font` or `size` is missing, use the
[complete font example](../configuration.md#add-one-display-change) to add the
missing fields while preserving your other settings. Save, then press and
release **Alt alone** to open the application menu. Choose **View → Reload
User Configuration** (`Ctrl+Shift+,`). The text gets larger; change it back to
`16` to undo it. If a notice reports an error, fix the named field and reload.

For temporary font zoom, use `Ctrl++` / `Ctrl+-`; `Ctrl+0` returns to your
configured size. See [fonts and spacing](../configuration.md#add-one-display-change)
for line height, padding, and installed fonts.

## 3. Try a snippet

Snippets are saved text you can insert into the current tab. If `snippets.json`
is missing, create it with the [single-line snippet example](../configuration.md#snippets).
If it already exists, preserve its `snippets` array: add the example entry or
choose an appropriate existing single-line snippet with `execute: false`.

Open **View → Toggle Snippets** (`Ctrl+Shift+S`). Review the body, then click
**Hello from OMXTerm** if present, or your chosen single-line snippet. Review
the inserted command, then press Enter.

Edit `snippets.json` to add your own commands, then close and reopen the sidebar.
Reopen it after every edit; `execute: false` leaves the final Enter to you.

## 4. Make it yours

- **Colors:** edit a `#RRGGBB` value in the file selected by `theme.path`
  (`themes/omtheme.json` in the starter kit), then reload, or use
  [OMXTerm Studio](../configuration.md#edit-visually-with-omxterm-studio).
  If the setting or file is missing, [create and select a complete theme](../configuration.md#terminal-themes).
- **Background:** try [transparency and blur](../configuration.md#background-transparency-and-blur).
  For GNOME, KDE Plasma, or Hyprland setup, see [Linux desktop tips](linux-desktop.md).
- **Window bars:** `Ctrl+Shift+D` toggles the title bar; `Ctrl+Shift+B` toggles
  the tab bar. [Set defaults for new windows](../configuration.md#start-with-hidden-bars).
- **Small interface or VM graphics trouble:** see [HiDPI scaling](linux-desktop.md#small-interface-text-on-a-hidpi-display)
  or [Try Omarchy troubleshooting](linux-desktop.md#try-omarchy-vm-graphics-troubleshooting).
- **Next steps:** [everyday use](../usage.md), [shortcuts](../configuration.md#keybinds),
  and [when settings take effect](../configuration.md#reloading-user-configuration).

<a id="optional-complete-examples"></a>

## Complete ready-to-use setup (optional)

These files work with **OMXTerm 0.17.0 or newer** and use bundled fonts and all
built-in shortcuts. The snippets assume Bash; the configuration keeps your
account shell.

Use these three files together; destinations are inside your
[settings folder](#1-open-your-settings-folder):

| Download                                               | Copy to               |
| ------------------------------------------------------ | --------------------- |
| [config.json](files/linux/config.json)                 | `config.json`         |
| [snippets.json](files/linux/snippets.json)             | `snippets.json`       |
| [themes/omtheme.json](files/linux/themes/omtheme.json) | `themes/omtheme.json` |

Download each linked file using GitHub's **Download raw file** button. To get
all examples together, choose **Code → Download ZIP** on the repository's
**main** branch, extract it, and open `docs/quick-start/files/linux/`.

Back up the destination files, then copy `config.json` and `snippets.json` into
your settings folder and `omtheme.json` into its `themes` subfolder. Replacing
these files replaces your current preferences; merge individual settings to
keep other choices. Reload configuration and reopen the snippets sidebar.

Try **Go to home directory**: it inserts ` cd "$HOME"`; press Enter to return
home. All seven snippets are single-line and have `execute: false`. Other
snippets use `xdg-open`, `ip`, `nslookup`, `git`, and GNU `base64 -w0`. Install a
missing tool through your distribution or edit the snippet. The palette example
uses Bash syntax.

### Copy from an extracted ZIP in the terminal

<details>
<summary>Show copy and restore steps</summary>

Set `example` to your extracted folder. This Bash block backs up existing files
and refuses symlinks or non-regular destination files (including named pipes)
so it does not overwrite their targets or hang copying into them.

```bash
example="/path/to/extracted/omxterm/docs/quick-start/files/linux"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
backup="$(mktemp -d "$HOME/omxterm-quick-start-backup.XXXXXX")"
apply_quick_start() {
  [ -n "$backup" ] && [ -d "$example/themes" ] && [ -f "$example/config.json" ] && [ -f "$example/snippets.json" ] && [ -f "$example/themes/omtheme.json" ] || { echo 'Check backup or example path'; return 1; }
  printf 'Backup (including only files that already existed): %s\n' "$backup"
  [ ! -L "$config_dir" ] && { [ ! -e "$config_dir" ] || [ -d "$config_dir" ]; } || { echo 'Configuration directory is not a plain directory'; return 1; }
  [ ! -L "$config_dir/themes" ] && { [ ! -e "$config_dir/themes" ] || [ -d "$config_dir/themes" ]; } || { echo 'Theme directory is not a plain directory'; return 1; }
  mkdir -p "$config_dir/themes" || return 1
  for name in config.json snippets.json themes/omtheme.json; do
    target="$config_dir/$name"
    [ ! -L "$target" ] && { [ ! -e "$target" ] || [ -f "$target" ]; } || { echo "Refusing $target"; return 1; }
    if [ -e "$target" ]; then
      mkdir -p "$backup/$(dirname "$name")" || return 1
      cp -p "$target" "$backup/$name" || return 1
    fi
    cp "$example/$name" "$target" || return 1
  done
}
apply_quick_start
```

Keep the printed backup path. If copying stops, inspect what was copied before
retrying. To undo later, even in a fresh Bash session, replace the backup path
below with the one you saved. Use the same `XDG_CONFIG_HOME` as OMXTerm (or set
`config_dir` to the original settings folder if that environment has changed).
Check that destinations are still ordinary files, not symlinks, before restoring:

```bash
backup="/path/to/saved/omxterm-quick-start-backup.ABC123"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
cp -p "$backup/config.json" "$config_dir/config.json"
```

Repeat for `snippets.json` and `themes/omtheme.json` if they have backups. Remove
only newly added files without originals, not the whole settings folder. Reload
configuration and reopen the snippets sidebar.

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

When Bash is your account shell, OMXTerm starts it as a login shell. Bash reads
the first readable file among `~/.bash_profile`, `~/.bash_login`, and
`~/.profile`. Before opening a new terminal, check that this file sources
`~/.bashrc`.

If it needs an edit, back it up too. In Bash, replace `dot_backup` below with
your printed dotfile backup path. This selects the first existing login file
(or `.profile` if none exists), refuses links/non-files, and saves the original
before you edit it. If it is unreadable, fix that before continuing rather than
bypassing its login setup.

```bash
dot_backup="/path/to/saved/omxterm-dotfiles-backup.ABC123"
backup_login_startup() {
  [ -d "$dot_backup" ] || { echo 'Check dotfile backup path'; return 1; }
  login_file="$HOME/.profile"
  for name in .bash_profile .bash_login .profile; do
    if [ -e "$HOME/$name" ] || [ -L "$HOME/$name" ]; then
      login_file="$HOME/$name"
      break
    fi
  done
  [ ! -L "$login_file" ] && { [ ! -e "$login_file" ] || { [ -f "$login_file" ] && [ -r "$login_file" ]; }; } || { echo "Refusing $login_file"; return 1; }
  if [ -e "$login_file" ]; then
    saved="$dot_backup/$(basename "$login_file")"
    [ ! -e "$saved" ] && [ ! -L "$saved" ] || { echo 'Backup already exists; keep the original'; return 1; }
    cp -p "$login_file" "$saved" || return 1
  fi
  printf 'Login startup file (record this path): %s\n' "$login_file"
}
backup_login_startup
```

After that block succeeds, if the selected file does not already load `.bashrc`,
add this in your editor, preserving its other login settings:

```sh
if [ -n "$BASH_VERSION" ] && [ -r "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
```

If none exists, create `~/.profile` with that block. Do not create `.bash_profile`
over an existing `.profile`; doing so would bypass the latter's login setup.

Start a new shell or Vim to apply changes. To restore in a fresh Bash session,
replace this backup path with the one you saved. Check that destinations are
still ordinary files, not symlinks, before restoring:

```bash
dot_backup="/path/to/saved/omxterm-dotfiles-backup.ABC123"
cp -p "$dot_backup/.bashrc" "$HOME/.bashrc"
```

Repeat for backed-up `.inputrc`, `.vimrc`, and the recorded login startup
filename. For example, if you edited `.profile`, restore with
`cp -p "$dot_backup/.profile" "$HOME/.profile"` in the same shell. If you created
`.profile` because none existed, remove only that new file to undo its addition.
Adapt destinations if you used `INPUTRC`. Keep the earliest backup if you repeat
the copy; remove only newly added files without originals. Start a new shell or
Vim after restoring.

</details>
