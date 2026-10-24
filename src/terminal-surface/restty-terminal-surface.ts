import type { PtyCallbacks, PtyTransport } from "restty";
import {
  PatchedRestty,
  type PatchedResttyPane,
  type PatchedResttyTerminalConfig,
} from "./restty-runtime-contract";
import type { TerminalSize } from "../shared/terminal-contract";
import {
  createSemanticInputDelivery,
  type SemanticInputDelivery,
} from "./semantic-input-delivery";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_LIGATURES,
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
} from "./restty-visible-links";
import {
  resttyClipboardActions,
  resttyContextMenuHandler,
  resttyHostServices,
} from "./restty-host-services";
import { toGhosttyTheme, toResttySearchUiStyle } from "./restty-theme";
import {
  applySearchTheme,
  focusedSearchField,
  retainSearchEscapeGesture,
  withSearchFieldClipboard,
} from "./restty-search-field";
import type {
  TerminalFontInputLease,
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "./terminal-surface";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontInputs,
  type TerminalFontInput,
} from "./terminal-font-stack";
const RESTTY_SCROLLBACK_MAX_BYTES = 10_000_000;

function resttyTerminalConfig(
  fonts: readonly TerminalFontInput[],
  [fontSize, lineHeight, ligatures]: readonly [number, number, boolean],
  scrollbackLines: number,
  optionKeyMode: OptionKeyMode | undefined,
  theme: TerminalTheme,
): PatchedResttyTerminalConfig {
  return {
    renderer: "webgl2",
    fontSize,
    lineHeight,
    ligatures,
    maxScrollbackBytes: RESTTY_SCROLLBACK_MAX_BYTES,
    scrollbackLines,
    optionKeyMode: optionKeyMode ?? "none",
    fonts: [...fonts],
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

export async function mountResttyTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  let disposed = false;
  const isCancelled = () => options.abortSignal?.aborted === true;
  const isInactive = () => disposed || isCancelled();
  let ready = false;
  let transportConnected = false;
  let ptyCallbacks: PtyCallbacks | undefined;
  let settledSize: TerminalSize | undefined;
  let removeRuntimeListener: (() => void) | undefined;
  let visibleLinkController: ResttyVisibleLinkController | undefined;
  let restty: PatchedRestty | undefined;
  let fontLease: TerminalFontInputLease | undefined;
  let pane: PatchedResttyPane | undefined;
  let baselineFontSize = resolveFontSize(options.appearance?.fontSize);
  let currentFontSize = baselineFontSize;
  const initialLineHeight = resolveLineHeight(options.appearance?.lineHeight);
  const initialLigatures =
    options.appearance?.ligatures ?? DEFAULT_TERMINAL_FONT_LIGATURES;
  let terminalTheme = resolveTheme(options.theme);
  let padding = resolvePadding(options.padding);
  const scrollbackLines = validateScrollbackLines(options.scrollbackLines);
  const initialFamily = options.appearance?.systemFont?.family;
  const live = () => (disposed ? undefined : pane?.runtime.interaction);
  const onContextMenu = resttyContextMenuHandler(options.clipboard, live);
  const releaseSearchEscape = retainSearchEscapeGesture(container);
  const revealInput = () => {
    visibleLinkController?.invalidate();
    pane?.runtime.interaction.scrollToBottom();
  };
  const delivery = resttyDelivery(
    adapter,
    options,
    () => !isInactive() && ready,
    () => pane?.runtime.terminal.isBracketedPasteEnabled() ?? false,
    revealInput,
  );

  const applyContainerAppearance = () =>
    paintContainer(container, padding, terminalTheme, options.background);
  const applyRuntimeTheme = (theme: TerminalTheme) => {
    pane?.runtime.terminal.applyTheme(toGhosttyTheme(theme), "OMXTerm");
    applySearchTheme(restty, container, theme);
  };
  const isSurfaceVisible = () =>
    !isInactive() && !container.hidden && container.isConnected;
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
    const nextLigatures = configuration.appearance.ligatures;
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
    applyContainerAppearance();
    applyRuntimeTheme(terminalTheme);
    applyRuntimeSize(Math.max(1, baselineFontSize + zoomDelta));
    pane.runtime.terminal.setLigatures(nextLigatures);
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
      releaseSearchEscape,
      () => visibleLinkController?.dispose(),
      () => adapter.close(reason),
      () => restty?.destroy(),
      () => fontLease?.release(),
    ]);
    fontLease = undefined;
    removeRuntimeListener = undefined;
    visibleLinkController = undefined;
  };
  const fail = (message: string) => {
    if (isInactive()) return;
    try {
      options.onFatalError?.(message);
    } finally {
      dispose("rendering-failure");
    }
  };

  const transport: PtyTransport = {
    connect({ callbacks }) {
      if (isInactive()) return;
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
      if (!isInactive() && ready) adapter.write(data);
      return !isInactive() && ready;
    },
    resize(cols, rows) {
      const size = { cols, rows };
      settledSize = size;
      if (!isInactive() && ready) adapter.resize(size);
      return !isInactive() && ready;
    },
    isConnected: () => transportConnected && !isInactive(),
    destroy: () => undefined,
  };

  try {
    if (isInactive()) return createDisposedSurface();
    fontLease = await acquireSurfaceFonts(options, initialFamily);
    if (isInactive()) return createDisposedSurface();
    container.classList.add("restty-terminal-surface");
    applyContainerAppearance();
    const terminal = resttyTerminalConfig(
      fontLease.fonts,
      [baselineFontSize, initialLineHeight, initialLigatures],
      scrollbackLines,
      options.optionKeyMode,
      terminalTheme,
    );
    restty = new PatchedRestty({
      root: container,
      surface: resttySurfaceConfig(terminalTheme),
      terminal: { ...terminal, isSurfaceVisible },
      services: resttyHostServices(transport, delivery, options, revealInput),
    });
    pane = restty.getActivePane() ?? undefined;
    if (!pane) throw new Error("Restty did not create its terminal pane");
    applySearchTheme(restty, container, terminalTheme);

    removeRuntimeListener = pane.runtime.events.subscribe((event) => {
      if (isInactive()) return;
      if (event.type === "term-size") {
        visibleLinkController?.invalidate();
        settledSize = { cols: event.cols, rows: event.rows };
      } else if (event.type === "title") options.onTitleRequest?.(event.title);
      else if (event.type === "bell") options.onBell?.();
    });
    await pane.runtime.lifecycle.init();
    if (isInactive()) return createDisposedSurface();
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
        navigator.platform,
        options.linkHoverAvailability,
      );
    container.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        fail("The OMXTerm Terminal Surface rendering backend was lost");
      },
      { once: true },
    );

    // Allow parser replies before startup output can replay synchronously.
    ready = true;
    await adapter.start({
      onOutput(data) {
        if (!isInactive()) {
          visibleLinkController?.invalidate();
          ptyCallbacks?.onData?.(data);
          // Hidden ingestion still retires renderer copies, including pending
          // image decodes, even when the document's RAF is throttled.
          if (!isSurfaceVisible()) pane?.runtime.render.refresh();
        }
      },
      onExit() {
        dispose();
      },
    });
    if (isInactive()) return createDisposedSurface();
    if (settledSize) adapter.resize(settledSize);
    pane.runtime.render.refresh();

    return {
      focus: () => {
        // Window focus returns to a focused query field, not the terminal.
        if (disposed || focusedSearchField(restty, container)) return;
        refit();
        pane?.runtime.interaction.focus();
        // Tab selection calls focus in the switching task, before presentation.
        pane?.runtime.render.refresh();
      },
      applyConfiguration,
      applyTheme(theme) {
        terminalTheme = resolveTheme(theme);
        if (disposed) return;
        applyContainerAppearance();
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
      ...withSearchFieldClipboard(
        resttyClipboardActions(delivery, options, live),
        () => (disposed ? undefined : focusedSearchField(restty, container)),
        options,
      ),
      find: () => openSearch(disposed ? undefined : restty),
      dispose,
    };
  } catch (cause) {
    // A removed owner may reject at any pending boundary. It is cancellation,
    // not evidence of a broken backend; live-owner failures still report.
    if (!isCancelled()) throwInitializationFailure(cause, fail);
    return createDisposedSurface();
  } finally {
    // Release late resources after settlement; cleanup errors still propagate.
    if (isCancelled()) dispose();
  }
}

