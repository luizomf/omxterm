# Apple Silicon macOS quick start

[Install OMXTerm](../../README.md#macos) first; check the unsigned/ad-hoc-sealed app's Gatekeeper instructions there. OMXTerm uses your account's configured shell. The main optional shell example below is for the default macOS Zsh; Bash is a separate choice.

## Get the files

Sign in to GitHub with access to this currently private repository, select the desired branch, then choose **Code → Download ZIP**. Extract the archive and locate `docs/quick-start/files/macos/`. Git is not needed. Do not assume an unauthenticated raw URL works. Inspect the complete [config.json](files/macos/config.json), [snippets.json](files/macos/snippets.json), and [themes/omtheme.json](files/macos/themes/omtheme.json) before copying.

## Back up and apply OMXTerm files

In Zsh or Bash, set `example` to the **actual extracted directory**, not the illustrative path below. Each existing regular file gets copied to a unique backup directory. Symlinks and directories at destinations are refused; if your config directory is a symlink, resolve it manually rather than writing through it.

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

On failure, stop and check what was copied before retrying. Restore existing files individually from `$backup` to the matching path under `$config_dir` (e.g. `cp -p "$backup/config.json" "$config_dir/config.json"`); remove only newly installed files without a backup after inspecting them. Do not delete your entire configuration directory. A non-empty `XDG_CONFIG_HOME` overrides `~/.config`.

This explicit preference set retains bundled fonts by omitting `font.family`, uses the platform's full default shortcut map, and connects an editable copy of the [standard palette](../omtheme.json) via `./themes/omtheme.json`. Top padding is **0 px** (the runtime default); other sides are 8 px. Select **View → Reload User Configuration** (`Cmd+Shift+,`) after copying. Fix any reported validation error and reload again.

Open **View → Toggle Snippets** (`Cmd+Shift+S`), click “Open current folder,” inspect the inserted ` open .`, and press Enter. All seven JSON Snippets have `execute: false`; none automatically appends Enter. Leading spaces opt out of shell history when the optional history preference is enabled. `open`, `ifconfig`, `nslookup`, and `pbcopy` are macOS commands; the Git example requires Git. The palette command works in Zsh or Bash. Change network targets and commands to fit your needs. [Snippet details](../configuration.md#snippets) cover input safety and sidebar refresh.

## Optional Zsh, Bash, Readline, and Vim preferences

The Vim preset uses the `slate` syntax colors over the Terminal Theme background, two-space indentation without automatic indentation, no mouse capture, trailing-whitespace highlighting, and cursor-position restoration. Space is the leader: `Space w` saves, `Space h` clears search highlighting, and `Tab`/`Shift+Tab` switch buffers. Clipboard integration depends on the installed Vim build and desktop; `clipboard=unnamed` does not add clipboard support to a build that lacks it.

These files are **not required** for OMXTerm: [zshrc](files/macos/zshrc), [bashrc](files/macos/bashrc), [bash_profile](files/macos/bash_profile), [inputrc](files/macos/inputrc), [vimrc](files/macos/vimrc). Review your existing dotfiles first: replacing them loses custom prompt, aliases, plugins, or initialization. Copy only a chosen subset. This separate step creates a fresh dotfile backup each time, so retrying it cannot overwrite the earlier originals. Set `example` again if in a new shell:

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

For Bash, use `bashrc bash_profile inputrc vimrc` in place of `zshrc vimrc` (omit anything you don't want). If `INPUTRC` or `ZDOTDIR` is set, adapt the destination; do not overwrite a different location assuming these defaults. Restore a backed-up dotfile with e.g. `cp -p "$dot_backup/.zshrc" "$HOME/.zshrc"`; remove only a newly installed file with no backup after checking it. Start a new shell or Vim session to see changes.

Zsh's `bindkey -v` and Bash's `set -o vi` enable vi command-line editing: `Esc` or `jj` exits insert mode. Both skip history entries with an initial space; Zsh disables its bell, while `.inputrc` disables Bash/Readline's bell. The Bash aliases use native `/bin/ls -G` and `/usr/bin/grep --color=auto`, and Bash completion is used only where available. Vim maps `jj`, disables its own bell, and auto-saves/loads sessions **only when invoked without file arguments**, by working directory under `~/.vim/sessions/`. These session files are executable Vim commands that may record file paths: keep them private, never source untrusted sessions, or remove the session block if unwanted.

### Optional Homebrew Bash as the account shell

If Homebrew is already installed and you prefer Bash, install it with `brew install bash`. Check that `/opt/homebrew/bin/bash` exists, then **only if you intend to change your account shell**, register it in `/etc/shells` (requires sudo) and select it:

```sh
grep -qxF /opt/homebrew/bin/bash /etc/shells || echo /opt/homebrew/bin/bash | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/bash
```

Log out and back in. OMXTerm launches that account shell as an interactive login shell; optional `.bash_profile` sources `.bashrc`, while `.inputrc` configures Readline rather than Zsh. To try it without changing the account: `/opt/homebrew/bin/bash --login` (then `exit`). To switch back to macOS Zsh later: `chsh -s /bin/zsh`, then log out/back in. Changing the account shell is separate from installing the OMXTerm examples and is never done automatically. More settings: [User Configuration reference](../configuration.md).
