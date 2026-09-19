// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";

const harness = vi.hoisted(() => {
  const instances: FakeRestty[] = [];
  let initError: Error | undefined;
  type RuntimeEvent =
    | { type: "state"; state: string }
    | { type: "backend"; backend: string }
    | { type: "term-size"; cols: number; rows: number }
    | { type: "title"; title: string }
    | { type: "bell" };
  class FakeRestty {
    readonly options: Record<string, unknown>;
    readonly canvas = document.createElement("canvas");
    readonly listeners = new Set<(event: RuntimeEvent) => void>();
    readonly destroy = vi.fn();
    readonly focus = vi.fn();
    readonly sendInput = vi.fn();
    readonly setFontSize = vi.fn();
    readonly setLigatures = vi.fn();
    readonly setOptionKeyMode = vi.fn();
    readonly setScrollbackLines = vi.fn();
    readonly applyTheme = vi.fn();
    readonly updateSize = vi.fn();
    backend = "webgl2";
    state = "created";
    readonly pane = {
      container: document.createElement("div"),
      runtime: {
        events: {
          subscribe: (listener: (event: RuntimeEvent) => void) => {
            this.listeners.add(listener);
            listener({ type: "state", state: this.state });
            return () => this.listeners.delete(listener);
          },
        },
        lifecycle: {
          init: vi.fn(async () => {
            this.state = "initializing";
            this.emit({ type: "state", state: "initializing" });
            if (initError) throw initError;
            this.emit({ type: "backend", backend: this.backend });
            this.emit({ type: "term-size", cols: 96, rows: 31 });
            this.state = "ready";
            this.emit({ type: "state", state: "ready" });
          }),
          state: () => this.state,
          destroy: vi.fn(),
        },
        render: { getBackend: () => this.backend, refresh: vi.fn() },
        io: {
          connectPty: () => {
            const transport = (
              this.options.services as {
                ptyTransport: {
                  connect(options: {
                    callbacks: { onData(data: string): void };
                  }): void;
                  isConnected(): boolean;
                };
              }
            ).ptyTransport;
            if (!transport.isConnected())
              transport.connect({
                callbacks: {
                  onData: (data) => {
                    this.sendInput(data, "pty");
                  },
                },
              });
          },
        },
        interaction: {
          focus: this.focus,
          blur: vi.fn(),
          resize: vi.fn(),
          updateSize: this.updateSize,
        },
        terminal: {
          setFontSize: this.setFontSize,
          setLigatures: this.setLigatures,
          setOptionKeyMode: this.setOptionKeyMode,
          setScrollbackLines: this.setScrollbackLines,
          applyTheme: this.applyTheme,
        },
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.pane.container.append(this.canvas);
      (options.root as HTMLElement).append(this.pane.container);
      instances.push(this);
    }

    getActivePane() {
      return this.pane;
    }

    emit(event: RuntimeEvent) {
      for (const listener of this.listeners) listener(event);
    }
  }
  return {
    FakeRestty,
    instances,
    setInitError: (error: Error | undefined) => {
      initError = error;
    },
  };
});

vi.mock("restty", () => ({ Restty: harness.FakeRestty }));
vi.mock("../../assets/fonts/FiraCodeNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([1, 1]),
}));
vi.mock("../../assets/fonts/FiraCodeNerdFontMono-Bold.ttf", () => ({
  default: new Uint8Array([1, 2]),
}));
vi.mock("../../assets/fonts/DejaVuSansMono.ttf", () => ({
  default: new Uint8Array([2, 1]),
}));
vi.mock("../../assets/fonts/DejaVuSansMono-Bold.ttf", () => ({
  default: new Uint8Array([2, 2]),
}));
vi.mock("../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([3, 1]),
}));

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

  it("starts no PTY when a font lookup is disposed or fails", async () => {
    const abort = new AbortController();
    const { adapter } = createAdapter();
    const onFatalError = vi.fn();
    const releaseFontInputs = vi.fn();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const pending = mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
      {
        abortSignal: abort.signal,
        acquireFontInputs: async () => {
          abort.abort();
          return { fonts: [], release: releaseFontInputs };
        },
        onFatalError,
      },
    );

    await expect(pending).rejects.toThrow(/OMXTerm Terminal Surface/u);
    expect(harness.instances).toHaveLength(0);
    expect(adapter.start).not.toHaveBeenCalled();
    expect(releaseFontInputs).toHaveBeenCalledOnce();
    expect(onFatalError).toHaveBeenCalledWith(
      expect.stringContaining("cancelled"),
    );
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
