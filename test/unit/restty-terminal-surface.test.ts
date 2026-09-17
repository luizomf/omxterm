// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

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
        io: { sendInput: this.sendInput },
        interaction: {
          focus: this.focus,
          blur: vi.fn(),
          resize: vi.fn(),
          updateSize: vi.fn(),
        },
        terminal: { setFontSize: this.setFontSize },
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