async function acquireSurfaceFonts(
  options: TerminalSurfaceOptions,
  family: string | undefined,
): Promise<TerminalFontInputLease> {
  return options.acquireFontInputs
    ? options.acquireFontInputs(family, options.abortSignal)
    : {
        fonts: terminalFontInputs({ fallbacks: [] }, family),
        release: () => undefined,
      };
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
    fail(`Failed to initialize the OMXTerm Terminal Surface: ${detail}`);
  } catch (cleanupError) {
    throw new AggregateError(
      [cause, cleanupError],
      "Failed to mount and clean the OMXTerm Terminal Surface",
      { cause },
    );
  }
  throw new Error("Failed to mount the OMXTerm Terminal Surface", { cause });
}

function openSearch(restty: PatchedRestty | undefined): void {
  restty?.openSearch({ selectAll: true });
}

function resttySurfaceConfig(theme: TerminalTheme) {
  return {
    autoInit: false,
    createInitialPane: true,
    defaultContextMenu: false,
    paneStyles: false,
    // Opened only through the application's find keybind and menu item.
    searchUi: { shortcut: false, styles: toResttySearchUiStyle(theme) },
    shortcuts: false,
  };
}

function paintContainer(
  container: HTMLElement,
  padding: TerminalPadding,
  theme: TerminalTheme,
  background: TerminalSurfaceOptions["background"],
): void {
  container.style.backgroundColor =
    background === "host" ? "transparent" : theme.colors.background;
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
    find: () => undefined,
    exportText: () => "",
    dispose: () => undefined,
  };
}
