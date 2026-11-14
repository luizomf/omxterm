@echo off
rem omxterm-ctl: drive a Terminal Window the user allowed (ADR 0052). It runs
rem OMXTerm's own runtime in Node mode, so nothing else needs to be installed.
rem A .cmd, not the GUI executable itself: PowerShell would lose its output,
rem exit code and wait. setlocal keeps ELECTRON_RUN_AS_NODE out of the caller.
setlocal
set "here=%~dp0"
set "runtime=%here%..\..\OMXTerm.exe"
rem An unpackaged build names its Electron binary here.
if exist "%here%runtime" for /f "usebackq delims=" %%r in ("%here%runtime") do set "runtime=%%r"
set "ELECTRON_RUN_AS_NODE=1"
"%runtime%" "%here%omxterm-ctl.cjs" %*
exit /b %ERRORLEVEL%
