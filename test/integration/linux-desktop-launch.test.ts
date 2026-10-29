import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const helper = path.resolve(
  import.meta.dirname,
  "../../scripts/install-linux-appimage.sh",
);

// The installer and GIO are real. Only AppImage inspection/extraction/mounting
// are synthetic: this suite verifies Desktop Entry semantics, not FUSE/Electron.
describe.skipIf(process.platform !== "linux").each([
  ["aarch64", "ARM aarch64"],
  ["x86_64", "x86-64"],
])("installed desktop launch (%s)", (host, imageArchitecture) => {
  it.each([
    ["literal percent", ["home%f", "home%d", "home%U%"]],
    ["literal double quote", ['home"quote', 'home%f"\\profile$`token`']],
    [
      "existing controls",
      [
        "ordinary",
        "home with spaces",
        "home$sample",
        "home`token`",
        "home\\profile",
        "home=profile",
      ],
    ],
  ] as const)(
    "launches the exact executable with %s paths",
    async (_name, components) => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-desktop-test-"));
      try {
        const bin = path.join(root, "bin");
        await mkdir(bin);
        await writeFile(
          path.join(bin, "uname"),
          `#!/bin/sh\nprintf '%s\\n' '${host}'\n`,
          { mode: 0o755 },
        );
        await writeFile(
          path.join(bin, "file"),
          `#!/bin/sh\nprintf '%s\\n' 'ELF 64-bit LSB executable, ${imageArchitecture}'\n`,
          { mode: 0o755 },
        );
        await writeFile(
          path.join(bin, "hyprctl"),
          `#!/bin/sh
case "$*" in
  'getoption xwayland:force_zero_scaling') printf 'bool: true\\n' ;;
  monitors) printf 'Monitor Synthetic:\\n scale: 1.5\\n' ;;
esac
`,
          { mode: 0o755 },
        );
        const source = path.join(root, "synthetic.AppImage");
        await writeFile(
          source,
          `#!/bin/sh
case \${1:-} in
  --appimage-extract)
    mkdir -p "squashfs-root/$(dirname "$2")"
    if [ "$2" = omxterm.desktop ]; then
      printf '%s\\n' 'Name=OMXTerm' 'Icon=omxterm' 'StartupWMClass=omxterm' > "squashfs-root/$2"
    else printf 'synthetic-icon\\n' > "squashfs-root/$2"; fi ;;
  --appimage-mount)
    [ "$OMXTERM_TEST_MODE" = direct ] || exit 1
    printf '%s\\n' "$OMXTERM_TEST_MOUNT"
    trap 'exit 0' TERM INT
    while :; do sleep 0.1; done ;;
  *)
    printf '%s\\0' "$0" "\${LIBGL_ALWAYS_SOFTWARE:-}" "$@" > "$OMXTERM_TEST_RECORD.tmp"
    mv -- "$OMXTERM_TEST_RECORD.tmp" "$OMXTERM_TEST_RECORD" ;;
esac
`,
          { mode: 0o755 },
        );
        const record = path.join(root, "launch-record");
        const urls = [
          "https://example.invalid/one%20two",
          "https://example.invalid/three",
        ];
        for (const component of components) {
          const home = path.join(root, component);
          const app = path.join(home, ".local/opt/omxterm/OMXTerm.AppImage");
          const desktop = path.join(
            home,
            ".local/share/applications/omxterm.desktop",
          );
          for (const mode of ["direct", "fallback"]) {
            const compatibility = mode === "fallback";
            const env = {
              ...process.env,
              HOME: home,
              PATH: `${bin}:${process.env.PATH ?? ""}`,
              HYPRLAND_INSTANCE_SIGNATURE: compatibility ? "synthetic" : "",
              LIBGL_ALWAYS_SOFTWARE: "",
              OMXTERM_TEST_MODE: mode,
              OMXTERM_TEST_MOUNT: root,
              OMXTERM_TEST_RECORD: record,
            };
            await execFile(
              "/bin/sh",
              [
                helper,
                "install",
                ...(compatibility ? ["--compatibility"] : []),
                source,
              ],
              { env },
            );
            expect(await readFile(app)).toEqual(await readFile(source));
            await rm(record, { force: true });
            await execFile("gio", ["launch", desktop, ...urls], { env });
            await expect
              .poll(async () => (await readFile(record, "utf8")).split("\0"), {
                timeout: 2000,
              })
              .toEqual([
                app,
                compatibility ? "1" : "",
                ...(mode === "fallback" ? ["--appimage-extract-and-run"] : []),
                "--ozone-platform=x11",
                ...(compatibility
                  ? [
                      "--ignore-gpu-blocklist",
                      "--force-device-scale-factor=1.5",
                    ]
                  : []),
                ...urls,
                "",
              ]);
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
