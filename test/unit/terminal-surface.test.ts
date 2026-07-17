// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TerminalExit,
  TerminalSize,
} from "../../src/shared/terminal-contract";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

const xterm = vi.hoisted(() => {
  class FakeTerminal {
    static current: FakeTerminal;
    static instances: FakeTerminal[] = [];
    readonly write = vi.fn();
    readonly dispose = vi.fn(() => this.addon?.dispose());
    readonly inputDispose = vi.fn(() => {
      this.onInput = undefined;
    });
    readonly resizeDispose = vi.fn(() => {
      this.onTerminalResize = undefined;
    });
    readonly options: {
      fontSize?: number;
      macOptionIsMeta?: boolean;
      [key: string]: unknown;
    };
    readonly constructorOptions: Record<string, unknown>;
    private onInput: ((data: string) => void) | undefined;
    private onTerminalResize: ((size: TerminalSize) => void) | undefined;
    private onKey: ((event: KeyboardEvent) => boolean) | undefined;
    private addon: { dispose(): void } | undefined;

    constructor(options: Record<string, unknown>) {
      FakeTerminal.current = this;
      FakeTerminal.instances.push(this);
      this.constructorOptions = options;
      this.options = {
        fontSize: options.fontSize as number,
        macOptionIsMeta: options.macOptionIsMeta as boolean,
      };
    }

    loadAddon(addon: { dispose(): void }) {
      this.addon = addon;
    }
    open() {
      if (xterm.openError) throw xterm.openError;
    }
    onData(listener: (data: string) => void) {
      this.onInput = listener;
      return { dispose: this.inputDispose };
    }
    onResize(listener: (size: TerminalSize) => void) {
      this.onTerminalResize = listener;
      return { dispose: this.resizeDispose };
    }
    attachCustomKeyEventHandler(listener: (event: KeyboardEvent) => boolean) {
      this.onKey = listener;
    }
    emitInput(data: string) {
      this.onInput?.(data);
    }
    emitResize(size: TerminalSize) {
      this.onTerminalResize?.(size);
    }
    emitKey(event: Partial<KeyboardEvent>) {
      return this.onKey?.(event as KeyboardEvent);
    }
  }

  return {
    FakeTerminal,
    fit: vi.fn(),
    fitDispose: vi.fn(),
    openError: undefined as Error | undefined,
  };
});

vi.mock("@xterm/xterm", () => ({ Terminal: xterm.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = xterm.fit;
    dispose = xterm.fitDispose;
  },
}));

class FakeResizeObserver {
  static current: FakeResizeObserver;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  static observeError: Error | undefined;

  constructor(_listener: ResizeObserverCallback) {
    FakeResizeObserver.current = this;
    this.observe.mockImplementation(() => {
      if (FakeResizeObserver.observeError)
        throw FakeResizeObserver.observeError;
    });
  }
}

