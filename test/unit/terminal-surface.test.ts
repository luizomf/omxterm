// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TerminalExit,
  TerminalSize,
} from "../../src/shared/terminal-contract";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

type XtermResize = TerminalSize & {
  readonly colsChanged?: boolean;
  readonly rowsChanged?: boolean;
};

const xterm = vi.hoisted(() => {
  class FakeTerminal {
    static current: FakeTerminal;
    static instances: FakeTerminal[] = [];
    readonly write = vi.fn();
    readonly paste = vi.fn((data: string) => this.onInput?.(data));
    readonly focus = vi.fn();
    readonly selectAll = vi.fn();
    readonly getSelection = vi.fn(() => this.selection);
    readonly modes = { bracketedPasteMode: false };
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
    private onTerminalResize: ((size: XtermResize) => void) | undefined;
    private onKey: ((event: KeyboardEvent) => boolean) | undefined;
    private addon: { dispose(): void } | undefined;
    private selection = "";
    readonly oscDispose = vi.fn();
    private readonly oscHandlers = new Map<
      number,
      (data: string) => boolean | Promise<boolean>
    >();
    private bellHandler: (() => void) | undefined;
    readonly csiDispose = vi.fn();
    readonly bellDispose = vi.fn();
    readonly parser = {
      registerOscHandler: vi.fn(
        (
          ident: number,
          handler: (data: string) => boolean | Promise<boolean>,
        ) => {
          this.oscHandlers.set(ident, handler);
          return { dispose: this.oscDispose };
        },
      ),
      registerCsiHandler: vi.fn(() => ({ dispose: this.csiDispose })),
    };

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
    onResize(listener: (size: XtermResize) => void) {
      this.onTerminalResize = listener;
      return { dispose: this.resizeDispose };
    }
    onBell(listener: () => void) {
      this.bellHandler = listener;
      return { dispose: this.bellDispose };
    }
    attachCustomKeyEventHandler(listener: (event: KeyboardEvent) => boolean) {
      this.onKey = listener;
    }
    emitInput(data: string) {
      this.onInput?.(data);
    }
    emitResize(size: XtermResize) {
      this.onTerminalResize?.(size);
    }
    emitKey(event: Partial<KeyboardEvent>) {
      return this.onKey?.(event as KeyboardEvent);
    }
    setSelection(text: string) {
      this.selection = text;
    }
    emitOsc52(data: string) {
      return this.oscHandlers.get(52)?.(data);
    }
    emitTitle(ident: 0 | 2, data: string) {
      return this.oscHandlers.get(ident)?.(data);
    }
    emitBell() {
      this.bellHandler?.();
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

  constructor(private readonly listener: ResizeObserverCallback) {
    FakeResizeObserver.current = this;
    this.observe.mockImplementation(() => {
      if (FakeResizeObserver.observeError)
        throw FakeResizeObserver.observeError;
    });
  }

  notify() {
    this.listener([], this as unknown as ResizeObserver);
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

  it("delegates focus to xterm only while mounted", async () => {
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

    surface.focus();
    expect(xterm.FakeTerminal.current.focus).toHaveBeenCalledOnce();

    surface.dispose();
    surface.focus();
    expect(xterm.FakeTerminal.current.focus).toHaveBeenCalledOnce();
  });

  it("refits through the observed container after shrinking and growing", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    let fittedSize: TerminalSize = { cols: 120, rows: 40 };
    xterm.fit.mockImplementation(() => {
      xterm.FakeTerminal.current.emitResize({
        ...fittedSize,
        colsChanged: true,
        rowsChanged: true,
      });
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
    adapter.resize.mockClear();

    fittedSize = { cols: 60, rows: 20 };
    FakeResizeObserver.current.notify();
    expect(adapter.resize).not.toHaveBeenCalled();
    frames.shift()!(0);
    expect(adapter.resize).toHaveBeenLastCalledWith({ cols: 60, rows: 20 });

    fittedSize = { cols: 132, rows: 44 };
    FakeResizeObserver.current.notify();
    expect(adapter.resize).toHaveBeenCalledOnce();
    frames.shift()!(1);
    expect(adapter.resize.mock.calls).toEqual([
      [{ cols: 60, rows: 20 }],
      [{ cols: 132, rows: 44 }],
    ]);

    surface.dispose();
  });

  it("forwards parser title and BEL events and disposes their subscriptions", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const onTitleRequest = vi.fn();
    const onBell = vi.fn();
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const surface = await mountTerminalSurface(
      document.createElement("main"),
      adapter,
      { onTitleRequest, onBell },
    );

    xterm.FakeTerminal.current.emitTitle(0, "first");
    xterm.FakeTerminal.current.emitTitle(2, "second");
    xterm.FakeTerminal.current.emitBell();

    expect(onTitleRequest.mock.calls).toEqual([["first"], ["second"]]);
    expect(onBell).toHaveBeenCalledOnce();
    surface.dispose();
    expect(
      xterm.FakeTerminal.current.parser.registerOscHandler,
    ).toHaveBeenCalledWith(8, expect.any(Function));
    expect(xterm.FakeTerminal.current.oscDispose).toHaveBeenCalledTimes(3);
    expect(xterm.FakeTerminal.current.csiDispose).toHaveBeenCalledOnce();
    expect(xterm.FakeTerminal.current.bellDispose).toHaveBeenCalledOnce();
  });

  it("copies only explicit selections and never copies selection changes", async () => {
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );

    xterm.FakeTerminal.current.setSelection("selected text");
    expect(clipboard.writeText).not.toHaveBeenCalled();
    await surface.copy();
    expect(clipboard.writeText).toHaveBeenCalledWith("selected text");
    surface.dispose();
  });

  it("pastes printable single-line text raw without confirmation when bracketed paste is disabled", async () => {
    const text = "printf hello";
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => text),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );

    expect(xterm.FakeTerminal.current.modes.bracketedPasteMode).toBe(false);
    await surface.paste();

    expect(clipboard.confirmPaste).not.toHaveBeenCalled();
    expect(xterm.FakeTerminal.current.paste).not.toHaveBeenCalled();
    expect(adapter.write.mock.calls.map(([chunk]) => chunk).join("")).toBe(
      text,
    );
    surface.dispose();
  });

  it.each([
    "one\ntwo",
    "one\r\ntwo",
    "one\u2028two",
    "one\u2029two",
    "a\u0000b",
    "a\u007fb",
  ])(
    "protects paste trigger %j when bracketed paste is disabled",
    async (text) => {
      const clipboard = {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => text),
        confirmPaste: vi.fn(async () => false),
        requestContextMenu: vi.fn(),
      };
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
        { clipboard },
      );

      await surface.paste();

      expect(clipboard.confirmPaste).toHaveBeenCalledWith(text);
      expect(adapter.write).not.toHaveBeenCalled();
      surface.dispose();
    },
  );

  it("binds confirmation to the exact text and rechecks bracketed mode at commit", async () => {
    const text = "first\nsecond";
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => text),
      confirmPaste: vi.fn(async (confirmedText: string) => {
        expect(confirmedText).toBe(text);
        xterm.FakeTerminal.current.modes.bracketedPasteMode = true;
        return true;
      }),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );

    await surface.paste();

    expect(xterm.FakeTerminal.current.paste).not.toHaveBeenCalled();
    expect(adapter.write.mock.calls.flat().join("")).toBe(
      `\u001b[200~${text}\u001b[201~`,
    );
    surface.dispose();
  });

  it("does not confirm dangerous text when bracketed paste is enabled", async () => {
    const text = "first\nsecond";
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => text),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );
    xterm.FakeTerminal.current.modes.bracketedPasteMode = true;

    await surface.paste();

    expect(clipboard.confirmPaste).not.toHaveBeenCalled();
    expect(adapter.write.mock.calls.flat().join("")).toBe(
      `\u001b[200~${text}\u001b[201~`,
    );
    surface.dispose();
  });

  it("requires confirmation after bracketed paste becomes disabled while reading", async () => {
    const text = "first\nsecond";
    let releaseClipboardRead: ((text: string) => void) | undefined;
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            releaseClipboardRead = resolve;
          }),
      ),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );
    xterm.FakeTerminal.current.modes.bracketedPasteMode = true;

    const pendingPaste = surface.paste();
    expect(clipboard.readText).toHaveBeenCalledOnce();
    xterm.FakeTerminal.current.modes.bracketedPasteMode = false;
    releaseClipboardRead!(text);
    await pendingPaste;

    expect(clipboard.confirmPaste).toHaveBeenCalledWith(text);
    expect(adapter.write).not.toHaveBeenCalled();
    surface.dispose();
  });

  it("forwards a confirmed protected paste over 64 KiB unchanged across chunks", async () => {
    const text = `first\n${"🙂".repeat(20_000)}`;
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => text),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );

    await surface.paste();

    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(
      64 * 1024,
    );
    expect(clipboard.confirmPaste).toHaveBeenCalledWith(text);
    expect(xterm.FakeTerminal.current.paste).not.toHaveBeenCalled();
    expect(adapter.write.mock.calls.length).toBeGreaterThan(1);
    expect(adapter.write.mock.calls.map(([chunk]) => chunk).join("")).toBe(
      text,
    );
    surface.dispose();
  });

  it("copies valid selections over 64 KiB without truncation", async () => {
    const text = "copy🙂".repeat(15_000);
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
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
      { clipboard },
    );
    xterm.FakeTerminal.current.setSelection(text);

    await surface.copy();

    expect(clipboard.writeText).toHaveBeenCalledWith(text);
    surface.dispose();
  });

  it("keeps Ctrl+C/Ctrl+V as terminal keys while reserving Command actions", async () => {
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

    expect(
      xterm.FakeTerminal.current.emitKey({ key: "c", ctrlKey: true }),
    ).toBe(true);
    expect(
      xterm.FakeTerminal.current.emitKey({ key: "v", ctrlKey: true }),
    ).toBe(true);
    expect(
      xterm.FakeTerminal.current.emitKey({ key: "c", metaKey: true }),
    ).toBe(false);
    expect(
      xterm.FakeTerminal.current.emitKey({ key: "v", metaKey: true }),
    ).toBe(false);
    surface.dispose();
  });

  it("requests the native context menu without forwarding terminal input", async () => {
    const container = document.createElement("main");
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const surface = await mountTerminalSurface(container, adapter, {
      clipboard,
    });
    const event = new MouseEvent("contextmenu", { cancelable: true });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.requestContextMenu).toHaveBeenCalledOnce();
    expect(adapter.write).not.toHaveBeenCalled();
    surface.dispose();
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
      lineHeight: 1,
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

  it("applies a supplied Terminal Theme to xterm and the complete Surface", async () => {
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const { DEFAULT_TERMINAL_THEME } =
      await import("../../src/shared/terminal-theme");
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");
    const container = document.createElement("main");
    const theme = Object.freeze({
      ...DEFAULT_TERMINAL_THEME,
      name: "non-black",
      colors: Object.freeze({
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#1e1e2e",
        foreground: "#cdd6f4",
      }),
    });

    const surface = await mountTerminalSurface(container, adapter, { theme });

    expect(xterm.FakeTerminal.current.constructorOptions.theme).toEqual(
      theme.colors,
    );
    expect(container.style.getPropertyValue("--terminal-background")).toBe(
      "#1e1e2e",
    );
    surface.dispose();
  });

  it("applies row spacing independently of font size and keeps it through Window Font Zoom", async () => {
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
      { appearance: { fontSize: 19, lineHeight: 1.2 } },
    );
    const terminal = xterm.FakeTerminal.current;

    expect(terminal.constructorOptions).toMatchObject({
      fontSize: 19,
      lineHeight: 1.2,
    });
    surface.zoom("in");
    expect(terminal.options.fontSize).toBe(20);
    expect(terminal.constructorOptions.lineHeight).toBe(1.2);

    surface.dispose();
  });

  it("keeps configured spacing fitted through initial mount, shrink, grow, and zoom grids", async () => {
    const container = document.createElement("main");
    const adapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    let fittedSize: TerminalSize = { cols: 88, rows: 27 };
    xterm.fit.mockImplementation(() => {
      xterm.FakeTerminal.current.emitResize(fittedSize);
    });
    const { mountTerminalSurface } =
      await import("../../src/terminal-surface/terminal-surface");

    const surface = await mountTerminalSurface(container, adapter, {
      appearance: { fontSize: 16, lineHeight: 1.15 },
      padding: { top: 0, right: 12, bottom: 8, left: 16 },
    });

    expect(container.style.getPropertyValue("--terminal-padding-top")).toBe(
      "0px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-right")).toBe(
      "12px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-bottom")).toBe(
      "8px",
    );
    expect(container.style.getPropertyValue("--terminal-padding-left")).toBe(
      "16px",
    );
    expect(adapter.resize).toHaveBeenLastCalledWith({ cols: 88, rows: 27 });

    adapter.resize.mockClear();
    fittedSize = { cols: 60, rows: 18 };
    FakeResizeObserver.current.notify();
    fittedSize = { cols: 104, rows: 34 };
    FakeResizeObserver.current.notify();
    fittedSize = { cols: 98, rows: 31 };
    surface.zoom("in");
    fittedSize = { cols: 104, rows: 34 };
    surface.zoom("reset");

    expect(adapter.resize.mock.calls).toEqual([
      [{ cols: 60, rows: 18 }],
      [{ cols: 104, rows: 34 }],
      [{ cols: 98, rows: 31 }],
      [{ cols: 104, rows: 34 }],
    ]);

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
    firstAdapter.resize.mockClear();

    first.zoom("in");
    expect(firstTerminal.options.fontSize).toBe(17);
    expect(firstAdapter.resize.mock.calls).toEqual([[{ cols: 92, rows: 28 }]]);

    const secondAdapter = createAdapter();
    const second = await mountTerminalSurface(
      document.createElement("main"),
      secondAdapter,
      { appearance: { fontSize: 20 } },
    );
    const secondTerminal = xterm.FakeTerminal.current;
    secondAdapter.resize.mockClear();
    second.zoom("out");
    second.zoom("reset");

    expect(firstTerminal.options.fontSize).toBe(17);
    expect(secondTerminal.options.fontSize).toBe(20);
    expect(secondAdapter.resize.mock.calls).toEqual([
      [{ cols: 92, rows: 28 }],
      [{ cols: 92, rows: 28 }],
    ]);

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
