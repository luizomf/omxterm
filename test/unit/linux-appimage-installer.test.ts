import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const helper = path.join(
  repositoryRoot,
  "scripts",
  "install-linux-appimage.sh",
);
const temporaryRoots: string[] = [];

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-installer-test-"));
  temporaryRoots.push(root);
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "file"),
    "#!/bin/sh\nprintf '%s\\n' 'ELF 64-bit LSB executable, ARM aarch64'\n",
    { mode: 0o755 },
  );
  return { root, home: path.join(root, "home"), bin };
}

async function fakeAppImage(root: string, revision: string) {
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

function owned(home: string) {
  return {
    app: path.join(home, ".local/opt/omxterm/OMXTerm.AppImage"),
    icon: path.join(
      home,
      ".local/share/icons/hicolor/1024x1024/apps/omxterm.png",
    ),
    desktop: path.join(home, ".local/share/applications/omxterm.desktop"),
  };
}

async function runHelper(
  home: string,
  bin: string,
  arguments_: string[],
  extraEnvironment: NodeJS.ProcessEnv = {},
) {
  return execFile("/bin/sh", [helper, ...arguments_], {
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      ...extraEnvironment,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.skipIf(process.platform === "win32")(
  "Linux AppImage desktop installer",
  () => {
    it.each([
      ["direct", 'Exec="', " --appimage-extract-and-run"],
      ["fallback", "--appimage-extract-and-run", "never-present-marker"],
    ])(
      "installs all owned files with the %s launcher mode",
      async (mode, expected, absent) => {
        const { root, home: fixtureHome, bin } = await fixtureRoot();
        const home = `${fixtureHome}\\profile`;
        const appImage = await fakeAppImage(root, "one");

        await runHelper(home, bin, ["install", appImage], {
          OMXTERM_TEST_FUSE_MODE: mode,
        });

        const paths = owned(home);
        expect((await stat(paths.app)).mode & 0o111).not.toBe(0);
        expect(await readFile(paths.icon, "utf8")).toBe("icon-one\n");
        const desktop = await readFile(paths.desktop, "utf8");
        expect(desktop).toContain("[Desktop Entry]\nName=OMXTerm\n");
        expect(desktop).toContain("Comment=Personal desktop terminal\n");
        expect(desktop).toContain("Terminal=false\nType=Application\n");
        expect(desktop).toContain(
          `Icon=${paths.icon.replaceAll("\\", "\\\\")}\n`,
        );
        expect(desktop).not.toContain("Icon=omxterm\n");
        expect(desktop).toContain("StartupWMClass=omxterm\n");
        expect(desktop).toContain("Categories=Utility;TerminalEmulator;\n");
        expect(desktop).toContain(expected);
        expect(desktop).not.toContain(absent);
      },
    );

    it("selects supported X11 even when the desktop exports a Wayland preference", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "one");

      await runHelper(home, bin, ["install", appImage], {
        ELECTRON_OZONE_PLATFORM_HINT: "wayland",
      });

      const desktop = await readFile(owned(home).desktop, "utf8");
      expect(desktop).toContain(
        '" --appimage-extract-and-run --ozone-platform=x11 %U\n',
      );
      expect(desktop).not.toContain("LIBGL_ALWAYS_SOFTWARE");
      expect(desktop).not.toContain("--ignore-gpu-blocklist");
    });

    it("replaces all files repeatedly and uninstalls only the fixed ownership set", async () => {
      const { root, home, bin } = await fixtureRoot();
      const first = await fakeAppImage(root, "one");
      const second = await fakeAppImage(root, "two");
      const unrelated = path.join(
        home,
        ".local/share/applications/unrelated.desktop",
      );
      await mkdir(path.dirname(unrelated), { recursive: true });
      await writeFile(unrelated, "keep\n");

      await runHelper(home, bin, ["install", first]);
      await runHelper(home, bin, ["install", first]);
      await runHelper(home, bin, ["install", second]);

      const paths = owned(home);
      expect(await readFile(paths.app, "utf8")).toContain("# two\n");
      expect(await readFile(paths.icon, "utf8")).toBe("icon-two\n");
      await runHelper(home, bin, ["uninstall"]);
      await expect(stat(paths.app)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(paths.icon)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(paths.desktop)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(unrelated, "utf8")).toBe("keep\n");
      await expect(stat(path.dirname(paths.app))).resolves.toBeDefined();
      await expect(stat(path.dirname(paths.desktop))).resolves.toBeDefined();
    });

    it("rejects invalid input before creating installation directories", async () => {
      const { root, home, bin } = await fixtureRoot();
      const invalid = path.join(root, "invalid.AppImage");
      await writeFile(invalid, "not an AppImage\n");

      await expect(
        runHelper(home, bin, ["install", invalid], { TMPDIR: root }),
      ).rejects.toThrow();
      await expect(stat(path.join(home, ".local"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(
        (await readdir(root)).filter((entry) =>
          entry.startsWith("omxterm-installer."),
        ),
      ).toEqual([]);
    });

    it("preserves the previous installation when backup preparation fails", async () => {
      const { root, home, bin } = await fixtureRoot();
      const first = await fakeAppImage(root, "one");
      const second = await fakeAppImage(root, "two");
      await runHelper(home, bin, ["install", first]);
      const paths = owned(home);
      const before = await Promise.all(
        Object.values(paths).map((file) => readFile(file, "utf8")),
      );
      await writeFile(
        path.join(bin, "mktemp"),
        `#!/bin/sh
for argument do
  case $argument in
    *.omxterm-icon-backup.*) exit 70 ;;
  esac
done
exec /usr/bin/mktemp "$@"
`,
        { mode: 0o755 },
      );

      await expect(runHelper(home, bin, ["install", second])).rejects.toThrow();

      const after = await Promise.all(
        Object.values(paths).map((file) => readFile(file, "utf8")),
      );
      expect(after).toEqual(before);
    });

    it("leaves no partial clean installation when a replacement fails", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "one");
      const paths = owned(home);
      const realMv = process.platform === "darwin" ? "/bin/mv" : "/usr/bin/mv";
      await writeFile(
        path.join(bin, "mv"),
        `#!/bin/sh
last=
for argument do last=$argument; done
if [ "$last" = "$OMXTERM_TEST_FAIL_TARGET" ]; then exit 70; fi
exec ${realMv} "$@"
`,
        { mode: 0o755 },
      );

      await expect(
        runHelper(home, bin, ["install", appImage], {
          OMXTERM_TEST_FAIL_TARGET: paths.desktop,
        }),
      ).rejects.toThrow();

      for (const file of Object.values(paths))
        await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("rolls back every owned file when a replacement fails", async () => {
      const { root, home, bin } = await fixtureRoot();
      const first = await fakeAppImage(root, "one");
      const second = await fakeAppImage(root, "two");
      await runHelper(home, bin, ["install", first]);
      const before = await Promise.all(
        Object.values(owned(home)).map((file) => readFile(file, "utf8")),
      );
      const realMv = process.platform === "darwin" ? "/bin/mv" : "/usr/bin/mv";
      await writeFile(
        path.join(bin, "mv"),
        `#!/bin/sh
for argument do
  if [ "$argument" = "$OMXTERM_TEST_FAIL_TARGET" ]; then exit 70; fi
done
exec ${realMv} "$@"
`,
        { mode: 0o755 },
      );
      const paths = owned(home);

      await expect(
        runHelper(home, bin, ["install", second], {
          OMXTERM_TEST_FAIL_TARGET: paths.desktop,
        }),
      ).rejects.toThrow();

      const after = await Promise.all(
        Object.values(paths).map((file) => readFile(file, "utf8")),
      );
      expect(after).toEqual(before);
    });
  },
);