describe("portable Terminal Surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    xterm.fit.mockReset();
    xterm.FakeTerminal.instances = [];
    xterm.openError = undefined;
    FakeResizeObserver.observeError = undefined;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: undefined,
    });
  });

  it("starts/subscribes through its Adapter and releases every resource exactly once", async () => {
    let handlers: TerminalSessionHandlers | undefined;
    const adapter = {
      start: vi.fn(async (value: TerminalSessionHandlers) => {
        handlers = value;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const container = document.createElement("main");

    const surface =
      await import("../../src/terminal-surface/terminal-surface").then(
        (module) => module.mountTerminalSurface(container, adapter),
      );

    expect(adapter.start).toHaveBeenCalledOnce();
    handlers!.onOutput("shell output");
    xterm.FakeTerminal.current.emitInput("typed input");
    xterm.FakeTerminal.current.emitResize({ cols: 100, rows: 30 });
    handlers!.onExit({ exitCode: 0, signal: 0 } satisfies TerminalExit);
    surface.dispose();

    expect(xterm.FakeTerminal.current.write).toHaveBeenCalledWith(
      "shell output",
    );
    expect(adapter.write).toHaveBeenCalledWith("typed input");
    expect(adapter.resize).toHaveBeenCalledWith({ cols: 100, rows: 30 });
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.inputDispose).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.resizeDispose).toHaveBeenCalledOnce();
    expect(FakeResizeObserver.current.disconnect).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.dispose).toHaveBeenCalledOnce();
    expect(xterm.fitDispose).toHaveBeenCalledOnce();
  });

  it("closes created resources when terminal open fails and preserves the cause", async () => {
    const failure = new Error("open failed");
    const cleanupFailure = new Error("close failed");
    xterm.openError = failure;
    const adapter = {
      start: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(() => {
        throw cleanupFailure;
      }),
    };

    await expect(
      import("../../src/terminal-surface/terminal-surface").then((module) =>
        module.mountTerminalSurface(document.createElement("main"), adapter),
      ),
    ).rejects.toMatchObject({ cause: failure });

    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.dispose).toHaveBeenCalledOnce();
    expect(xterm.fitDispose).toHaveBeenCalledOnce();
  });

  it("releases partial subscriptions when ResizeObserver setup fails", async () => {
    const failure = new Error("observe failed");
    FakeResizeObserver.observeError = failure;
    const adapter = {
      start: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };

    await expect(
      import("../../src/terminal-surface/terminal-surface").then((module) =>
        module.mountTerminalSurface(document.createElement("main"), adapter),
      ),
    ).rejects.toMatchObject({ cause: failure });

    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.inputDispose).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.resizeDispose).toHaveBeenCalledOnce();
    expect(FakeResizeObserver.current.disconnect).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.dispose).toHaveBeenCalledOnce();
    expect(xterm.fitDispose).toHaveBeenCalledOnce();
  });

  it("releases the fully configured Surface when Adapter start fails", async () => {
    const failure = new Error("start failed");
    const adapter = {
      start: vi.fn(async () => {
        throw failure;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };

    await expect(
      import("../../src/terminal-surface/terminal-surface").then((module) =>
        module.mountTerminalSurface(document.createElement("main"), adapter),
      ),
    ).rejects.toMatchObject({ cause: failure });

    expect(adapter.close).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.inputDispose).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.resizeDispose).toHaveBeenCalledOnce();
    expect(FakeResizeObserver.current.disconnect).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.dispose).toHaveBeenCalledOnce();
    expect(xterm.fitDispose).toHaveBeenCalledOnce();
  });

  it("owns independent memory-only scrollback with the documented bounds", async () => {
    const createAdapter = () => ({
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    });
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    const defaultSurface = await mountTerminalSurface(
      document.createElement("main"),
      createAdapter(),
    );
    const zeroSurface = await mountTerminalSurface(
      document.createElement("main"),
      createAdapter(),
      { scrollbackLines: 0 },
    );
    const maximumSurface = await mountTerminalSurface(
      document.createElement("main"),
      createAdapter(),
      { scrollbackLines: 100_000 },
    );

    expect(
      xterm.FakeTerminal.instances.map(
        (terminal) => terminal.constructorOptions.scrollback,
      ),
    ).toEqual([10_000, 0, 100_000]);

    defaultSurface.dispose();
    zeroSurface.dispose();
    maximumSurface.dispose();

    const rejectedAdapter = createAdapter();
    await expect(
      mountTerminalSurface(document.createElement("main"), rejectedAdapter, {
        scrollbackLines: 100_001,
      }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("scrollback.lines"),
      }),
    });
    expect(rejectedAdapter.close).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.instances).toHaveLength(3);
  });

  it("applies the exact omtheme palette and bundled default Terminal Font Stack", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
    );

    expect(xterm.FakeTerminal.current.constructorOptions).toMatchObject({
      fontFamily: '"JetBrainsMono Nerd Font Mono", monospace',
      fontSize: 16,
      theme: {
        background: "#000000",
        foreground: "#f0f0ff",
        cursor: "#f0f0ff",
        selectionBackground: "#3b4fa6",
        selectionForeground: "#ffffff",
        black: "#000000",
        red: "#ff7e9a",
        green: "#37feb7",
        yellow: "#ffda76",
        blue: "#88aaf2",
        magenta: "#ff87bc",
        cyan: "#6bccff",
        white: "#f0f0ff",
        brightBlack: "#505068",
        brightRed: "#ffa8bb",
        brightGreen: "#72ffcd",
        brightYellow: "#ffeab2",
        brightBlue: "#b2cbff",
        brightMagenta: "#ff88ef",
        brightCyan: "#77c6ff",
        brightWhite: "#ffffff",
      },
    });
    surface.dispose();
  });

  it("loads the bundled font before opening xterm", async () => {
    const load = vi.fn(async () => [{} as FontFace]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
    );

    expect(load).toHaveBeenCalledWith('16px "JetBrainsMono Nerd Font Mono"');
    surface.dispose();
  });

  it("places an available supplied system family before bundled and OS fallbacks", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
      {
        appearance: {
          fontSize: 19,
          systemFont: { family: "SF Mono", available: true },
        },
      },
    );

    expect(xterm.FakeTerminal.current.constructorOptions).toMatchObject({
      fontFamily: '"SF Mono", "JetBrainsMono Nerd Font Mono", monospace',
      fontSize: 19,
    });
    surface.dispose();
  });

  it("reports an absent supplied system family without using it as primary", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    await expect(
      mountTerminalSurface(document.createElement("main"), adapter, {
        appearance: {
          fontSize: 16,
          systemFont: { family: "Missing Mono", available: false },
        },
      }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        family: "Missing Mono",
        message: 'Configured font family "Missing Mono" is not available',
      }),
    });

    expect(xterm.FakeTerminal.instances).toHaveLength(0);
    expect(adapter.close).toHaveBeenCalledOnce();
  });

  it("keeps Window Font Zoom independent, resets to each supplied size, and refits the PTY", async () => {
    const createAdapter = () => ({
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    });
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const firstAdapter = createAdapter();
    xterm.fit.mockImplementation(() => {
      xterm.FakeTerminal.current.emitResize({ cols: 92, rows: 28 });
    });
    const first = await mountTerminalSurface(
      document.createElement("main"),
      firstAdapter,
      { appearance: { fontSize: 16 } },
    );
    const firstTerminal = xterm.FakeTerminal.current;

    first.zoom("in");
    expect(firstTerminal.options.fontSize).toBe(17);
    expect(firstAdapter.resize).toHaveBeenLastCalledWith({
      cols: 92,
      rows: 28,
    });

    const secondAdapter = createAdapter();
    const second = await mountTerminalSurface(
      document.createElement("main"),
      secondAdapter,
      { appearance: { fontSize: 20 } },
    );
    const secondTerminal = xterm.FakeTerminal.current;
    second.zoom("out");
    second.zoom("reset");

    expect(firstTerminal.options.fontSize).toBe(17);
    expect(secondTerminal.options.fontSize).toBe(20);
    expect(secondAdapter.resize).toHaveBeenCalled();

    first.dispose();
    second.dispose();
  });

  it.each([
    { mode: "none" as const, initial: false, selectedCode: "AltLeft" },
    { mode: "left" as const, initial: false, selectedCode: "AltLeft" },
    { mode: "right" as const, initial: false, selectedCode: "AltRight" },
    { mode: "both" as const, initial: true, selectedCode: "AltLeft" },
  ])(
    "applies Option Key Mode $mode without changing terminal input",
    async (value) => {
      const adapter = {
        start: vi.fn(async () => undefined),
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
      };
      const { mountTerminalSurface } =
        await import("../../src/terminal-surface/terminal-surface");
      const surface = await mountTerminalSurface(
        document.createElement("main"),
        adapter,
        { optionKeyMode: value.mode },
      );
      const terminal = xterm.FakeTerminal.current;

      expect(terminal.options.macOptionIsMeta).toBe(value.initial);
      terminal.emitKey({
        type: "keydown",
        code: value.selectedCode,
        altKey: true,
      });
      expect(terminal.options.macOptionIsMeta).toBe(value.mode !== "none");
      terminal.emitInput("á🙂");
      terminal.emitKey({
        type: "keyup",
        code: value.selectedCode,
        altKey: false,
      });

      expect(adapter.write).toHaveBeenCalledWith("á🙂");
      expect(terminal.options.macOptionIsMeta).toBe(value.mode === "both");
      surface.dispose();
    },
  );

  it("distinguishes left and right Option keys", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
      { optionKeyMode: "right" },
    );
    const terminal = xterm.FakeTerminal.current;

    terminal.emitKey({ type: "keydown", code: "AltLeft", altKey: true });
    expect(terminal.options.macOptionIsMeta).toBe(false);
    terminal.emitKey({ type: "keyup", code: "AltLeft", altKey: false });
    terminal.emitKey({ type: "keydown", code: "AltRight", altKey: true });
    expect(terminal.options.macOptionIsMeta).toBe(true);

    surface.dispose();
  });

  it("keeps representative SSH/tmux payload opaque and teardown bounded", async () => {
    let handlers: TerminalSessionHandlers | undefined;
    const adapter = {
      start: vi.fn(async (value: TerminalSessionHandlers) => {
        handlers = value;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    const terminal = xterm.FakeTerminal.current;
    const tmuxPassthrough = "\u001bPtmux;\u001b\u001b[?1h\u001b\\";

    terminal.emitInput("ssh user@example.invalid\r");
    for (let index = 0; index < 256; index += 1) {
      handlers!.onOutput(tmuxPassthrough);
      terminal.emitInput("\u0002c");
      terminal.emitResize({ cols: 80 + (index % 20), rows: 24 });
    }
    surface.dispose();
    handlers!.onOutput("ignored after teardown");
    terminal.emitInput("ignored after teardown");

    expect(terminal.write).toHaveBeenCalledTimes(256);
    expect(terminal.write).toHaveBeenCalledWith(tmuxPassthrough);
    expect(adapter.write).toHaveBeenCalledTimes(257);
    expect(adapter.write).toHaveBeenCalledWith("ssh user@example.invalid\r");
    expect(adapter.write).toHaveBeenCalledWith("\u0002c");
    expect(adapter.resize).toHaveBeenCalledTimes(256);
    expect(adapter.close).toHaveBeenCalledOnce();
  });
});
