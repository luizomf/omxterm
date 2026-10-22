#!/bin/sh
set -eu

VERSION='@OMXTERM_VERSION@'

usage() {
  printf '%s\n' \
    "Usage: $(basename "$0") install [--compatibility] <verified-local-AppImage>" \
    "       $(basename "$0") uninstall | --version | --help" \
    "" \
    "Verify the downloaded AppImage and helper checksums first. Do not use sudo." \
    "Install adds OMXTerm to your application menu; no downloads or system changes." \
    "Use --compatibility only for graphics failures: software graphics may be slower or less stable."
}

fail() {
  printf 'OMXTerm installer: %s\n' "$1" >&2
  exit 1
}

owned_paths() {
  app=$HOME/.local/opt/omxterm/OMXTerm.AppImage
  icon=$HOME/.local/share/icons/hicolor/1024x1024/apps/omxterm.png
  desktop=$HOME/.local/share/applications/omxterm.desktop
}

uninstall() {
  owned_paths
  rm -f -- "$app" "$icon" "$desktop" ||
    fail "could not remove all installed files"
  printf '%s\n' "Removed the OMXTerm per-user desktop installation."
}

rollback() {
  status=$?
  [ "$status" -ne 0 ] || status=1
  trap - EXIT
  trap '' HUP INT TERM
  set +e
  recovery_complete=true
  stop_mount_child || true
  if [ -n "${mount_pid:-}" ]; then
    recovery_complete=false
    printf 'OMXTerm installer: mount child %s termination is unconfirmed; staging retained at %s; inspect the child and mount-output before recovery\n' "$mount_pid" "$work" >&2
  fi
  for name in desktop icon app; do
    eval "target=\${$name}"
    eval "backup=\${backup_$name:-}"
    eval "backup_root=\${backup_${name}_root:-}"
    eval "replaced=\${replaced_$name:-false}"
    restored=true
    if [ "$replaced" = true ]; then
      rm -f -- "$target" || restored=false
    fi
    if [ -n "$backup" ] && { [ -e "$backup" ] || [ -L "$backup" ]; }; then
      if [ "$restored" = true ]; then
        mv -- "$backup" "$target" || restored=false
      fi
      if [ "$restored" = false ]; then
        printf 'OMXTerm installer: could not restore %s; original retained at %s\n' "$target" "$backup" >&2
      fi
    elif [ "$restored" = false ]; then
      printf 'OMXTerm installer: could not remove partial installation at %s\n' "$target" >&2
    fi
    if [ "$restored" = true ]; then
      rm -rf -- "$backup_root" || recovery_complete=false
    else
      recovery_complete=false
    fi
  done
  if [ -z "${mount_pid:-}" ]; then
    rm -rf -- "${work:-}" || recovery_complete=false
  fi
  rm -f -- "${new_app:-}" "${new_icon:-}" "${new_desktop:-}" || recovery_complete=false
  if [ "$recovery_complete" = true ]; then
    printf 'OMXTerm installer: installation failed (exit %s); the previous installation was restored\n' "$status" >&2
  else
    printf 'OMXTerm installer: installation failed (exit %s); recovery incomplete; preserve the reported backups before retrying\n' "$status" >&2
  fi
  exit "$status"
}

replace_owned_file() {
  name=$1
  eval "target=\${$name}"
  eval "new=\${new_$name}"
  eval "backup=\${backup_$name}"
  if [ -e "$target" ] || [ -L "$target" ]; then
    mv -- "$target" "$backup"
  else
    eval "backup_$name="
  fi
  mv -- "$new" "$target"
  eval "replaced_$name=true"
}

mount_child_exited() {
  attempts=0
  while kill -0 "$mount_pid" 2>/dev/null; do
    [ "$attempts" -lt 20 ] || return 1
    attempts=$((attempts + 1))
    sleep 0.1
  done
  # The shell has observed exit. Only now collect its cached child status;
  # waiting on a live child (even after KILL) would not have a deadline.
  wait "$mount_pid" 2>/dev/null || true
  mount_pid=
}

on_install_signal() {
  # Finish the one bounded shutdown already in progress, preserving the signal.
  if [ "${mount_shutdown_active:-false}" = true ]; then
    mount_interruption=$1
  else
    exit "$1"
  fi
}

stop_mount_child() {
  [ -n "${mount_pid:-}" ] || return 0
  [ "${mount_stop_attempted:-false}" = false ] || return 1
  mount_shutdown_active=true
  mount_stop_attempted=true
  mount_stop_result=0
  kill -TERM "$mount_pid" 2>/dev/null || true
  if ! mount_child_exited; then
    printf '%s\n' 'OMXTerm installer: mount probe shutdown timed out; escalating to KILL' >&2
    kill -KILL "$mount_pid" 2>/dev/null || true
    mount_child_exited || true
    # Cleanup is not installation success: escalation preserves the timeout.
    mount_stop_result=1
  fi
  mount_shutdown_active=false
  if [ -n "${mount_interruption:-}" ]; then exit "$mount_interruption"; fi
  return "$mount_stop_result"
}

