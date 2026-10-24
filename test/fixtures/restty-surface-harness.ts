import { vi } from "vitest";
import type { ResttyRuntimeEvent, ResttyRuntimeLifecycleState } from "restty";
import type {
  PatchedResttyConfig,
  PatchedResttyPane,
} from "../../src/terminal-surface/restty-runtime-contract";

const harness = vi.hoisted(() => {
  const instances: FakeRestty[] = [];
  let initError: Error | undefined;
  let initGate: Promise<void> | undefined;
  class FakeRestty {
    readonly canvas = document.createElement("canvas");
    readonly listeners = new Set<(event: ResttyRuntimeEvent) => void>();
    readonly destroy = vi.fn();
    readonly focus = vi.fn();
    readonly sendInput = vi.fn();
    readonly setFontSize = vi.fn();
    readonly setLigatures = vi.fn();
    readonly setOptionKeyMode = vi.fn();
    readonly setScrollbackLines = vi.fn();
    readonly applyTheme = vi.fn();
    readonly updateSize = vi.fn();
    readonly openSearch = vi.fn();
    readonly isSearchOpen = vi.fn(() => false);
    readonly setSearchUiStyleOptions = vi.fn();
    backend = "webgl2";
    state: ResttyRuntimeLifecycleState = "created";
    readonly pane = {
      container: document.createElement("div"),
      runtime: {
        events: {
          subscribe: (listener: (event: ResttyRuntimeEvent) => void) => {
            this.listeners.add(listener);
            listener({ type: "state", state: this.state });
            return () => this.listeners.delete(listener);
          },
        },
        lifecycle: {
          init: vi.fn(async () => {
            this.state = "initializing";
            this.emit({ type: "state", state: "initializing" });
            if (initGate) await initGate;
            if (initError) throw initError;
            this.emit({ type: "backend", backend: this.backend });
            this.emit({ type: "term-size", cols: 96, rows: 31 });
            this.state = "ready";
            this.emit({ type: "state", state: "ready" });
          }),
          state: () => this.state,
        },
        render: { getBackend: () => this.backend, refresh: vi.fn() },
        io: {
          connectPty: () => {
            const transport = this.options.services.ptyTransport;
            if (!transport.isConnected())
              void transport.connect({
                url: "",
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
          getSelectionText: vi.fn(() => ""),
          getBufferText: vi.fn(() => ""),
          selectAll: vi.fn(() => false),
          scrollToBottom: vi.fn(),
          getVisibleLinkAtClientPoint: vi.fn(() => null),
          setVisibleLinkHover: vi.fn(),
          updateSize: this.updateSize,
        },
        terminal: {
          isBracketedPasteEnabled: () => false,
          setFontSize: this.setFontSize,
          setLigatures: this.setLigatures,
          setOptionKeyMode: this.setOptionKeyMode,
          setScrollbackLines: this.setScrollbackLines,
          applyTheme: this.applyTheme,
        },
      },
    } satisfies PatchedResttyPane;
    constructor(readonly options: PatchedResttyConfig) {
      this.pane.container.append(this.canvas);
      options.root.append(this.pane.container);
      instances.push(this);
    }
    getActivePane() {
      return this.pane;
    }
    emit(event: ResttyRuntimeEvent) {
      for (const listener of this.listeners) listener(event);
    }
  }
  return {
    FakeRestty,
    instances,
    setInitGate: (gate: Promise<void> | undefined) => {
      initGate = gate;
    },
    setInitError: (error: Error | undefined) => {
      initError = error;
    },
  };
});
export { harness };
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
