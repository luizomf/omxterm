import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  execFile,
  failingMoves,
  fakeAppImage,
  fakeHyprland,
  fixtureRoot,
  owned,
  removeTemporaryRoots,
  runHelper,
} from "../fixtures/linux-appimage-installer-harness";

afterEach(removeTemporaryRoots);

describe.skipIf(process.platform === "win32")(
  "Linux AppImage desktop installer",
  () => {
    it("explains the normal install and the single optional compatibility choice without installing", async () => {
      const { home, bin } = await fixtureRoot();

      const { stdout, stderr } = await runHelper(home, bin, ["--help"]);

      expect(stdout).toContain(
        "install [--compatibility] <verified-local-AppImage>",
      );
      expect(stdout).toContain("uninstall");
      expect(stdout).toContain("--version");
      expect(stdout).toContain("Do not use sudo");
      expect(stderr).toBe("");
      await expect(stat(path.join(home, ".local"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it.each([
      ["direct", 'Exec=sh -c "', " --appimage-extract-and-run"],
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

    it("keeps graphics compatibility opt-in and removable by a normal reinstall", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "one");

      const { stdout } = await runHelper(home, bin, [
        "install",
        "--compatibility",
        appImage,
      ]);

      expect(await readFile(owned(home).desktop, "utf8")).toContain(
        String.raw`Exec=env LIBGL_ALWAYS_SOFTWARE=1 sh -c "exec \\"\\$@\\"" sh "${owned(home).app}" --appimage-extract-and-run --ozone-platform=x11 --ignore-gpu-blocklist %U` +
          "\n",
      );
      expect(stdout).toContain("Compatibility mode");
      expect(stdout).toContain("slower");

      await runHelper(home, bin, ["install", appImage]);
      const normalDesktop = await readFile(owned(home).desktop, "utf8");
      expect(normalDesktop).not.toContain("LIBGL_ALWAYS_SOFTWARE");
      expect(normalDesktop).not.toContain("--ignore-gpu-blocklist");
      expect(normalDesktop).toContain(
        '" --appimage-extract-and-run --ozone-platform=x11 %U\n',
      );
    });

    it("matches a uniform Hyprland monitor scale without changing terminal preferences", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "one");
      await fakeHyprland(bin);
      const config = path.join(home, ".config/omxterm/config.json");
      await mkdir(path.dirname(config), { recursive: true });
      await writeFile(config, '{"version":1,"font":{"size":22}}\n');

      const { stdout } = await runHelper(home, bin, ["install", appImage], {
        HYPRLAND_INSTANCE_SIGNATURE: "fixture",
        OMXTERM_TEST_ZERO_SCALING: "bool: true\nset: true",
        OMXTERM_TEST_MONITORS:
          "Monitor One (ID 0):\n\tscale: 2.00\nMonitor Two (ID 1):\n\tscale: 2.0",
      });

      expect(await readFile(owned(home).desktop, "utf8")).toContain(
        '" --appimage-extract-and-run --ozone-platform=x11 --force-device-scale-factor=2 %U\n',
      );
      expect(stdout).toContain("Interface scale: 2x");
      expect(await readFile(config, "utf8")).toBe(
        '{"version":1,"font":{"size":22}}\n',
      );
    });

    it("refreshes fractional scaling and removes it when the session no longer supplies a scale", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "one");
      await fakeHyprland(bin);

      await runHelper(home, bin, ["install", "--compatibility", appImage], {
        HYPRLAND_INSTANCE_SIGNATURE: "fixture",
        OMXTERM_TEST_FUSE_MODE: "direct",
        OMXTERM_TEST_ZERO_SCALING: "int: 1\nset: true",
        OMXTERM_TEST_MONITORS: "Monitor One (ID 0):\n\tscale: 1.50",
      });
      expect(await readFile(owned(home).desktop, "utf8")).toContain(
        String.raw`Exec=env LIBGL_ALWAYS_SOFTWARE=1 sh -c "exec \\"\\$@\\"" sh "${owned(home).app}" --ozone-platform=x11 --ignore-gpu-blocklist --force-device-scale-factor=1.5 %U` +
          "\n",
      );

      await runHelper(home, bin, ["install", appImage]);
      expect(await readFile(owned(home).desktop, "utf8")).not.toContain(
        "--force-device-scale-factor",
      );
    });

    it.each([
      [
        "mixed scales",
        {
          OMXTERM_TEST_MONITORS:
            "Monitor One:\n scale: 2\nMonitor Two:\n scale: 1",
        },
      ],
      [
        "missing monitor scale",
        { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 2\nMonitor Two:" },
      ],
      [
        "duplicate monitor scale",
        { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 2\n scale: 2" },
      ],
      ["missing monitor header", { OMXTERM_TEST_MONITORS: "scale: 2" }],
      ["empty monitor report", { OMXTERM_TEST_MONITORS: "" }],
      ["normal scale", { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 1.00" }],
      ["negative scale", { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: -2" }],
      ["zero scale", { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 0" }],
      [
        "nonnumeric scale",
        { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: NaN" },
      ],
      [
        "argument injection",
        { OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 2 --disable-gpu" },
      ],
      [
        "desktop scaling enabled",
        { OMXTERM_TEST_ZERO_SCALING: "bool: false\nset: true" },
      ],
      ["malformed policy", { OMXTERM_TEST_ZERO_SCALING: "true" }],
      ["ambiguous policy", { OMXTERM_TEST_ZERO_SCALING: "bool: true\nint: 0" }],
      ["query timeout", { OMXTERM_TEST_QUERY_FAILURE: "true" }],
      ["no active session", { HYPRLAND_INSTANCE_SIGNATURE: "" }],
    ] satisfies [string, NodeJS.ProcessEnv][])(
      "leaves Electron scaling unchanged for %s",
      async (_condition, environment) => {
        const { root, home, bin } = await fixtureRoot();
        const appImage = await fakeAppImage(root, "one");
        await fakeHyprland(bin);

        await runHelper(home, bin, ["install", appImage], {
          HYPRLAND_INSTANCE_SIGNATURE: "fixture",
          OMXTERM_TEST_ZERO_SCALING: "bool: true",
          OMXTERM_TEST_MONITORS: "Monitor One:\n scale: 2",
          ...environment,
        });

        const desktop = await readFile(owned(home).desktop, "utf8");
        expect(desktop).not.toContain("--force-device-scale-factor");
        expect(desktop).toContain(
          '" --appimage-extract-and-run --ozone-platform=x11 %U\n',
        );
      },
    );

    it.each([
      [],
      ["install"],
      ["install", "--compatibility"],
      ["install", "one.AppImage", "two.AppImage"],
      ["uninstall", "--compatibility"],
      ["--version", "extra"],
      ["--help", "extra"],
    ])(
      "rejects invalid invocation %j without creating owned directories",
      async (...arguments_) => {
        const { home, bin } = await fixtureRoot();
        const result = runHelper(home, bin, arguments_);
        await expect(result).rejects.toMatchObject({ code: 2 });
        await expect(result).rejects.toThrow("Usage:");
        await expect(stat(path.join(home, ".local"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
    );
  },
);

describe.skipIf(process.platform === "win32")(
  "Linux AppImage installation transactions",
  () => {
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

    it.each(
      (["app", "icon", "desktop"] as const).flatMap((name) =>
        (["directory", "fifo"] as const).map((type) => [name, type] as const),
      ),
    )(
      "refuses a conflicting %s %s without replacing any installed entry",
      async (name, type) => {
        const { root, home, bin } = await fixtureRoot();
        const first = await fakeAppImage(root, "one");
        const second = await fakeAppImage(root, "two");
        await runHelper(home, bin, ["install", first]);
        const paths = owned(home);
        await rm(paths[name]);
        const sentinel = path.join(paths[name], "unrelated.txt");
        if (type === "directory") {
          await mkdir(paths[name]);
          await writeFile(sentinel, "keep\n");
        } else {
          await execFile("mkfifo", [paths[name]]);
        }
        const before = await Promise.all(
          Object.values(paths).map((file) => lstat(file)),
        );
        const previousFiles = await Promise.all(
          Object.entries(paths)
            .filter(([key]) => key !== name)
            .map(async ([, file]) => [file, await readFile(file)] as const),
        );

        const result = runHelper(home, bin, ["install", second]);
        await expect(result).rejects.toMatchObject({ code: 1 });
        await expect(result).rejects.toThrow(
          "expected a regular file or symlink",
        );

        if (type === "directory")
          expect(await readFile(sentinel, "utf8")).toBe("keep\n");
        const after = await Promise.all(
          Object.values(paths).map((file) => lstat(file)),
        );
        expect(
          after.map(({ ino, mode, mtimeMs }) => ({ ino, mode, mtimeMs })),
        ).toEqual(
          before.map(({ ino, mode, mtimeMs }) => ({ ino, mode, mtimeMs })),
        );
        for (const [file, contents] of previousFiles)
          expect(await readFile(file)).toEqual(contents);
      },
    );

    it.each(["file", "directory", "dangling"] as const)(
      "replaces and uninstalls symlink entries without touching their %s referent",
      async (type) => {
        const { root, home, bin } = await fixtureRoot();
        const appImage = await fakeAppImage(root, "one");
        const referent = path.join(root, "unrelated");
        const sentinel =
          type === "directory"
            ? path.join(referent, "unrelated.txt")
            : referent;
        if (type === "directory") await mkdir(referent);
        if (type !== "dangling") await writeFile(sentinel, "keep\n");
        const paths = owned(home);
        for (const file of Object.values(paths)) {
          await mkdir(path.dirname(file), { recursive: true });
          await symlink(referent, file);
        }

        await runHelper(home, bin, ["install", appImage]);

        expect(await readFile(paths.app)).toEqual(await readFile(appImage));
        expect(await readFile(paths.icon, "utf8")).toBe("icon-one\n");
        expect(await readFile(paths.desktop, "utf8")).toContain(
          "Name=OMXTerm\n",
        );
        for (const file of Object.values(paths)) {
          expect((await lstat(file)).isFile()).toBe(true);
          await rm(file);
          await symlink(referent, file);
        }
        await runHelper(home, bin, ["uninstall"]);
        for (const file of Object.values(paths))
          await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
        if (type === "dangling") {
          await expect(lstat(referent)).rejects.toMatchObject({
            code: "ENOENT",
          });
        } else {
          expect(await readFile(sentinel, "utf8")).toBe("keep\n");
        }
      },
    );

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
      await failingMoves(bin);

      await expect(
        runHelper(home, bin, ["install", appImage], {
          OMXTERM_TEST_FAIL_TARGET: paths.desktop,
        }),
      ).rejects.toThrow();

      for (const file of Object.values(paths))
        await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it.each(["app", "icon", "desktop"] as const)(
      "retains recoverable %s bytes and reports both failures when restoration fails",
      async (name) => {
        const { root, home, bin } = await fixtureRoot();
        const first = await fakeAppImage(root, "one");
        const second = await fakeAppImage(root, "two");
        await runHelper(home, bin, ["install", first]);
        const paths = owned(home);
        const before = await Promise.all(
          Object.values(paths).map((file) => readFile(file)),
        );
        await failingMoves(bin);

        const result = runHelper(home, bin, ["install", second], {
          OMXTERM_TEST_FAIL_TARGET: paths.desktop,
          OMXTERM_TEST_FAIL_RESTORE: paths[name],
        });
        await expect(result).rejects.toThrow("injected replacement failure");
        await expect(result).rejects.toThrow("injected restoration failure");
        await expect(stat(paths[name])).rejects.toMatchObject({
          code: "ENOENT",
        });
        for (const [index, file] of Object.values(paths).entries()) {
          if (file !== paths[name])
            expect(await readFile(file)).toEqual(before[index]);
          const backups = (await readdir(path.dirname(file))).filter((entry) =>
            entry.includes("-backup."),
          );
          if (file !== paths[name]) expect(backups).toEqual([]);
        }
        const backups = (await readdir(path.dirname(paths[name]))).filter(
          (entry) => entry.includes("-backup."),
        );
        expect(backups).toHaveLength(1);
        const backup = path.join(
          path.dirname(paths[name]),
          backups[0]!,
          "previous",
        );
        expect(await readFile(backup)).toEqual(
          before[Object.keys(paths).indexOf(name)],
        );
        await expect(result).rejects.toThrow(backup);
        await expect(result).rejects.toMatchObject({ code: 70 });
        await expect(result).rejects.toThrow("recovery incomplete");
        await expect(result).rejects.not.toThrow(
          "previous installation was restored",
        );
      },
    );

    it("rolls back every owned file when a replacement fails", async () => {
      const { root, home, bin } = await fixtureRoot();
      const first = await fakeAppImage(root, "one");
      const second = await fakeAppImage(root, "two");
      await runHelper(home, bin, ["install", first]);
      const before = await Promise.all(
        Object.values(owned(home)).map((file) => readFile(file, "utf8")),
      );
      await failingMoves(bin);
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
      for (const file of Object.values(paths)) {
        expect(
          (await readdir(path.dirname(file))).filter((entry) =>
            entry.startsWith(".omxterm-"),
          ),
        ).toEqual([]);
      }
    });
  },
);
