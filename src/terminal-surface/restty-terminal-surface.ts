import {
  Restty,
  type GhosttyTheme,
  type PtyCallbacks,
  type PtyTransport,
  type ResttyRuntimeEvent,
  type ResttyTerminalConfig,
} from "restty";
import bundledFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import type { TerminalSize } from "../shared/terminal-contract";
import type { TerminalFontData } from "../shared/terminal-font-data";
import { decodeOsc52Write } from "./osc52-clipboard";
import {
  createSemanticInputDelivery,
  type SemanticInputDelivery,
} from "./semantic-input-delivery";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_PADDING,
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  type TerminalPadding,
} from "../shared/user-configuration";
import {
  DEFAULT_TERMINAL_THEME,
  isTerminalTheme,
  type TerminalTheme,
} from "../shared/terminal-theme";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "./terminal-surface";

const BUNDLED_FONT_NAME = "JetBrainsMono Nerd Font Mono";
const RESTTY_SCROLLBACK_MAX_BYTES = 10_000_000;

type CandidateRuntime = {
  readonly events: {
    subscribe(listener: (event: ResttyRuntimeEvent) => void): () => void;
  };
  readonly lifecycle: {
    init(): Promise<void>;
    state(): string;
  };
  readonly render: { getBackend(): string | null };
  readonly io: { connectPty(): void };
  readonly interaction: {
    focus(): void;
    getSelectionText(): string;
    selectAll(): boolean;
    updateSize(force?: boolean): void;
  };
  readonly terminal: {
    applyTheme(theme: GhosttyTheme, sourceLabel?: string): void;
    isBracketedPasteEnabled(): boolean;
    setFontSize(value: number): void;
    setScrollbackLines(value: number): void;
  };
};

type ResttyAppearanceConfig = ResttyTerminalConfig & {
  readonly lineHeight: number;
  readonly maxScrollbackBytes: number;
  readonly scrollbackLines: number;
};

type CandidatePane = {
  readonly container: HTMLElement;
  readonly runtime: CandidateRuntime;
};

function resttyTerminalConfig(
  fontData: TerminalFontData,
  fontSize: number,
  lineHeight: number,
  scrollbackLines: number,
  theme: TerminalTheme,
): ResttyAppearanceConfig {
  return {
    renderer: "webgl2",
    fontSize,
    lineHeight,
    maxScrollbackBytes: RESTTY_SCROLLBACK_MAX_BYTES,
    scrollbackLines,
    fonts: [
      ...(fontData.configured
        ? [
            {
              data: fontData.configured.data,
              name: fontSourceFamily(fontData.configured),
              weight: 400,
              style: "normal" as const,
            },
          ]
        : []),
      { data: bundledFontBytes, name: BUNDLED_FONT_NAME },
      ...fontData.fallbacks.map((font) => ({
        data: font.data,
        name: fontSourceFamily(font),
      })),
    ],
    theme: toGhosttyTheme(theme),
    showResizeOverlay: false,
  };
}

function resttyDelivery(
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
  isLive: () => boolean,
  isBracketedPasteEnabled: () => boolean,
): SemanticInputDelivery {
  return createSemanticInputDelivery({
    isLive,
    isBracketedPasteEnabled,
    ...(options.clipboard
      ? { confirmPaste: options.clipboard.confirmPaste }
      : {}),
    write: (chunk) => adapter.write(chunk),
    // Keep large semantic pastes complete through asynchronous IPC and native
    // PTY queues without turning ordinary key input into scheduled work.
    chunkBytes: 512,
    pauseBetweenChunks: () =>
      new Promise((resolve) => globalThis.setTimeout(resolve, 10)),
    ...(options.onClipboardError
      ? { onFailure: options.onClipboardError }
      : {}),
  });
}

function resttyClipboardServices(
  transport: PtyTransport,
  delivery: SemanticInputDelivery,
  options: TerminalSurfaceOptions,
) {
  return {
    ptyTransport: transport,
    beforeInput: ({ text, source }: { text: string; source: string }) => {
      if (source !== "paste") return text;
      void delivery.deliver(text);
      return null;
    },
    onOsc: (command: number, payload: string) => {
      if (command !== 52 || !options.clipboard) return;
      const text = decodeOsc52Write(payload);
      if (text === undefined) return;
      void options.clipboard
        .writeText(text)
        .catch(() => options.onClipboardError?.());
    },
  };
}

