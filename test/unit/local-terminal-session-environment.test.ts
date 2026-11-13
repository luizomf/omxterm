import type { IPty } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import { captureChromiumStartupVariables } from "../../src/main/chromium-startup-environment";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";

const capabilityIdentity = {
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  TERM_PROGRAM: "OMXTerm",
  TERM_PROGRAM_VERSION: "1.2.3",
};

// Opens a session and returns the environment its shell received.
function sessionEnvironment(
  platform: string,
  environment: NodeJS.ProcessEnv,
  options: Pick<
    Parameters<typeof createLocalTerminalSession>[1],
    "chromiumStartupVariables" | "agentEnvironment"
  > = {},
): NodeJS.ProcessEnv | undefined {
  const pty = {
    onData: () => ({ dispose: vi.fn() }),
    onExit: () => ({ dispose: vi.fn() }),
  } as unknown as IPty;
  const spawn = vi.fn<SpawnPty>(() => pty);
  createLocalTerminalSession(spawn, {
    shell: "/bin/example-shell",
    platform,
    homeDirectory: "/home/example",
    applicationVersionProvider: { getVersion: () => "1.2.3" },
    environment,
    ...options,
    onOutput: vi.fn(),
    onExit: vi.fn(),
  });
  return spawn.mock.calls[0]?.[2].env;
}

describe("local PTY Adapter environment under an AppImage", () => {
  const appDir = "/tmp/.mount_OMXTerAbc123";
  // What the AppImage runtime and AppRun hand to OMXTerm on top of the
  // user's environment.
  function appImageEnvironment(user: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const prepend = (name: string, entries: string) => ({
      [name]: user[name] ? `${entries}:${user[name]}` : entries,
    });
    return {
      ...user,
      APPIMAGE: "/home/example/OMXTerm.AppImage",
      APPDIR: appDir,
      ARGV0: "/home/example/OMXTerm.AppImage",
      OWD: "/home/example",
      CHROME_DESKTOP: "omxterm.desktop",
      ...prepend("PATH", `${appDir}:${appDir}/usr/sbin`),
      ...prepend("LD_LIBRARY_PATH", `${appDir}/usr/lib`),
      ...prepend(
        "GSETTINGS_SCHEMA_DIR",
        `${appDir}/usr/share/glib-2.0/schemas`,
      ),
      XDG_DATA_DIRS: [
        `${appDir}/usr/share/`,
        ...(user["XDG_DATA_DIRS"] ? [user["XDG_DATA_DIRS"]] : []),
        "/usr/share/gnome:/usr/local/share/:/usr/share/",
      ].join(":"),
    };
  }

  it("gives the shell the user's environment without the AppImage runtime", () => {
    const user = {
      HOME: "/home/example",
      PATH: `/home/example/bin:${appDir}-other/bin::/usr/bin`,
      LD_LIBRARY_PATH: "/opt/example/lib",
      XDG_DATA_DIRS: "/var/lib/flatpak/exports/share:/usr/share",
      GSETTINGS_SCHEMA_DIR: "/opt/example/schemas",
    };
    const inherited = appImageEnvironment(user);
    const inheritedCopy = { ...inherited };

    expect(sessionEnvironment("linux", inherited)).toEqual({
      ...user,
      ...capabilityIdentity,
    });
    // Display relaunch still reads APPIMAGE and APPDIR from main's own
    // environment, so the PTY copy must not change it.
    expect(inherited).toEqual(inheritedCopy);
  });

  it("leaves search lists unset when only AppImage entries were present", () => {
    const env = sessionEnvironment(
      "linux",
      appImageEnvironment({ HOME: "/home/example", PATH: "/usr/bin" }),
    );

    expect(env).toEqual({
      HOME: "/home/example",
      PATH: "/usr/bin",
      ...capabilityIdentity,
    });
    expect(env).not.toHaveProperty("LD_LIBRARY_PATH");
    expect(env).not.toHaveProperty("XDG_DATA_DIRS");
  });

  it("keeps the environment unchanged outside an AppImage", () => {
    const user = {
      PATH: "/opt/example/bin:/usr/bin",
      LD_LIBRARY_PATH: "/opt/example/lib",
      CHROME_DESKTOP: "code.desktop",
    };

    expect(sessionEnvironment("linux", user)).toEqual({
      ...user,
      ...capabilityIdentity,
    });
  });

  it.each(["darwin", "win32"])(
    "keeps the environment unchanged on %s",
    (platform) => {
      const inherited = appImageEnvironment({ PATH: "/usr/bin" });

      expect(sessionEnvironment(platform, inherited)).toEqual({
        ...inherited,
        ...capabilityIdentity,
      });
    },
  );
});

