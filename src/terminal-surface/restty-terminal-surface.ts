import {
  Restty,
  type GhosttyTheme,
  type PtyCallbacks,
  type PtyTransport,
  type ResttyRuntimeEvent,
  type ResttyTerminalConfig,
} from "restty";
import type { TerminalSize } from "../shared/terminal-contract";
import type { TerminalFontData } from "../shared/terminal-font-data";
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
  type OptionKeyMode,
  type TerminalPadding,
} from "../shared/user-configuration";
import {
  DEFAULT_TERMINAL_THEME,
  isTerminalTheme,
  type TerminalTheme,
} from "../shared/terminal-theme";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";
import {
  installResttyVisibleLinks,
  requestVisibleLink,
  type ResttyVisibleLinkController,
  type ResttyVisibleLinkInteraction,
} from "./restty-visible-links";
import { resttyHostServices } from "./restty-host-services";
import { toGhosttyTheme } from "./restty-theme";
import type {
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "./terminal-surface";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontInputs,
} from "./terminal-font-stack";
const RESTTY_SCROLLBACK_MAX_BYTES = 10_000_000;

type CandidateRuntimeEvent =
  | ResttyRuntimeEvent
  | { readonly type: "title"; readonly title: string }
  | { readonly type: "bell" };

type CandidateRuntime = {
  readonly events: {
    subscribe(listener: (event: CandidateRuntimeEvent) => void): () => void;
  };
  readonly lifecycle: {
    init(): Promise<void>;
    state(): string;
  };
  readonly render: { getBackend(): string | null };
  readonly io: { connectPty(): void };
  readonly interaction: ResttyVisibleLinkInteraction & {
    focus(): void;
    getSelectionText(): string;
    selectAll(): boolean;
    scrollToBottom(): void;
    updateSize(force?: boolean): void;
  };
  readonly terminal: {
    applyTheme(theme: GhosttyTheme, sourceLabel?: string): void;
    isBracketedPasteEnabled(): boolean;
    setFontSize(value: number): void;
    setOptionKeyMode(value: OptionKeyMode): void;
    setScrollbackLines(value: number): void;
  };
};

type ResttyAppearanceConfig = ResttyTerminalConfig & {
  readonly lineHeight: number;
  readonly maxScrollbackBytes: number;
  readonly optionKeyMode: OptionKeyMode;
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
  optionKeyMode: OptionKeyMode | undefined,
  theme: TerminalTheme,
): ResttyAppearanceConfig {
  return {
    renderer: "webgl2",
    fontSize,
    lineHeight,
    maxScrollbackBytes: RESTTY_SCROLLBACK_MAX_BYTES,
    scrollbackLines,
    optionKeyMode: optionKeyMode ?? "none",
    fonts: terminalFontInputs(fontData),
    theme: toGhosttyTheme(theme),
    showResizeOverlay: false,
  };
}

function resttyDelivery(
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
  isLive: () => boolean,
  isBracketedPasteEnabled: () => boolean,
  revealInput: () => void,
): SemanticInputDelivery {
  return createSemanticInputDelivery({
    isLive,
    isBracketedPasteEnabled,
    ...(options.clipboard
      ? { confirmPaste: options.clipboard.confirmPaste }
      : {}),
    write: (chunk) => {
      revealInput();
      adapter.write(chunk);
    },
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

function releaseResttyResources(releases: ReadonlyArray<() => void>): void {
  const failures: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Terminal Surface cleanup failed");
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
  let visibleLinkController: ResttyVisibleLinkController | undefined;
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
  const revealInput = () => {
    visibleLinkController?.invalidate();
    pane?.runtime.interaction.scrollToBottom();
  };
  const delivery = resttyDelivery(
    adapter,
    options,
    () => !disposed && ready,
    () => pane?.runtime.terminal.isBracketedPasteEnabled() ?? false,
    revealInput,
  );

  const applyRuntimeTheme = (theme: TerminalTheme) => {
    pane?.runtime.terminal.applyTheme(toGhosttyTheme(theme), "OMXTerm");
  };
  const applyRuntimeSize = (fontSize: number) => {
    currentFontSize = fontSize;
    pane?.runtime.terminal.setFontSize(fontSize);
  };
  const refit = () => {
    visibleLinkController?.invalidate();
    pane?.runtime.interaction.updateSize(true);
  };
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
    pane.runtime.terminal.setOptionKeyMode(configuration.optionKeyMode);
    pane.runtime.terminal.setScrollbackLines(nextScrollbackLines);
    refit();
  };

  const dispose = (reason?: "rendering-failure") => {
    if (disposed) return;
    disposed = true;
    releaseResttyResources([
      () => delivery.dispose(),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => removeRuntimeListener?.(),
      () => visibleLinkController?.dispose(),
      () => adapter.close(reason),
      () => restty?.destroy(),
    ]);
    removeRuntimeListener = undefined;
    visibleLinkController = undefined;
  };
  const fail = (message: string) => {
    if (disposed) return;
    try {
      options.onFatalError?.(message);
    } finally {
      dispose("rendering-failure");
    }
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
      options.optionKeyMode,
      terminalTheme,
    );
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
      services: resttyHostServices(transport, delivery, options, revealInput),
    } as ConstructorParameters<typeof Restty>[0]);
    pane =
      (restty.getActivePane() as unknown as CandidatePane | null) ?? undefined;
    if (!pane) throw new Error("Restty did not create its terminal pane");

    removeRuntimeListener = pane.runtime.events.subscribe((event) => {
      if (disposed) return;
      if (event.type === "term-size") {
        visibleLinkController?.invalidate();
        settledSize = { cols: event.cols, rows: event.rows };
      } else if (event.type === "title") options.onTitleRequest?.(event.title);
      else if (event.type === "bell") options.onBell?.();
    });
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
    container.dataset.resttyFont =
      initialFamily ?? DEFAULT_TERMINAL_FONT_FAMILY;
    if (options.onExternalLink || options.onLocalImageActivation)
      visibleLinkController = installResttyVisibleLinks(
        canvas,
        pane.runtime.interaction,
        (url) => requestVisibleLink(url, options),
      );
    container.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        fail("The Restty rendering backend was lost");
      },
      { once: true },
    );

    // Backend readiness precedes PTY creation. The Adapter may synchronously
    // replay owned startup output before start resolves; its parser replies
    // must already be allowed through the established transport.
    ready = true;
    await adapter.start({
      onOutput(data) {
        if (!disposed) {
          visibleLinkController?.invalidate();
          ptyCallbacks?.onData?.(data);
        }
      },
      onExit() {
        dispose();
      },
    });
    if (disposed) return createDisposedSurface();
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
    throwInitializationFailure(cause, fail);
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

function throwInitializationFailure(
  cause: unknown,
  fail: (message: string) => void,
): never {
  const detail = cause instanceof Error ? cause.message : String(cause);
  try {
    fail(`Failed to initialize the Restty Terminal Surface: ${detail}`);
  } catch (cleanupError) {
    throw new AggregateError(
      [cause, cleanupError],
      "Failed to mount and clean the Restty Terminal Surface",
      { cause },
    );
  }
  throw new Error("Failed to mount the Restty Terminal Surface", { cause });
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
