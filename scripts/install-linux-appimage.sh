#!/bin/sh
set -eu

VERSION='@OMXTERM_VERSION@'

usage() {
  printf '%s\n' "Usage: $(basename "$0") install <verified-local-AppImage> | uninstall | --version" >&2
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
  rm -rf -- "${work:-}"
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

install_appimage() {
  [ "$#" -eq 1 ] || { usage; exit 2; }
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
  owned_paths
  escaped_app=$(printf '%s' "$app" | sed 's/\\/\\\\/g; s/"/\\"/g')
  desktop_contents=$work/omxterm.desktop
  cat > "$desktop_contents" <<EOF
[Desktop Entry]
Name=OMXTerm
Comment=Personal desktop terminal
Exec="$escaped_app"$launcher_suffix %U
Terminal=false
Type=Application
Icon=omxterm
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

  backup_app=$(mktemp "$(dirname "$app")/.omxterm-app-backup.XXXXXX")
  backup_icon=$(mktemp "$(dirname "$icon")/.omxterm-icon-backup.XXXXXX")
  backup_desktop=$(mktemp "$(dirname "$desktop")/.omxterm-desktop-backup.XXXXXX")
  rm -f -- "$backup_app" "$backup_icon" "$backup_desktop"
  replaced_app=false
  replaced_icon=false
  replaced_desktop=false

  replace_owned_file app
  replace_owned_file icon
  replace_owned_file desktop

  trap - EXIT HUP INT TERM
  rm -rf -- "$work"
  rm -f -- "$backup_app" "$backup_icon" "$backup_desktop"
  printf '%s\n' "Installed OMXTerm for the current user ($([ -n "$launcher_suffix" ] && printf fallback || printf kernel-FUSE) launcher)."
}

case ${1:-} in
  --version)
    [ "$#" -eq 1 ] || { usage; exit 2; }
    printf '%s\n' "$VERSION"
    ;;
  install)
    shift
    install_appimage "$@"
    ;;
  uninstall)
    [ "$#" -eq 1 ] || { usage; exit 2; }
    [ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] ||
      fail "HOME must be an absolute path"
    uninstall
    ;;
  *)
    usage
    exit 2
    ;;
esac
