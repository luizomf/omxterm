// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

const harness = vi.hoisted(() => {
  const instances: FakeRestty[] = [];
  let initError: Error | undefined;
  type RuntimeEvent =
    | { type: "state"; state: string }
    | { type: "backend"; backend: string }
    | { type: "term-size"; cols: number; rows: number };
  class FakeRestty {
    readonly options: Record<string, unknown>;
    readonly canvas = document.createElement("canvas");
    readonly listeners = new Set<(event: RuntimeEvent) => void>();
    readonly destroy = vi.fn();
    readonly focus = vi.fn();
    readonly sendInput = vi.fn();
    readonly setFontSize = vi.fn();
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
        render: { getBackend: () => this.backend },
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
vi.mock("../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([0, 1, 2, 3]),
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

  it("requires a font, core, and WebGL backend before starting the PTY", async () => {
    const { adapter, handlers } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
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
    expect(fonts).toHaveLength(1);
    expect(fonts[0]?.data).toBeInstanceOf(Uint8Array);
    expect(fonts[0]?.name).toBe("JetBrainsMono Nerd Font Mono");
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
    ).rejects.toThrow(/Restty Terminal Surface/u);

    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(harness.instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(onFatalError).toHaveBeenCalledWith(
      expect.stringContaining("font unavailable"),
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
      "The Restty rendering backend was lost",
    );
    expect(adapter.close).toHaveBeenCalledOnce();
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
      appearance: { fontSize: 8, lineHeight: 2 },
      padding: { top: 0, right: 128, bottom: 128, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
    });

    expect(harness.instances[0]?.options).toMatchObject({
      terminal: {
        fontSize: 8,
        lineHeight: 2,
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

  it("updates theme, size, zoom, and padding without replacing the runtime", async () => {
    const container = document.createElement("main");
    const { adapter } = createAdapter();
    const { mountResttyTerminalSurface } =
      await import("../../src/terminal-surface/restty-terminal-surface");
    const surface = await mountResttyTerminalSurface(container, adapter, {
      appearance: { fontSize: 8, lineHeight: 2 },
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