probe_fuse_mode() {
  mount_output=$work/mount-output
  : > "$mount_output"
  "$candidate" --appimage-mount >"$mount_output" 2>/dev/null &
  mount_pid=$!
  mount_path=
  attempts=0
  while [ "$attempts" -lt 50 ]; do
    mount_path=$(head -n 1 "$mount_output" 2>/dev/null || true)
    if [ -n "$mount_path" ] && [ -d "$mount_path" ]; then
      break
    fi
    if ! kill -0 "$mount_pid" 2>/dev/null; then
      break
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done
  if [ -n "$mount_path" ] && [ -d "$mount_path" ]; then
    launcher_suffix=
  else
    launcher_suffix=' --appimage-extract-and-run'
  fi
  stop_mount_child || fail "mount probe shutdown timed out; installation was not published"
}

detect_desktop_scale() {
  desktop_scale=
  [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ] || return 0
  command -v hyprctl >/dev/null 2>&1 || return 0
  command -v timeout >/dev/null 2>&1 || return 0
  command -v awk >/dev/null 2>&1 || return 0
  zero_scaling=$(timeout -k 1s 2s hyprctl getoption xwayland:force_zero_scaling 2>/dev/null) || return 0
  printf '%s\n' "$zero_scaling" | LC_ALL=C awk '
    $1 == "bool:" || $1 == "int:" {
      fields++
      enabled = NF == 2 && (($1 == "bool:" && $2 == "true") || ($1 == "int:" && $2 == "1"))
    }
    END { exit !(fields == 1 && enabled) }
  ' || return 0
  monitors=$(timeout -k 1s 2s hyprctl monitors 2>/dev/null) || return 0
  desktop_scale=$(printf '%s\n' "$monitors" | LC_ALL=C awk '
    $1 == "Monitor" {
      if (count && seen != 1) invalid = 1
      count++
      seen = 0
    }
    $1 == "scale:" {
      seen++
      if (!count || seen != 1 || NF != 2 || $2 !~ /^[0-9]+([.][0-9]+)?$/ || $2 + 0 <= 0) invalid = 1
      if (scale != "" && scale + 0 != $2 + 0) invalid = 1
      scale = $2
    }
    END {
      if (count && seen == 1 && !invalid && scale + 0 != 1) printf "%.15g", scale + 0
    }
  ') || desktop_scale=
  case $desktop_scale in
    ''|*[!0-9.]*) desktop_scale= ;;
  esac
}

