# Included into electron-builder's NSIS script (electron-builder.yml nsis.include).

# electron-builder copies the running installer to
# %LOCALAPPDATA%\<name>-updater\installer.exe as the base for electron-updater's
# differential downloads, and its uninstaller never removes it. OMXTerm has no
# auto-updater, so drop the copy (and the folder, if empty) once installed.
# Upgrades also clear a copy left by an older version.
!macro customInstall
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\omxterm-updater"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend
