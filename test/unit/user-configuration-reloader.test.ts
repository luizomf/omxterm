import { describe, expect, it, vi } from "vitest";
import {
  createUserConfigurationReloader,
  type ActiveUserConfiguration,
} from "../../src/main/user-configuration-reloader";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  UserConfigurationError,
  type LoadedUserConfiguration,
  type UserConfigurationLoad,
} from "../../src/main/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function configuration(
  name: string,
  overrides: Partial<LoadedUserConfiguration> = {},
): LoadedUserConfiguration {
  return Object.freeze({
    ...DEFAULT_USER_CONFIGURATION,
    terminalTheme: Object.freeze({
      ...DEFAULT_TERMINAL_THEME,
      name,
      colors: Object.freeze({
        ...DEFAULT_TERMINAL_THEME.colors,
        background: name === "initial" ? "#111111" : "#222222",
      }),
    }),
    ...overrides,
  });
}

function valid(
  load: LoadedUserConfiguration,
  warnings: readonly string[] = [],
): UserConfigurationLoad {
  return Object.freeze({ configuration: load, warnings });
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function harness(load: () => Promise<UserConfigurationLoad>) {
  const initial: ActiveUserConfiguration = {
    configuration: configuration("initial", {
      confirmClose: true,
      alwaysOnTop: true,
      logLevel: "debug",
      blur: true,
      transparency: 0.625,
      windowsShell: "C:\\initial\\shell.exe",
    }),
    userFileErrors: ["stale startup notice"],
  };
  const apply = vi.fn();
  const write = vi.fn(() => true);
  const setLevel = vi.fn();
  const writeStderr = vi.fn();
  const reloader = createUserConfigurationReloader({
    initial,
    load,
    apply,
    operationalEvents: { write, setLevel },
    writeStderr,
    now: (() => {
      let value = 10;
      return () => value++;
    })(),
  });
  return { reloader, initial, apply, write, setLevel, writeStderr };
}

describe("User Configuration reloader", () => {
  it("loads effects resiliently at startup and keeps the whole last snapshot after an invalid effects reload", async () => {
    let document = {
      version: 1,
      font: { size: 24 },
      window: { blur: true, transparency: 2 },
    };
    const load = () =>
      loadUserConfiguration({
        environment: {},
        homeDirectory: "/fixture",
        getInstalledFontFamilyMetrics: async () => undefined,
        read: vi
          .fn()
          .mockImplementation(async () =>
            Buffer.from(JSON.stringify(document)),
          ),
      });
    const startup = await load();
    expect(startup.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(startup.fallback?.error.location).toBe("window.transparency");
    const apply = vi.fn();
    const reloader = createUserConfigurationReloader({
      initial: { configuration: startup.configuration, userFileErrors: [] },
      load,
      apply,
    });
    document.window.transparency = 0.375;
    await reloader.reload();
    const accepted = reloader.current().configuration;
    expect(accepted).toMatchObject({
      blur: true,
      transparency: 0.375,
      fontSize: 24,
    });
    document = {
      version: 1,
      font: { size: 32 },
      window: { blur: false, transparency: -1 },
    };
    await reloader.reload();
    expect(reloader.current().configuration).toBe(accepted);
    expect(reloader.current().userFileErrors[0]).toContain(
      "window.transparency",
    );
    expect(apply).toHaveBeenLastCalledWith(reloader.current(), false);
    document.window.transparency = 1;
    await reloader.reload();
    expect(reloader.current().configuration).toMatchObject({
      blur: false,
      transparency: 1,
      fontSize: 32,
    });
    expect(reloader.current().userFileErrors).toEqual([]);
  });

  it("runs exactly one complete supplied load and atomically replaces settings and notices", async () => {
    const next = configuration("next", {
      confirmClose: false,
      alwaysOnTop: false,
      logLevel: "error",
      blur: false,
      transparency: 0.25,
      fontSize: 42,
      scrollbackLines: 7,
      windowsShell: "C:\\next\\shell.exe",
    });
    const load = vi.fn(async () => valid(next, ["current warning"]));
    const { reloader, apply, setLevel, write } = harness(load);

    await reloader.reload();

    expect(load).toHaveBeenCalledOnce();
    expect(reloader.current()).toEqual({
      configuration: next,
      userFileErrors: ["current warning"],
    });
    expect(reloader.current().configuration.windowsShell).toBe(
      "C:\\next\\shell.exe",
    );
    expect(apply).toHaveBeenCalledExactlyOnceWith(reloader.current(), true);
    expect(setLevel).toHaveBeenCalledExactlyOnceWith("error");
    expect(write.mock.calls).toEqual([
      [
        {
          name: "configuration.reload.requested",
          trigger: "manual",
          durationMs: 0,
        },
      ],
      [
        {
          name: "configuration.reload.succeeded",
          trigger: "manual",
          durationMs: 1,
        },
      ],
    ]);
  });

  it("rejects the whole load, preserves every active setting, and reports only bounded current detail", async () => {
    const privatePath = "/Users/private/.config/omxterm/config.json";
    const fallback = {
      surface: "configuration" as const,
      error: new UserConfigurationError(
        privatePath,
        "font.size",
        "must be from 8 through 72",
      ),
    };
    const { reloader, initial, apply, write, setLevel, writeStderr } = harness(
      vi.fn(async () => ({
        configuration: configuration("partial", { confirmClose: false }),
        fallback,
      })),
    );

    await reloader.reload();

    expect(reloader.current().configuration).toBe(initial.configuration);
    expect(reloader.current().configuration.windowsShell).toBe(
      "C:\\initial\\shell.exe",
    );
    expect(reloader.current().configuration).toMatchObject({
      blur: true,
      transparency: 0.625,
    });
    expect(reloader.current().userFileErrors).toHaveLength(1);
    expect(reloader.current().userFileErrors[0]).toContain(privatePath);
    expect(reloader.current().userFileErrors[0]).toContain("font.size");
    expect(reloader.current().userFileErrors[0]).toContain(
      "Reload User Configuration",
    );
    expect(apply).toHaveBeenCalledExactlyOnceWith(reloader.current(), false);
    expect(setLevel).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      `${reloader.current().userFileErrors[0]}\n`,
    );
    const events = JSON.stringify(write.mock.calls);
    expect(events).toContain("invalid-schema");
    expect(events).not.toContain(privatePath);
    expect(events).not.toContain("font.size");
  });

  it("recovers from startup and reload errors with current warnings, then accepts absent-file defaults", async () => {
    const corrected = configuration("corrected");
    const load = vi
      .fn<() => Promise<UserConfigurationLoad>>()
      .mockResolvedValueOnce({
        configuration: DEFAULT_USER_CONFIGURATION,
        fallback: {
          surface: "configuration",
          error: new UserConfigurationError(
            "/private/config.json",
            undefined,
            "the file is not valid JSON",
          ),
        },
      })
      .mockResolvedValueOnce(valid(corrected, ["new warning"]))
      .mockResolvedValueOnce(valid(DEFAULT_USER_CONFIGURATION));
    const { reloader } = harness(load);

    await reloader.reload();
    await reloader.reload();
    expect(reloader.current()).toEqual({
      configuration: corrected,
      userFileErrors: ["new warning"],
    });

    await reloader.reload();
    expect(reloader.current()).toEqual({
      configuration: DEFAULT_USER_CONFIGURATION,
      userFileErrors: [],
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("names changed Terminal Surface restart-only settings and clears the notice when reverted", async () => {
    const initial = configuration("initial", {
      fontFamily: "Initial Family",
      fontLineHeight: 1,
      fontLigatures: true,
    });
    const load = vi
      .fn<() => Promise<UserConfigurationLoad>>()
      .mockResolvedValueOnce(
        valid(
          configuration("changed", {
            fontFamily: "Changed Family",
            fontLineHeight: 1.25,
            fontLigatures: false,
            fontSize: 24,
          }),
        ),
      )
      .mockResolvedValueOnce(valid(initial))
      .mockResolvedValueOnce(valid({ ...initial, fontLigatures: false }));
    const apply = vi.fn();
    const reloader = createUserConfigurationReloader({
      initial: { configuration: initial, userFileErrors: [] },
      load,
      apply,
      terminalSurfaceFontBaseline: {
        fontFamily: "Initial Family",
        fontLineHeight: 1,
      },
    });

    await reloader.reload();
    expect(reloader.current().configuration.fontSize).toBe(24);
    expect(reloader.current().configuration.fontLigatures).toBe(false);
    expect(reloader.current().userFileErrors).toEqual([
      expect.stringContaining("font.family and font.lineHeight"),
    ]);
    expect(reloader.current().userFileErrors[0]).toBe(
      "Existing Terminal Surfaces continue using their previous font.family and font.lineHeight values. Restart OMXTerm to apply them everywhere; new tabs and windows use the latest validated values.",
    );

    await reloader.reload();
    expect(reloader.current().userFileErrors).toEqual([]);
    expect(apply).toHaveBeenCalledTimes(2);

    await reloader.reload();
    expect(reloader.current().configuration.fontLigatures).toBe(false);
    expect(reloader.current().userFileErrors).toEqual([]);
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("keeps the restart notice when Surfaces from multiple font generations remain live", async () => {
    const initial = configuration("initial", {
      fontFamily: "Initial Family",
      fontLineHeight: 1,
      fontLigatures: true,
    });
    const changed = configuration("changed", {
      fontFamily: "Changed Family",
      fontLineHeight: 1.25,
      fontLigatures: true,
    });
    const load = vi
      .fn<() => Promise<UserConfigurationLoad>>()
      .mockResolvedValueOnce(valid(changed))
      .mockResolvedValueOnce(valid(initial));
    const activeSurfaces = [
      { fontFamily: "Initial Family", fontLineHeight: 1 },
    ];
    const reloader = createUserConfigurationReloader({
      initial: { configuration: initial, userFileErrors: [] },
      load,
      apply: vi.fn(),
      terminalSurfaceFontBaseline: {
        fontFamily: "Initial Family",
        fontLineHeight: 1,
      },
      activeTerminalSurfaceFontConfigurations: () => activeSurfaces,
    });

    await reloader.reload();
    activeSurfaces.push({
      fontFamily: "Changed Family",
      fontLineHeight: 1.25,
    });
    await reloader.reload();

    expect(reloader.current().userFileErrors).toEqual([
      expect.stringContaining("font.family and font.lineHeight"),
    ]);
  });

  it("serializes repeated requests so later successful state cannot be lost", async () => {
    const first = deferred<UserConfigurationLoad>();
    const second = deferred<UserConfigurationLoad>();
    const load = vi
      .fn<() => Promise<UserConfigurationLoad>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { reloader, apply } = harness(load);

    const firstRequest = reloader.reload();
    const secondRequest = reloader.reload();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    first.resolve(valid(configuration("first")));
    await firstRequest;
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    second.resolve(valid(configuration("latest")));
    await secondRequest;

    expect(reloader.current().configuration.terminalTheme.name).toBe("latest");
    const appliedStates = apply.mock.calls as unknown as readonly (readonly [
      ActiveUserConfiguration,
      boolean,
    ])[];
    expect(
      appliedStates.map(([state]) => state.configuration.terminalTheme.name),
    ).toEqual(["first", "latest"]);
  });
});

describe("User Configuration reload outcomes", () => {
  it("reports whether each reload was applied, rejected or failed while applying", async () => {
    const loads = [
      async () => valid(configuration("applied"), ["kept warning"]),
      async () => ({
        configuration: DEFAULT_USER_CONFIGURATION,
        fallback: {
          surface: "configuration" as const,
          error: new UserConfigurationError(
            "/config.json",
            "font.size",
            "is invalid",
          ),
        },
      }),
      async () => valid(configuration("throws")),
    ];
    const { reloader, apply } = harness(() => loads.shift()!());

    await expect(reloader.reload()).resolves.toEqual({
      applied: true,
      notices: ["kept warning"],
    });
    const rejected = await reloader.reload();
    expect(rejected).toMatchObject({ applied: false });
    expect(rejected.applied === false && rejected.notice).toMatch(
      /font\.size.*is invalid/u,
    );
    apply.mockImplementationOnce(() => {
      throw new Error("consumer failed");
    });
    await expect(reloader.reload()).resolves.toMatchObject({ applied: false });
  });
});
