import { Restty, type PtyTransport, type ResttyRuntimeEvent } from "restty";
import bundledFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import type { TerminalSize } from "../shared/terminal-contract";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "./terminal-surface";

const BUNDLED_FONT_NAME = "JetBrainsMono Nerd Font Mono";

type CandidateRuntime = {
  readonly events: {
    subscribe(listener: (event: ResttyRuntimeEvent) => void): () => void;
  };
  readonly lifecycle: {
    init(): Promise<void>;
    state(): string;
  };
  readonly render: { getBackend(): string | null };
  readonly io: { sendInput(data: string, source: "pty"): void };
  readonly interaction: { focus(): void };
};

type CandidatePane = {
  readonly container: HTMLElement;
  readonly runtime: CandidateRuntime;
};

export async function mountResttyTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  let disposed = false;
  let ready = false;
  let settledSize: TerminalSize | undefined;
  let removeRuntimeListener: (() => void) | undefined;
  let restty: Restty | undefined;
  let pane: CandidatePane | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    removeRuntimeListener?.();
    removeRuntimeListener = undefined;
    adapter.close();
    restty?.destroy();
  };
  const fail = (message: string) => {
    if (disposed) return;
    options.onFatalError?.(message);
    dispose();
  };

  const transport: PtyTransport = {
    connect: () => undefined,
    disconnect: () => undefined,
    sendInput(data) {
      if (!disposed && ready) adapter.write(data);
      return !disposed && ready;
    },
    resize(cols, rows) {
      const size = { cols, rows };
      settledSize = size;
      if (!disposed && ready) adapter.resize(size);
      return !disposed && ready;
    },
    isConnected: () => !disposed,
    destroy: () => undefined,
  };

  try {
    container.classList.add("restty-terminal-surface");
    restty = new Restty({
      root: container,
      surface: {
        autoInit: false,
        createInitialPane: true,
        defaultContextMenu: false,
        paneStyles: false,
        searchUi: false,
        shortcuts: false,
      },
      terminal: {
        renderer: "webgl2",
        fontSize: 16,
        fonts: [
          {
            data: bundledFontBytes,
            name: BUNDLED_FONT_NAME,
          },
        ],
        showResizeOverlay: false,
      },
      services: { ptyTransport: transport },
    });
    pane =
      (restty.getActivePane() as unknown as CandidatePane | null) ?? undefined;
    if (!pane) throw new Error("Restty did not create its terminal pane");

    removeRuntimeListener = pane.runtime.events.subscribe(
      (event: ResttyRuntimeEvent) => {
        if (event.type === "term-size")
          settledSize = { cols: event.cols, rows: event.rows };
      },
    );
    await pane.runtime.lifecycle.init();
    if (disposed) throw new Error("Restty initialization was cancelled");
    if (
      pane.runtime.lifecycle.state() !== "ready" ||
      pane.runtime.render.getBackend() !== "webgl2"
    )
      throw new Error(
        "Restty did not initialize an available rendering backend",
      );

    const canvas = pane.container.querySelector("canvas");
    if (!canvas) throw new Error("Restty did not create its rendering canvas");
    container.dataset.resttyBackend = "webgl2";
    container.dataset.resttyFont = BUNDLED_FONT_NAME;
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        fail("The Restty rendering backend was lost");
      },
      { once: true },
    );

    await adapter.start({
      onOutput(data) {
        if (!disposed) pane?.runtime.io.sendInput(data, "pty");
      },
      onExit() {
        dispose();
      },
    });
    if (disposed) return createDisposedSurface();
    ready = true;
    if (settledSize) adapter.resize(settledSize);

    return {
      focus: () => {
        if (!disposed) pane?.runtime.interaction.focus();
      },
      applyConfiguration: () => undefined,
      applyTheme: () => undefined,
      zoom: () => undefined,
      copy: async () => undefined,
      paste: async () => undefined,
      inject: async () => undefined,
      selectAll: () => undefined,
      dispose,
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    fail(`Failed to initialize the Restty Terminal Surface: ${detail}`);
    throw new Error("Failed to mount the Restty Terminal Surface", { cause });
  }
}

function createDisposedSurface(): TerminalSurface {
  return {
    focus: () => undefined,
    applyConfiguration: () => undefined,
    applyTheme: () => undefined,
    zoom: () => undefined,
    copy: async () => undefined,
    paste: async () => undefined,
    inject: async () => undefined,
    selectAll: () => undefined,
    dispose: () => undefined,
  };
}
