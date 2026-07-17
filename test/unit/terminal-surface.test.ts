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
    readonly write = vi.fn();
    readonly dispose = vi.fn(() => this.addon?.dispose());
    readonly inputDispose = vi.fn();
    readonly resizeDispose = vi.fn();
    private onInput: ((data: string) => void) | undefined;
    private onTerminalResize: ((size: TerminalSize) => void) | undefined;
    private addon: { dispose(): void } | undefined;

    constructor() {
      FakeTerminal.current = this;
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
    emitInput(data: string) {
      this.onInput?.(data);
    }
    emitResize(size: TerminalSize) {
      this.onTerminalResize?.(size);
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
    xterm.openError = undefined;
    FakeResizeObserver.observeError = undefined;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
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
});
