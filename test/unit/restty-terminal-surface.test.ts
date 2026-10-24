// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import {
  cancellationBridge,
  deferred,
} from "../fixtures/initialization-cancellation-harness";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

function createAdapter() {
  let handlers: TerminalSessionHandlers | undefined;
  return {
    adapter: {
      start: vi.fn(async (next: TerminalSessionHandlers) => {
        handlers = next;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    },
    handlers: () => handlers!,
  };
}

describe("Restty Terminal Surface", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
  });

  it("rejects a configured family without a font provider before starting a session", async () => {
    const { adapter } = createAdapter();
    await expect(
      mountResttyTerminalSurface(document.createElement("main"), adapter, {
        appearance: {
          systemFont: { family: "Requested Native Family", available: true },
        },
      }),
    ).rejects.toThrow("Failed to mount the OMXTerm Terminal Surface");
    expect(adapter.start).not.toHaveBeenCalled();
    expect(harness.instances).toHaveLength(0);
  });

  it("delivers parser replies while the Adapter replays owned startup output", async () => {
    const { adapter } = createAdapter();
    adapter.start.mockImplementation(async (handlers) => {
      const restty = harness.instances[0]!;
      const transport = (
        restty.options.services as {
          ptyTransport: { sendInput(data: string): boolean };
        }
      ).ptyTransport;
      restty.sendInput.mockImplementation((data: string) => {
        if (data === "\u001b[c") transport.sendInput("\u001b[?1;2c");
      });
      handlers.onOutput("\u001b[c");
    });
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    expect(adapter.write).toHaveBeenCalledExactlyOnceWith("\u001b[?1;2c");
    surface.dispose();
  });

  it("destroys renderer resources even when Adapter close fails", async () => {
    const { adapter } = createAdapter();
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    adapter.close.mockImplementation(() => {
      throw new Error("close failed");
    });
    expect(() => surface.dispose()).toThrow("close failed");
    expect(harness.instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(() => surface.dispose()).not.toThrow();
  });

  it("preserves initialization and cleanup failure context while releasing resources", async () => {
    const { adapter } = createAdapter();
    const initial = new Error("font initialization failed");
    const cleanup = new Error("close failed");
    harness.setInitError(initial);
    adapter.close.mockImplementation(() => {
      throw cleanup;
    });
    const error = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).message).toBe(
      "Failed to mount and clean the OMXTerm Terminal Surface",
    );
    expect((error as AggregateError).errors).toContain(initial);
    expect((error as AggregateError).errors).toContain(cleanup);
    expect(harness.instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(adapter.start).not.toHaveBeenCalled();
  });

  it("requires a font, core, and WebGL backend before starting the PTY", async () => {
    const { adapter, handlers } = createAdapter();
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    const restty = harness.instances[0]!;
    const terminal = restty.options.terminal as Record<string, unknown>;

    expect(terminal.renderer).toBe("webgl2");
    const fonts = terminal.fonts as Array<{
      data: Uint8Array;
      name: string;
    }>;
    expect(fonts).toHaveLength(5);
    expect(fonts.every((font) => font.data instanceof Uint8Array)).toBe(true);
    expect(fonts.map((font) => font.name)).toEqual([
      "FiraCode Nerd Font Mono",
      "FiraCode Nerd Font Mono Bold",
      "DejaVu Sans Mono",
      "DejaVu Sans Mono Bold",
      "JetBrainsMono Nerd Font Mono",
    ]);
    expect(adapter.start).toHaveBeenCalledOnce();
    expect(adapter.resize).toHaveBeenLastCalledWith({ cols: 96, rows: 31 });

    handlers().onOutput("Olá🙂");
    expect(restty.sendInput).toHaveBeenCalledWith("Olá🙂", "pty");
    const transport = (
      restty.options.services as {
        ptyTransport: { sendInput(data: string): boolean };
      }
    ).ptyTransport;
    expect(transport.sendInput("digitado 世界")).toBe(true);
    expect(adapter.write).toHaveBeenCalledWith("digitado 世界");

    surface.focus();
    expect(restty.focus).toHaveBeenCalledOnce();
    surface.dispose();
    surface.dispose();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(restty.destroy).toHaveBeenCalledOnce();
  });

  it("applies live runtime options without replacing the PTY", async () => {
    const { adapter } = createAdapter();
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
      { appearance: { ligatures: false }, optionKeyMode: "left" },
    );
    const restty = harness.instances[0]!;

    expect(restty.options).toMatchObject({
      terminal: { ligatures: false, optionKeyMode: "left" },
    });
    surface.applyConfiguration({
      appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "right",
      theme: DEFAULT_TERMINAL_THEME,
    });

    expect(restty.setLigatures).toHaveBeenCalledExactlyOnceWith(true);
    expect(restty.setOptionKeyMode).toHaveBeenCalledExactlyOnceWith("right");
    expect(harness.instances).toHaveLength(1);
    expect(adapter.start).toHaveBeenCalledOnce();
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it("forwards parsed title and bell events once and ignores them after disposal", async () => {
    const { adapter } = createAdapter();
    const onTitleRequest = vi.fn();
    const onBell = vi.fn();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
      { onTitleRequest, onBell },
    );
    const restty = harness.instances[0]!;

    restty.emit({ type: "title", title: "parsed title" });
    restty.emit({ type: "bell" });

    expect(onTitleRequest).toHaveBeenCalledExactlyOnceWith("parsed title");
    expect(onBell).toHaveBeenCalledOnce();

    surface.dispose();
    restty.emit({ type: "title", title: "late private title" });
    restty.emit({ type: "bell" });
    expect(onTitleRequest).toHaveBeenCalledOnce();
    expect(onBell).toHaveBeenCalledOnce();
  });

  it("releases partial resources and starts no PTY when initialization fails", async () => {
    harness.setInitError(new Error("font unavailable"));
    const { adapter } = createAdapter();
    const onFatalError = vi.fn();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");

    await expect(
      mountResttyTerminalSurface(document.createElement("main"), adapter, {
        onFatalError,
      }),
    ).rejects.toThrow(/OMXTerm Terminal Surface/u);

    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(harness.instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(onFatalError).toHaveBeenCalledWith(
      "Failed to initialize the OMXTerm Terminal Surface: font unavailable",
    );
  });

  it("reports backend loss and ends only its owning Surface without recreation", async () => {
    const { adapter } = createAdapter();
    const onFatalError = vi.fn();
    const container = document.createElement("main");
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    await mountResttyTerminalSurface(container, adapter, { onFatalError });
    const restty = harness.instances[0]!;

    const loss = new Event("webglcontextlost", { cancelable: true });
    restty.canvas.dispatchEvent(loss);
    restty.canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );

    expect(loss.defaultPrevented).toBe(true);
    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      "The OMXTerm Terminal Surface rendering backend was lost",
    );
    expect(adapter.close).toHaveBeenCalledExactlyOnceWith("rendering-failure");
    expect(restty.destroy).toHaveBeenCalledOnce();
  });
});