async function copyResttySelection(
  pane: CandidatePane | undefined,
  options: TerminalSurfaceOptions,
  disposed: boolean,
): Promise<void> {
  const text = pane?.runtime.interaction.getSelectionText() ?? "";
  if (disposed || text.length === 0) return;
  try {
    await options.clipboard?.writeText(text);
  } catch {
    options.onClipboardError?.();
  }
}

export async function mountResttyTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  let disposed = false;
  let ready = false;
  let transportConnected = false;
  let ptyCallbacks: PtyCallbacks | undefined;
  let settledSize: TerminalSize | undefined;
  let removeRuntimeListener: (() => void) | undefined;
  let restty: Restty | undefined;
  let pane: CandidatePane | undefined;
  let baselineFontSize = resolveFontSize(options.appearance?.fontSize);
  let currentFontSize = baselineFontSize;
  const initialLineHeight = resolveLineHeight(options.appearance?.lineHeight);
  let terminalTheme = resolveTheme(options.theme);
  let padding = resolvePadding(options.padding);
  const scrollbackLines = validateScrollbackLines(options.scrollbackLines);
  const initialFamily = options.appearance?.systemFont?.family;
  const onContextMenu = (event: Event) => {
    if (!options.clipboard) return;
    event.preventDefault();
    options.clipboard.requestContextMenu();
  };
  const delivery = resttyDelivery(
    adapter,
    options,
    () => !disposed && ready,
    () => pane?.runtime.terminal.isBracketedPasteEnabled() ?? false,
  );

  const applyRuntimeTheme = (theme: TerminalTheme) => {
    pane?.runtime.terminal.applyTheme(toGhosttyTheme(theme), "OMXTerm");
  };
  const applyRuntimeSize = (fontSize: number) => {
    currentFontSize = fontSize;
    pane?.runtime.terminal.setFontSize(fontSize);
  };
  const refit = () => pane?.runtime.interaction.updateSize(true);
  const applyConfiguration = (configuration: TerminalSurfaceConfiguration) => {
    const nextBaseline = resolveFontSize(configuration.appearance.fontSize);
    resolveLineHeight(configuration.appearance.lineHeight);
    const nextPadding = resolvePadding(configuration.padding);
    const nextTheme = resolveTheme(configuration.theme);
    const nextScrollbackLines = validateScrollbackLines(
      configuration.scrollbackLines,
    );
    if (disposed || !pane) return;

    const zoomDelta = currentFontSize - baselineFontSize;
    baselineFontSize = nextBaseline;
    padding = nextPadding;
    terminalTheme = nextTheme;
    setContainerAppearance(container, padding, terminalTheme);
    applyRuntimeTheme(terminalTheme);
    applyRuntimeSize(Math.max(1, baselineFontSize + zoomDelta));
    pane.runtime.terminal.setScrollbackLines(nextScrollbackLines);
    refit();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    delivery.dispose();
    container.removeEventListener("contextmenu", onContextMenu);
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
    connect({ callbacks }) {
      if (disposed) return;
      ptyCallbacks = callbacks;
      transportConnected = true;
      callbacks.onConnect?.();
    },
    disconnect() {
      if (!transportConnected) return;
      transportConnected = false;
      const callbacks = ptyCallbacks;
      ptyCallbacks = undefined;
      callbacks?.onDisconnect?.();
    },
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
    isConnected: () => transportConnected && !disposed,
    destroy: () => undefined,
  };

  try {
    const loadedFonts = options.loadFontData
      ? await options.loadFontData(initialFamily)
      : { fallbacks: [] };
    if (options.abortSignal?.aborted)
      throw new Error("Restty initialization was cancelled");
    if (
      initialFamily !== undefined &&
      loadedFonts.configured?.family !== initialFamily
    )
      throw new Error(
        "Configured Terminal Font data did not match the requested family",
      );
    container.classList.add("restty-terminal-surface");
    setContainerAppearance(container, padding, terminalTheme);
    const terminal = resttyTerminalConfig(
      loadedFonts,
      baselineFontSize,
      initialLineHeight,
      scrollbackLines,
      terminalTheme,
    );
    const services = resttyClipboardServices(transport, delivery, options);
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
      terminal,
      services,
    } as ConstructorParameters<typeof Restty>[0]);
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

    pane.runtime.io.connectPty();
    const canvas = pane.container.querySelector("canvas");
    if (!canvas) throw new Error("Restty did not create its rendering canvas");
    container.dataset.resttyBackend = "webgl2";
    container.dataset.resttyFont = initialFamily ?? BUNDLED_FONT_NAME;
    container.addEventListener("contextmenu", onContextMenu);
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
        if (!disposed) ptyCallbacks?.onData?.(data);
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
      applyConfiguration,
      applyTheme(theme) {
        terminalTheme = resolveTheme(theme);
        if (disposed) return;
        setContainerAppearance(container, padding, terminalTheme);
        applyRuntimeTheme(terminalTheme);
      },
      zoom(command) {
        if (disposed) return;
        const nextSize =
          command === "reset"
            ? baselineFontSize
            : command === "in"
              ? currentFontSize + 1
              : Math.max(1, currentFontSize - 1);
        if (nextSize === currentFontSize) return;
        applyRuntimeSize(nextSize);
        refit();
      },
      copy: () => copyResttySelection(pane, options, disposed),
      async paste() {
        if (!options.clipboard) return;
        await delivery.deliverFrom(options.clipboard.readText);
      },
      async inject(text, injectOptions) {
        await delivery.deliver(text, injectOptions);
      },
      selectAll: () => {
        if (!disposed) pane?.runtime.interaction.selectAll();
      },
      dispose,
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    fail(`Failed to initialize the Restty Terminal Surface: ${detail}`);
    throw new Error("Failed to mount the Restty Terminal Surface", { cause });
  }
}

