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
  trap - EXIT HUP INT TERM
  set +e
  for name in desktop icon app; do
    eval "target=\${$name}"
    eval "backup=\${backup_$name:-}"
    eval "replaced=\${replaced_$name:-false}"
    if [ "$replaced" = true ]; then
      rm -f -- "$target"
      if [ -n "$backup" ] && { [ -e "$backup" ] || [ -L "$backup" ]; }; then
        mv -- "$backup" "$target"
      fi
    elif [ -n "$backup" ] && { [ -e "$backup" ] || [ -L "$backup" ]; }; then
      mv -- "$backup" "$target"
    fi
  done
  rm -rf -- "${work:-}" "${backup_app_root:-}" \
    "${backup_icon_root:-}" "${backup_desktop_root:-}"
  rm -f -- "${new_app:-}" "${new_icon:-}" "${new_desktop:-}" \
    "${backup_app:-}" "${backup_icon:-}" "${backup_desktop:-}"
  printf '%s\n' "OMXTerm installer: installation failed; the previous installation was restored" >&2
  exit 1
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
  kill "$mount_pid" 2>/dev/null || true
  wait "$mount_pid" 2>/dev/null || true
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
    *ELF*64-bit*ARM\ aarch64*) ;;
    *) fail "input is not a Linux ARM64 ELF AppImage" ;;
  esac

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
  trap rollback EXIT HUP INT TERM
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
  launcher_prefix=
  graphics_suffix=' --ozone-platform=x11'
  if [ "$compatibility" = true ]; then
    launcher_prefix='env LIBGL_ALWAYS_SOFTWARE=1 '
    graphics_suffix="$graphics_suffix --ignore-gpu-blocklist"
  fi
  detect_desktop_scale
  if [ -n "$desktop_scale" ]; then
    graphics_suffix="$graphics_suffix --force-device-scale-factor=$desktop_scale"
  fi
  escaped_app=$(printf '%s' "$app" | sed 's/\\/\\\\/g; s/"/\\"/g')
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