install_appimage() {
  compatibility=false
  if [ "${1:-}" = --compatibility ]; then
    compatibility=true
    shift
  fi
  [ "$#" -eq 1 ] || { usage >&2; exit 2; }
  source_app=$1
  [ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] ||
    fail "HOME must be an absolute path"
  [ -f "$source_app" ] && [ ! -L "$source_app" ] && [ -r "$source_app" ] ||
    fail "input must be a readable local regular file (not a symlink)"
  command -v file >/dev/null 2>&1 || fail "the 'file' command is required to validate the AppImage"
  file_description=$(file -Lb -- "$source_app") || fail "could not inspect the AppImage"
  case $file_description in
    *ELF*64-bit*ARM\ aarch64*) appimage_arch=aarch64 ;;
    *ELF*64-bit*x86-64*) appimage_arch=x86_64 ;;
    *) fail "input is not a Linux ARM64 or x86-64 ELF AppImage" ;;
  esac
  host_arch=$(uname -m) || fail "could not determine this computer's architecture"
  [ "$appimage_arch" = "$host_arch" ] ||
    fail "the AppImage is built for $appimage_arch, but this computer is $host_arch"

  owned_paths
  # Replace symlink entries themselves, never their referents (even directories).
  # Check the entire ownership set before staging or replacing installed files.
  for target in "$app" "$icon" "$desktop"; do
    if [ ! -L "$target" ] && [ -e "$target" ] && [ ! -f "$target" ]; then
      fail "cannot replace $target: expected a regular file or symlink"
    fi
  done
  work=$(mktemp -d "${TMPDIR:-/tmp}/omxterm-installer.XXXXXX") ||
    fail "could not create a temporary directory"
  trap rollback EXIT
  trap 'on_install_signal 129' HUP
  trap 'on_install_signal 130' INT
  trap 'on_install_signal 143' TERM
  candidate=$work/OMXTerm.AppImage
  install -m 755 "$source_app" "$candidate"
  extract_root=$work/extract
  mkdir "$extract_root"
  (
    cd "$extract_root"
    "$candidate" --appimage-extract \
      usr/share/icons/hicolor/1024x1024/apps/omxterm.png >/dev/null 2>&1
    "$candidate" --appimage-extract omxterm.desktop >/dev/null 2>&1
  ) || fail "input is not an OMXTerm AppImage with the required packaged metadata"
  extracted_icon=$extract_root/squashfs-root/usr/share/icons/hicolor/1024x1024/apps/omxterm.png
  extracted_desktop=$extract_root/squashfs-root/omxterm.desktop
  [ -f "$extracted_icon" ] && [ -s "$extracted_icon" ] ||
    fail "the AppImage does not contain the required OMXTerm icon"
  [ -f "$extracted_desktop" ] &&
    grep -qx 'Name=OMXTerm' "$extracted_desktop" &&
    grep -qx 'Icon=omxterm' "$extracted_desktop" &&
    grep -qx 'StartupWMClass=omxterm' "$extracted_desktop" ||
    fail "the AppImage does not contain the required OMXTerm desktop metadata"

  probe_fuse_mode
  # GIO checks the executable before expanding %%: keep the encoded path in
  # argv, not that first token. This fixed command forwards literal argv only;
  # no pathname enters shell code (env alone would treat paths with = as assignments).
  launcher_prefix='sh -c "exec \\"\\$@\\"" sh '
  graphics_suffix=' --ozone-platform=x11'
  if [ "$compatibility" = true ]; then
    launcher_prefix="env LIBGL_ALWAYS_SOFTWARE=1 $launcher_prefix"
    graphics_suffix="$graphics_suffix --ignore-gpu-blocklist"
  fi
  detect_desktop_scale
  if [ -n "$desktop_scale" ]; then
    graphics_suffix="$graphics_suffix --force-device-scale-factor=$desktop_scale"
  fi
  # Exec quoting is decoded after Desktop Entry string escaping: a literal
  # backslash needs four backslashes; quote/backtick/dollar need two plus itself.
  escaped_app=$(printf '%s' "$app" | sed 's/\\/\\\\\\\\/g; s/["`$]/\\\\&/g; s/%/%%/g')
  escaped_icon=$(printf '%s' "$icon" | sed 's/\\/\\\\/g')
  desktop_contents=$work/omxterm.desktop
  cat > "$desktop_contents" <<EOF
[Desktop Entry]
Name=OMXTerm
Comment=Personal desktop terminal
Exec=$launcher_prefix"$escaped_app"$launcher_suffix$graphics_suffix %U
Terminal=false
Type=Application
Icon=$escaped_icon
StartupWMClass=omxterm
Categories=Utility;TerminalEmulator;
EOF

  mkdir -p "$(dirname "$app")" "$(dirname "$icon")" "$(dirname "$desktop")"
  new_app=$(mktemp "$(dirname "$app")/.omxterm-app.XXXXXX")
  new_icon=$(mktemp "$(dirname "$icon")/.omxterm-icon.XXXXXX")
  new_desktop=$(mktemp "$(dirname "$desktop")/.omxterm-desktop.XXXXXX")
  install -m 755 "$candidate" "$new_app"
  install -m 644 "$extracted_icon" "$new_icon"
  install -m 644 "$desktop_contents" "$new_desktop"

  backup_app_root=$(mktemp -d "$(dirname "$app")/.omxterm-app-backup.XXXXXX")
  backup_icon_root=$(mktemp -d "$(dirname "$icon")/.omxterm-icon-backup.XXXXXX")
  backup_desktop_root=$(mktemp -d "$(dirname "$desktop")/.omxterm-desktop-backup.XXXXXX")
  backup_app=$backup_app_root/previous
  backup_icon=$backup_icon_root/previous
  backup_desktop=$backup_desktop_root/previous
  replaced_app=false
  replaced_icon=false
  replaced_desktop=false

  replace_owned_file app
  replace_owned_file icon
  replace_owned_file desktop

  trap - EXIT HUP INT TERM
  rm -rf -- "$work" "$backup_app_root" "$backup_icon_root" \
    "$backup_desktop_root"
  printf '%s\n' "Installed OMXTerm. Open it from your application menu."
  if [ -n "$desktop_scale" ]; then
    printf 'Interface scale: %sx (current Hyprland monitors). Reinstall after changing displays to refresh it.\n' "$desktop_scale"
  fi
  if [ "$compatibility" = true ]; then
    printf '%s\n' "Compatibility mode uses software graphics and may be slower or less stable. Reinstall without --compatibility to remove it."
  else
    printf '%s\n' "If the window is blank or graphics fail, try installing with --compatibility (software graphics; may be slower or less stable)."
  fi
}

case ${1:-} in
  --help)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    usage
    ;;
  --version)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    printf '%s\n' "$VERSION"
    ;;
  install)
    shift
    install_appimage "$@"
    ;;
  uninstall)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    [ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] ||
      fail "HOME must be an absolute path"
    uninstall
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