function validateScrollbackLines(value = DEFAULT_SCROLLBACK_LINES): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SCROLLBACK_LINES)
    throw new TypeError(
      `scrollback.lines must be an integer from 0 through ${MAX_SCROLLBACK_LINES}`,
    );
  return value;
}

function resolveFontSize(value = DEFAULT_TERMINAL_FONT_SIZE): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError("Terminal font size must be a positive number");
  return value;
}

function resolveLineHeight(value = DEFAULT_TERMINAL_LINE_HEIGHT): number {
  if (
    !Number.isFinite(value) ||
    value < MIN_TERMINAL_LINE_HEIGHT ||
    value > MAX_TERMINAL_LINE_HEIGHT
  )
    throw new TypeError(
      `font.lineHeight must be a finite number from ${MIN_TERMINAL_LINE_HEIGHT} through ${MAX_TERMINAL_LINE_HEIGHT}`,
    );
  return value;
}

function resolvePadding(value = DEFAULT_TERMINAL_PADDING): TerminalPadding {
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const sideValue = value[side];
    if (
      !Number.isInteger(sideValue) ||
      sideValue < MIN_TERMINAL_PADDING ||
      sideValue > MAX_TERMINAL_PADDING
    )
      throw new TypeError(
        `terminal.padding.${side} must be an integer from ${MIN_TERMINAL_PADDING} through ${MAX_TERMINAL_PADDING}`,
      );
  }
  return value;
}

function resolveTheme(theme = DEFAULT_TERMINAL_THEME): TerminalTheme {
  if (!isTerminalTheme(theme))
    throw new TypeError("Invalid Terminal Theme update");
  return theme;
}

function color(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: value >> 16, g: (value >> 8) & 0xff, b: value & 0xff };
}

function toGhosttyTheme(theme: TerminalTheme): GhosttyTheme {
  const colors = theme.colors;
  const palette = new Array<ReturnType<typeof color> | undefined>(256);
  const ansi = [
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
  ];
  ansi.forEach((value, index) => (palette[index] = color(value)));
  return {
    name: theme.name,
    colors: {
      background: color(colors.background),
      foreground: color(colors.foreground),
      cursor: color(colors.cursor),
      selectionBackground: color(colors.selectionBackground),
      selectionForeground: color(colors.selectionForeground),
      palette,
    },
    raw: {},
  };
}

function fontSourceFamily(font: {
  readonly family: string;
  readonly sourceFamily?: string;
}): string {
  return font.sourceFamily ?? font.family;
}

function setContainerAppearance(
  container: HTMLElement,
  padding: TerminalPadding,
  theme: TerminalTheme,
): void {
  for (const side of ["top", "right", "bottom", "left"] as const)
    container.style.setProperty(
      `--terminal-padding-${side}`,
      `${padding[side]}px`,
    );
  container.style.setProperty("--terminal-background", theme.colors.background);
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