describe("cancelled tab initialization through the production host and Adapter", () => {
  it.each([
    "fonts",
    "runtime",
    "startup",
    "fonts-rejection",
    "runtime-rejection",
    "startup-rejection",
  ] as const)("keeps A usable after closing B at %s", async (boundary) => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
    harness.setInitGate(undefined);
    const gate = deferred();
    const startup = boundary.startsWith("startup");
    const { bridge, outputs, exits } = cancellationBridge(
      startup ? gate.promise : undefined,
    );
    const onSurfaceFailure = vi.fn();
    const released = [vi.fn(), vi.fn()];
    let command!: (value: TerminalTabCommand) => void;
    let mounts = 0;
    let settled = 0;
    const tabStrip = document.createElement("nav");
    const tabsContainer = document.createElement("div");
    document.body.replaceChildren(tabStrip, tabsContainer);
    const page = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        createAdapter: () => createElectronTerminalAdapter(bridge),
        onSurfaceFailure,
        subscribeToTabCommands(listener) {
          command = listener;
          return () => {};
        },
        async mount(container, adapter, options) {
          const index = mounts++;
          try {
            return await mountResttyTerminalSurface(container, adapter, {
              ...options,
              async acquireFontInputs() {
                if (index === 1 && boundary.startsWith("fonts"))
                  await gate.promise;
                return { fonts: [], release: released[index]! };
              },
            });
          } finally {
            settled += 1;
          }
        },
      },
    );
    try {
      await page.ready;
      const a = harness.instances[0]!;
      if (boundary.startsWith("runtime")) harness.setInitGate(gate.promise);
      command({ action: "new" });
      await vi.waitFor(() => {
        if (startup) expect(bridge.start).toHaveBeenCalledTimes(2);
        else if (boundary.startsWith("runtime"))
          expect(harness.instances[1]!.state).toBe("initializing");
        else expect(mounts).toBe(2);
      });
      const bBeforeClose = harness.instances[1];
      const lateListeners = [...(bBeforeClose?.listeners ?? [])];
      command({ action: "close" });
      expect(tabsContainer.children).toHaveLength(1);
      for (const listener of lateListeners) {
        listener({ type: "title", title: "cancelled owner" });
        listener({ type: "bell" });
      }
      if (bBeforeClose) {
        expect(
          bBeforeClose.options.services.ptyTransport.sendInput(
            "cancelled input",
          ),
        ).toBe(false);
        bBeforeClose.canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        );
      }
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      if (boundary.endsWith("rejection"))
        gate.reject(new Error("late initialization rejection"));
      else gate.resolve();
      await vi.waitFor(() => expect(settled).toBe(2));
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      expect(bridge.start).toHaveBeenCalledTimes(startup ? 2 : 1);
      expect(bridge.close.mock.calls).toEqual(
        startup && boundary !== "startup-rejection" ? [["s2", undefined]] : [],
      );
      expect(released[1]).toHaveBeenCalledTimes(
        boundary === "fonts-rejection" ? 0 : 1,
      );
      expect(released[0]).not.toHaveBeenCalled();
      const b = harness.instances[1];
      if (b) {
        expect(b.destroy).toHaveBeenCalledOnce();
        expect(b.listeners.size).toBe(0);
        b.emit({ type: "bell" });
        b.canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        );
        expect(b.options.services.ptyTransport.sendInput("late")).toBe(false);
      }
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      expect(outputs.size).toBe(1);
      expect(exits.size).toBe(1);
      expect(a.destroy).not.toHaveBeenCalled();
      expect(
        a.options.services.ptyTransport.sendInput("A remains usable"),
      ).toBe(true);
      expect(bridge.input).toHaveBeenCalledExactlyOnceWith(
        "s1",
        "A remains usable",
      );
      for (const output of outputs) output("s1", "healthy output", 14);
      expect(a.sendInput).toHaveBeenCalledWith("healthy output", "pty");
    } finally {
      gate.resolve();
      harness.setInitGate(undefined);
      page.dispose();
    }
    expect(released[0]).toHaveBeenCalledOnce();
    expect(outputs.size).toBe(0);
    expect(exits.size).toBe(0);
  });
});