describe("local PTY Adapter environment after Chromium startup", () => {
  // Starts OMXTerm main with the user's environment the way Chromium does on
  // Linux, then opens a shell and returns the environment it received.
  function shellEnvironment(
    user: NodeJS.ProcessEnv,
    ozonePlatform: "x11" | "wayland",
    platform = "linux",
    // GTK initialization sets NO_AT_BRIDGE=1 once main's module code has run.
    afterMainStart = (main: NodeJS.ProcessEnv) => {
      main["NO_AT_BRIDGE"] = "1";
    },
  ): NodeJS.ProcessEnv | undefined {
    // Before any application code runs, Chromium sets FC_FONTATIONS=1 and,
    // on Wayland, EGL_PLATFORM=wayland unless the user had a value.
    const main: NodeJS.ProcessEnv = { ...user };
    if (platform === "linux") {
      main["FC_FONTATIONS"] = "1";
      if (ozonePlatform === "wayland") main["EGL_PLATFORM"] ??= "wayland";
    }
    const variables = captureChromiumStartupVariables(
      main,
      platform,
      ozonePlatform,
    );
    if (platform === "linux") afterMainStart(main);

    return sessionEnvironment(platform, main, {
      chromiumStartupVariables: variables,
    });
  }

  it.each(["x11", "wayland"] as const)(
    "drops what Chromium added on %s",
    (ozonePlatform) => {
      const user = { HOME: "/home/example", PATH: "/usr/bin" };

      expect(shellEnvironment(user, ozonePlatform)).toEqual({
        ...user,
        ...capabilityIdentity,
      });
    },
  );

  it.each(["x11", "wayland"] as const)(
    "keeps the user's own values on %s",
    (ozonePlatform) => {
      const user = {
        PATH: "/usr/bin",
        NO_AT_BRIDGE: "0",
        EGL_PLATFORM: "surfaceless",
      };

      expect(shellEnvironment(user, ozonePlatform)).toEqual({
        ...user,
        ...capabilityIdentity,
      });
    },
  );

  it("keeps a user's EGL_PLATFORM=wayland when OMXTerm starts on X11", () => {
    const user = { PATH: "/usr/bin", EGL_PLATFORM: "wayland" };

    expect(shellEnvironment(user, "x11")).toEqual({
      ...user,
      ...capabilityIdentity,
    });
  });

  it("restores a user's NO_AT_BRIDGE that Chromium later removed", () => {
    const user = { PATH: "/usr/bin", NO_AT_BRIDGE: "1" };
    // Chromium's accessibility support unsets it once it starts the bridge.
    const env = shellEnvironment(user, "x11", "linux", (main) => {
      delete main["NO_AT_BRIDGE"];
    });

    expect(env).toEqual({ ...user, ...capabilityIdentity });
  });

  it.each(["darwin", "win32"])(
    "keeps the environment unchanged on %s",
    (platform) => {
      const user = {
        PATH: "/usr/bin",
        NO_AT_BRIDGE: "1",
        FC_FONTATIONS: "1",
        EGL_PLATFORM: "wayland",
      };

      expect(shellEnvironment(user, "x11", platform)).toEqual({
        ...user,
        ...capabilityIdentity,
      });
    },
  );
});

describe("local PTY Adapter environment for the agent API", () => {
  const inherited = {
    HOME: "/home/example",
    OMXTERM_CTL: "/other/omxterm-ctl",
    OMXTERM_PROFILE: "/other/profile",
    OMXTERM_PANE: "9:s9",
  };

  it("names this OMXTerm's client, profile and pane, over any inherited values", () => {
    const agentEnvironment = {
      OMXTERM_CTL:
        "/Applications/OMXTerm.app/Contents/Resources/agent-ctl/omxterm-ctl",
      OMXTERM_PROFILE: "/home/example/profile",
      OMXTERM_PANE: "3:s4",
    };
    expect(
      sessionEnvironment("darwin", inherited, { agentEnvironment }),
    ).toEqual({
      HOME: "/home/example",
      ...agentEnvironment,
      ...capabilityIdentity,
    });
  });

  it("drops another OMXTerm's values when this one sets none", () => {
    expect(sessionEnvironment("win32", inherited)).toEqual({
      HOME: "/home/example",
      ...capabilityIdentity,
    });
  });
});
