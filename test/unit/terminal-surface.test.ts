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
    readonly dispose = vi.fn();
    readonly inputDispose = vi.fn();
    readonly resizeDispose = vi.fn();
    private onInput: ((data: string) => void) | undefined;
    private onTerminalResize: ((size: TerminalSize) => void) | undefined;

    constructor() {
      FakeTerminal.current = this;
    }

    loadAddon() {}
    open() {}
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

  return { FakeTerminal, fit: vi.fn() };
});

vi.mock("@xterm/xterm", () => ({ Terminal: xterm.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = xterm.fit;
  },
}));

class FakeResizeObserver {
  static current: FakeResizeObserver;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    FakeResizeObserver.current = this;
  }
}

describe("portable Terminal Surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