function hex(rgb: string) {
  const value = Number.parseInt(rgb.slice(1), 16);
  return { r: value >> 16, g: (value >> 8) & 0xff, b: value & 0xff };
}

function expectedTheme(theme = DEFAULT_TERMINAL_THEME) {
  const { colors } = theme;
  return {
    name: theme.name,
    colors: {
      background: hex(colors.background),
      foreground: hex(colors.foreground),
      cursor: hex(colors.cursor),
      selectionBackground: hex(colors.selectionBackground),
      selectionForeground: hex(colors.selectionForeground),
      palette: Object.assign(
        new Array(256),
        [
          colors.black,
          colors.red,
          colors.green,
          colors.yellow,
          colors.blue,
          colors.magenta,
          colors.cyan,
          colors.white,
          colors.brightBlack,
          colors.brightRed,
          colors.brightGreen,
          colors.brightYellow,
          colors.brightBlue,
          colors.brightMagenta,
          colors.brightCyan,
          colors.brightWhite,
        ].map(hex),
      ),
    },
    raw: {},
  };
}

describe("Restty Terminal Surface appearance", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
  });

  it("creates the runtime with OMXTerm theme, size, independent line height, and padding", async () => {
    const container = document.createElement("main");
    const { adapter } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");

    await mountResttyTerminalSurface(container, adapter, {
      appearance: { fontSize: 8, lineHeight: 2, ligatures: true },
      padding: { top: 0, right: 128, bottom: 128, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
    });

    expect(harness.instances[0]?.options).toMatchObject({
      terminal: {
        fontSize: 8,
        lineHeight: 2,
        ligatures: true,
        theme: expectedTheme(),
      },
    });
    expect(container.style.getPropertyValue("--terminal-padding-top")).toBe(
      "0px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-right")).toBe(
      "128px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-bottom")).toBe(
      "128px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-left")).toBe(
      "0px",
    );
    expect(container.style.getPropertyValue("--terminal-background")).toBe(
      DEFAULT_TERMINAL_THEME.colors.background,
    );
  });

  it.each([undefined, 0, 1, 2_000, 100_000])(
    "applies scrollback.lines %s at creation through the Restty core",
    async (scrollbackLines) => {
      const { adapter } = createAdapter();
      const { mountResttyTerminalSurface } =
        await import("../../src/terminal-surface/restty-terminal-surface");

      await mountResttyTerminalSurface(
        document.createElement("main"),
        adapter,
        {
          ...(scrollbackLines === undefined ? {} : { scrollbackLines }),
        },
      );

      expect(
        (
          harness.instances[0]!.options.terminal as {
            scrollbackLines: number;
            maxScrollbackBytes: number;
          }
        ).scrollbackLines,
      ).toBe(scrollbackLines ?? 10_000);
      expect(
        (
          harness.instances[0]!.options.terminal as {
            maxScrollbackBytes: number;
          }
        ).maxScrollbackBytes,
      ).toBe(10_000_000);
    },
  );

  it("applies valid live scrollback changes without replacing the runtime or PTY", async () => {
    const container = document.createElement("main");
    const { adapter } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const surface = await mountResttyTerminalSurface(container, adapter, {
      scrollbackLines: 2_000,
    });
    const restty = harness.instances[0]!;

    for (const scrollbackLines of [1, 0, 100_000])
      surface.applyConfiguration({
        appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
        padding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines,
        optionKeyMode: "none",
        theme: DEFAULT_TERMINAL_THEME,
      });

    expect(restty.setScrollbackLines.mock.calls).toEqual([[1], [0], [100_000]]);
    expect(harness.instances).toHaveLength(1);
    expect(adapter.start).toHaveBeenCalledOnce();
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it("keeps live scrollback mutation isolated to its owning Surface", async () => {
    const firstAdapter = createAdapter();
    const secondAdapter = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const first = await mountResttyTerminalSurface(
      document.createElement("main"),
      firstAdapter.adapter,
      { scrollbackLines: 2_000 },
    );
    await mountResttyTerminalSurface(
      document.createElement("main"),
      secondAdapter.adapter,
      { scrollbackLines: 2_000 },
    );

    first.applyConfiguration({
      appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 1,
      optionKeyMode: "none",
      theme: DEFAULT_TERMINAL_THEME,
    });

    expect(harness.instances[0]!.setScrollbackLines).toHaveBeenCalledWith(1);
    expect(harness.instances[1]!.setScrollbackLines).not.toHaveBeenCalled();
    expect(firstAdapter.adapter.close).not.toHaveBeenCalled();
    expect(secondAdapter.adapter.close).not.toHaveBeenCalled();
  });

  it("rejects an invalid live scrollback value before runtime mutation", async () => {
    const { adapter } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    const restty = harness.instances[0]!;

    expect(() =>
      surface.applyConfiguration({
        appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
        padding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 100_001,
        optionKeyMode: "none",
        theme: DEFAULT_TERMINAL_THEME,
      }),
    ).toThrow(/scrollback\.lines/u);
    expect(restty.setScrollbackLines).not.toHaveBeenCalled();
  });

  it("updates theme, size, zoom, and padding without replacing the runtime", async () => {
    const container = document.createElement("main");
    const { adapter } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const surface = await mountResttyTerminalSurface(container, adapter, {
      appearance: { fontSize: 8, lineHeight: 2, ligatures: true },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
    });
    const restty = harness.instances[0]!;

    for (let step = 0; step < 7; step += 1) surface.zoom("out");
    expect(restty.setFontSize.mock.calls.map(([size]) => Number(size))).toEqual(
      [7, 6, 5, 4, 3, 2, 1],
    );

    const changedTheme = {
      ...DEFAULT_TERMINAL_THEME,
      name: "Changed",
      colors: {
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#102030",
        foreground: "#f1e2d3",
      },
    } as const;
    surface.applyConfiguration({
      appearance: {
        fontSize: 16,
        lineHeight: 1,
        ligatures: true,
        systemFont: { family: "Ignored until #255", available: true },
      },
      padding: { top: 128, right: 0, bottom: 0, left: 128 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      theme: changedTheme,
    });

    expect(harness.instances).toHaveLength(1);
    expect(adapter.close).not.toHaveBeenCalled();
    expect(restty.setFontSize).toHaveBeenLastCalledWith(9);
    expect(restty.applyTheme).toHaveBeenLastCalledWith(
      expectedTheme(changedTheme),
      "OMXTerm",
    );
    expect(restty.setSearchUiStyleOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        panelBackground: "#102030",
        panelTextColor: "#f1e2d3",
        inputBackground: "#22303d",
      }),
    );
    expect(container.style.getPropertyValue("--terminal-padding-top")).toBe(
      "128px",
    );
    expect(container.style.getPropertyValue("--terminal-background")).toBe(
      "#102030",
    );
    expect(restty.updateSize).toHaveBeenCalledWith(true);

    surface.zoom("reset");
    expect(restty.setFontSize).toHaveBeenLastCalledWith(16);
  });
});
