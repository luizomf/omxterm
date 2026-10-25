#!/bin/sh
# CI only: starts an installed OMXTerm the way a user would, under Xvfb with a
# fresh profile and no graphics flags, and waits until its first terminal
# session runs. A session starts only after the Terminal Surface has mounted,
# so on a GPU-less runner this also proves the software WebGL fallback
# (ADR 0038).
#
#   xvfb-run -a sh scripts/ci-installed-smoke.sh 0.22.1 omxterm
#   xvfb-run -a sh scripts/ci-installed-smoke.sh 0.22.1 ./OMXTerm.AppImage --appimage-extract-and-run
set -eu

expected=$1
shift

root=$(mktemp -d)
mkdir -p "$root/home" "$root/config/omxterm" "$root/state"
printf '{ "version": 1, "confirmClose": false }\n' \
  >"$root/config/omxterm/config.json"
export HOME="$root/home" XDG_CONFIG_HOME="$root/config" XDG_STATE_HOME="$root/state"

version=$("$@" --version 2>/dev/null | tail -n 1)
echo "Reported: $version"
if [ "$version" != "OMXTerm $expected" ]; then
  echo "Expected OMXTerm $expected" >&2
  exit 1
fi

ready="$root/session-started"
# The inner shell expands its own $0, the readiness path passed after it.
# shellcheck disable=SC2016
setsid "$@" --ozone-platform=x11 -e /bin/sh -c 'echo started >"$0"; sleep 120' \
  "$ready" >"$root/omxterm.log" 2>&1 &
group=$!

waited=0
while [ ! -s "$ready" ] && [ "$waited" -lt 90 ] && kill -0 "$group" 2>/dev/null; do
  sleep 1
  waited=$((waited + 1))
done
# Quit like a user closing the app: SIGTERM to the main process only, which
# shuts down its own GPU, zygote and session children. Signalling the whole
# group would kill those first and make Chromium abort on purpose.
kill -TERM "$group" 2>/dev/null || true
stopped=0
while kill -0 "$group" 2>/dev/null && [ "$stopped" -lt 15 ]; do
  sleep 1
  stopped=$((stopped + 1))
done
kill -KILL -- "-$group" 2>/dev/null || true

failed=0
if [ ! -s "$ready" ]; then
  echo "The first terminal session did not start within ${waited}s" >&2
  failed=1
fi
if grep -E "Failed to mount the Terminal Surface|did not initialize an available rendering backend|:FATAL:" \
  "$root/omxterm.log" >&2; then
  failed=1
fi
if [ "$failed" -ne 0 ]; then
  tail -n 60 "$root/omxterm.log" >&2
  exit 1
fi
echo "Terminal session started after ${waited}s"
