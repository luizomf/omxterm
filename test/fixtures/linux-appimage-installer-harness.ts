import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Fakes and runner for scripts/install-linux-appimage.sh tests: a PATH with
// fake `file`, `uname`, `mv` and Hyprland tools, and fake AppImages.
export const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const helper = path.join(
  repositoryRoot,
  "scripts",
  "install-linux-appimage.sh",
);
const temporaryRoots: string[] = [];

export async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-installer-test-"));
  temporaryRoots.push(root);
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "file"),
    "#!/bin/sh\nprintf '%s\\n' \"${OMXTERM_TEST_FILE_DESCRIPTION:-ELF 64-bit LSB executable, ARM aarch64}\"\n",
    { mode: 0o755 },
  );
  // The installer requires the AppImage to match this computer's architecture.
  await writeFile(
    path.join(bin, "uname"),
    "#!/bin/sh\nprintf '%s\\n' \"${OMXTERM_TEST_HOST_ARCH:-aarch64}\"\n",
    { mode: 0o755 },
  );
  return { root, home: path.join(root, "home"), bin };
}

export async function fakeAppImage(root: string, revision: string) {
  const appImage = path.join(root, `OMXTerm-${revision}.AppImage`);
  await writeFile(
    appImage,
    `#!/bin/sh
# ${revision}
case \${1:-} in
  --appimage-extract)
    requested=\${2:-usr/share/icons/hicolor/1024x1024/apps/omxterm.png}
    mkdir -p "squashfs-root/\$(dirname "$requested")"
    if [ "$requested" = omxterm.desktop ]; then
      printf '%s\\n' 'Name=OMXTerm' 'Icon=omxterm' 'StartupWMClass=omxterm' > "squashfs-root/$requested"
    else
      printf '%s\\n' "icon-${revision}" > "squashfs-root/$requested"
    fi
    ;;
  --appimage-mount)
    if [ "\${OMXTERM_TEST_FUSE_MODE:-fallback}" != direct ]; then exit 1; fi
    mount_dir=\${TMPDIR:-/tmp}/omxterm-fake-mount-$$
    mkdir "$mount_dir"
    printf '%s\\n' "$mount_dir"
    trap 'rmdir "$mount_dir"; exit 0' TERM INT
    while :; do sleep 1; done
    ;;
  *) exit 0 ;;
esac
`,
    { mode: 0o755 },
  );
  return appImage;
}

export async function failingMoves(bin: string) {
  const realMv = process.platform === "darwin" ? "/bin/mv" : "/usr/bin/mv";
  await writeFile(
    path.join(bin, "mv"),
    `#!/bin/sh
source=$2
last=
for argument do last=$argument; done
case $source in
  */previous)
    if [ "$last" = "\${OMXTERM_TEST_FAIL_RESTORE:-}" ]; then
      printf '%s\\n' 'injected restoration failure' >&2; exit 71
    fi
    ;;
  *)
    if [ "$last" = "$OMXTERM_TEST_FAIL_TARGET" ]; then
      printf '%s\\n' 'injected replacement failure' >&2; exit 70
    fi
    ;;
esac
exec ${realMv} "$@"
`,
    { mode: 0o755 },
  );
}

export async function fakeHyprland(bin: string) {
  await writeFile(
    path.join(bin, "hyprctl"),
    `#!/bin/sh
case "$*" in
  'getoption xwayland:force_zero_scaling') printf '%s\\n' "$OMXTERM_TEST_ZERO_SCALING" ;;
  monitors) printf '%s\\n' "$OMXTERM_TEST_MONITORS" ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(bin, "timeout"),
    `#!/bin/sh
[ "\${OMXTERM_TEST_QUERY_FAILURE:-false}" = false ] || exit 124
shift 3
exec "$@"
`,
    { mode: 0o755 },
  );
}

export function owned(home: string) {
  return {
    app: path.join(home, ".local/opt/omxterm/OMXTerm.AppImage"),
    icon: path.join(
      home,
      ".local/share/icons/hicolor/1024x1024/apps/omxterm.png",
    ),
    desktop: path.join(home, ".local/share/applications/omxterm.desktop"),
  };
}

export async function runHelper(
  home: string,
  bin: string,
  arguments_: string[],
  extraEnvironment: NodeJS.ProcessEnv = {},
) {
  return execFile("/bin/sh", [helper, ...arguments_], {
    env: {
      ...process.env,
      HOME: home,
      HYPRLAND_INSTANCE_SIGNATURE: "",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      ...extraEnvironment,
    },
  });
}

export async function removeTemporaryRoots() {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
}
