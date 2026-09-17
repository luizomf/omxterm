import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon, type IImageAddonOptions } from "@xterm/addon-image";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { Terminal } from "@xterm/xterm";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  splitTerminalPayload,
  type TerminalFontZoom,
} from "../shared/terminal-contract";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";
import type { TerminalFontData } from "../shared/terminal-font-data";
import { ChafaKittyImageAddon } from "./chafa-kitty-image-addon";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_PADDING,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_SCROLLBACK_LINES,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  type OptionKeyMode,
  type TerminalPadding,
} from "../shared/user-configuration";
import { registerOsc52Clipboard } from "./osc52-clipboard";
import { createSemanticInputDelivery } from "./semantic-input-delivery";
import { registerTerminalTitleEvents } from "./terminal-title-events";
import { ignoreOscLinks, registerVisibleWebLinks } from "./visible-web-links";
import {
  DEFAULT_TERMINAL_THEME,
  isTerminalTheme,
  type TerminalTheme,
} from "../shared/terminal-theme";

export interface TerminalSurface {
  focus(): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  applyTheme(theme: TerminalTheme): void;
  zoom(command: TerminalFontZoom): void;
  copy(): Promise<void>;
  paste(): Promise<void>;
  inject(text: string, options?: { readonly submit?: boolean }): Promise<void>;
  selectAll(): void;
  dispose(): void;
}

export interface TerminalClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  confirmPaste(text: string): Promise<boolean>;
  requestContextMenu(): void;
}

export {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_SCROLLBACK_LINES,
} from "../shared/user-configuration";
export const BUNDLED_TERMINAL_FONT_FAMILY = "JetBrainsMono Nerd Font Mono";
export const TERMINAL_IMAGE_ADDON_OPTIONS = Object.freeze({
  enableSizeReports: true,
  iipSupport: false,
  kittySizeLimit: 33_554_432,
  kittySupport: true,
  pixelLimit: 4_194_304,
  showPlaceholder: true,
  sixelSupport: false,
  storageLimit: 64,
} satisfies IImageAddonOptions);

export interface TerminalAppearance {
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly systemFont?: {
    readonly family: string;
    readonly available: boolean;
  };
}

export class MissingTerminalFontError extends Error {
  constructor(readonly family: string) {
    super(`Configured font family "${family}" is not available`);
    this.name = "MissingTerminalFontError";
  }
}

export type { OptionKeyMode } from "../shared/user-configuration";

export interface TerminalSurfaceConfiguration {
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly appearance: TerminalAppearance & {
    readonly fontSize: number;
    readonly lineHeight: number;
  };
  readonly padding: TerminalPadding;
  readonly theme: TerminalTheme;
}

export interface TerminalSurfaceOptions {
  readonly abortSignal?: AbortSignal;
  readonly loadFontData?: (family?: string) => Promise<TerminalFontData>;
  readonly scrollbackLines?: number;
  readonly optionKeyMode?: OptionKeyMode;
  readonly appearance?: TerminalAppearance;
  readonly padding?: TerminalPadding;
  readonly theme?: TerminalTheme;
  readonly clipboard?: TerminalClipboard;
  readonly onClipboardError?: () => void;
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
  readonly onExternalLink?: (url: string) => void;
  readonly onFatalError?: (message: string) => void;
}

export async function mountTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  let scrollbackLines = options.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES;
  let optionKeyMode = options.optionKeyMode ?? "none";
  let terminalTheme = options.theme ?? DEFAULT_TERMINAL_THEME;
  let appearance = resolveTerminalAppearance();
  let padding = DEFAULT_TERMINAL_PADDING;

  let disposed = false;
  let terminal: Terminal | undefined;
  let inputSubscription: { dispose(): void } | undefined;
  let resizeSubscription: { dispose(): void } | undefined;
  let osc52Subscription: { dispose(): void } | undefined;
  let titleEventSubscription: { dispose(): void } | undefined;
  let webLinksSubscription: { dispose(): void } | undefined;
  let ignoredOscLinksSubscription: { dispose(): void } | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let fitAddon: FitAddon | undefined;
  let chafaKittyImageAddon: ChafaKittyImageAddon | undefined;
  let pendingFitFrame: number | undefined;
  let pendingOutputFrame: number | undefined;
  let pendingOutputChunks: string[] = [];
  const onContextMenu = (event: Event) => {
    if (!options.clipboard) return;
    event.preventDefault();
    options.clipboard.requestContextMenu();
  };
  const delivery = createSemanticInputDelivery({
    isLive: () => !disposed && terminal !== undefined,
    isBracketedPasteEnabled: () => terminal?.modes.bracketedPasteMode ?? false,
    ...(options.clipboard
      ? { confirmPaste: options.clipboard.confirmPaste }
      : {}),
    write: (chunk) => adapter.write(chunk),
    ...(options.onClipboardError
      ? { onFailure: options.onClipboardError }
      : {}),
  });

  const surface: TerminalSurface = {
    focus() {
      if (!disposed) terminal?.focus();
    },
    applyTheme(theme) {
      if (!isTerminalTheme(theme))
        throw new TypeError("Invalid Terminal Theme update");
      if (disposed || !terminal) return;
      terminalTheme = theme;
      terminal.options.theme = theme.colors;
      container.style.setProperty(
        "--terminal-background",
        theme.colors.background,
      );
    },
    applyConfiguration(configuration) {
      const nextAppearance = resolveTerminalAppearance(
        configuration.appearance,
      );
      const nextPadding = resolveTerminalPadding(configuration.padding);
      validateScrollbackLines(configuration.scrollbackLines);
      validateOptionKeyMode(configuration.optionKeyMode);
      if (!isTerminalTheme(configuration.theme))
        throw new TypeError("Invalid Terminal Theme update");
      if (disposed || !terminal) return;

      const zoomDelta =
        (terminal.options.fontSize ?? appearance.fontSize) -
        appearance.fontSize;
      appearance = nextAppearance;
      padding = nextPadding;
      scrollbackLines = configuration.scrollbackLines;
      optionKeyMode = configuration.optionKeyMode;
      terminalTheme = configuration.theme;
      terminal.options.fontFamily = appearance.fontFamily;
      terminal.options.fontSize = Math.max(1, appearance.fontSize + zoomDelta);
      terminal.options.lineHeight = appearance.lineHeight;
      terminal.options.scrollback = scrollbackLines;
      terminal.options.theme = terminalTheme.colors;
      setContainerAppearance(container, padding, terminalTheme);
      scheduleFit();
    },
    zoom(command) {
      if (disposed || !terminal || !fitAddon) return;
      const currentSize = terminal.options.fontSize ?? appearance.fontSize;
      const nextSize =
        command === "reset"
          ? appearance.fontSize
          : command === "in"
            ? currentSize + 1
            : Math.max(1, currentSize - 1);
      if (nextSize === currentSize) return;
      terminal.options.fontSize = nextSize;
      scheduleFit();
    },
    async copy() {
      const text = terminal?.getSelection() ?? "";
      if (!disposed && text.length > 0) {
        try {
          await options.clipboard?.writeText(text);
        } catch {
          options.onClipboardError?.();
        }
      }
    },
    async paste() {
      if (!options.clipboard) return;
      await delivery.deliverFrom(options.clipboard.readText);
    },
    async inject(text, injectOptions) {
      await delivery.deliver(text, injectOptions);
    },
    selectAll() {
      if (!disposed) terminal?.selectAll();
    },
    dispose() {
      const cleanupError = disposeResources();
      if (cleanupError) throw cleanupError.error;
    },
  };

  const scheduleFit = () => {
    if (pendingFitFrame !== undefined) return;
    let ranSynchronously = false;
    const frame = requestAnimationFrame(() => {
      ranSynchronously = true;
      pendingFitFrame = undefined;
      if (!disposed) fitAddon?.fit();
    });
    if (!ranSynchronously) pendingFitFrame = frame;
  };

  const scheduleOutput = (data: string) => {
    pendingOutputChunks.push(data);
    if (pendingOutputFrame !== undefined) return;
    let ranSynchronously = false;
    const frame = requestAnimationFrame(() => {
      ranSynchronously = true;
      pendingOutputFrame = undefined;
      const payload = pendingOutputChunks.join("");
      pendingOutputChunks = [];
      if (!disposed && payload.length > 0) {
        const transformed = chafaKittyImageAddon?.transform(payload) ?? payload;
        if (transformed.length > 0) terminal?.write(transformed);
      }
    });
    if (!ranSynchronously) pendingOutputFrame = frame;
  };

  const disposeResources = (): { readonly error: unknown } | undefined => {
    if (disposed) return undefined;
    disposed = true;
    delivery.dispose();
    let firstError: unknown;
    let failed = false;
    for (const dispose of [
      () => resizeObserver?.disconnect(),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => {
        if (pendingFitFrame !== undefined)
          cancelAnimationFrame(pendingFitFrame);
      },
      () => {
        const frame = pendingOutputFrame;
        pendingOutputFrame = undefined;
        pendingOutputChunks = [];
        if (frame !== undefined) cancelAnimationFrame(frame);
      },
      () => inputSubscription?.dispose(),
      () => resizeSubscription?.dispose(),
      () => osc52Subscription?.dispose(),
      () => titleEventSubscription?.dispose(),
      () => webLinksSubscription?.dispose(),
      () => ignoredOscLinksSubscription?.dispose(),
      () => adapter.close(),
      () => terminal?.dispose(),
    ]) {
      try {
        dispose();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    return failed ? { error: firstError } : undefined;
  };

  try {
    appearance = resolveTerminalAppearance(options.appearance);
    padding = resolveTerminalPadding(options.padding);
    validateScrollbackLines(scrollbackLines);
    validateOptionKeyMode(optionKeyMode);

    await loadBundledTerminalFont(appearance.fontSize);
    setContainerAppearance(container, padding, terminalTheme);

    const mountedTerminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      // SGR 1 changes weight; applications request bright palette colors explicitly.
      drawBoldTextInBrightColors: false,
      scrollback: scrollbackLines,
      macOptionIsMeta: optionKeyMode === "both",
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      theme: terminalTheme.colors,
      // The Unicode provider API remains proposed in the pinned xterm beta; the
      // grapheme addon registers and activates its provider through it.
      allowProposedApi: true,
    });
    terminal = mountedTerminal;
    // Default xterm width is per-codepoint (wcwidth): VS16 emoji-presentation
    // sequences and ZWJ clusters get one column while their color glyph draws
    // two, so the glyph overlaps the next cell. The official grapheme addon
    // switches width to grapheme clusters so each cluster occupies two columns
    // as a single cell. xterm disposes loaded addons with the terminal.
    mountedTerminal.loadAddon(new UnicodeGraphemesAddon());
    ignoredOscLinksSubscription = ignoreOscLinks(mountedTerminal);
    titleEventSubscription = registerTerminalTitleEvents(mountedTerminal, {
      ...(options.onTitleRequest
        ? { onTitleRequest: options.onTitleRequest }
        : {}),
      ...(options.onBell ? { onBell: options.onBell } : {}),
    });
    applyOptionKeyMode(mountedTerminal, () => optionKeyMode);
    const mountedFitAddon = new FitAddon();
    fitAddon = mountedFitAddon;
    mountedTerminal.loadAddon(mountedFitAddon);
    mountedTerminal.loadAddon(new ImageAddon(TERMINAL_IMAGE_ADDON_OPTIONS));
    const mountedChafaKittyImageAddon = new ChafaKittyImageAddon({
      kittySizeLimit: TERMINAL_IMAGE_ADDON_OPTIONS.kittySizeLimit,
      pixelLimit: TERMINAL_IMAGE_ADDON_OPTIONS.pixelLimit,
    });
    chafaKittyImageAddon = mountedChafaKittyImageAddon;
    mountedTerminal.loadAddon(mountedChafaKittyImageAddon);
    if (options.onExternalLink)
      webLinksSubscription = registerVisibleWebLinks(
        mountedTerminal,
        options.onExternalLink,
      );
    mountedTerminal.open(container);
    if (options.clipboard) {
      osc52Subscription = registerOsc52Clipboard(
        mountedTerminal.parser,
        options.clipboard.writeText,
        options.onClipboardError,
      );
    }
    container.addEventListener("contextmenu", onContextMenu);

    inputSubscription = mountedTerminal.onData((data) => {
      for (const chunk of splitTerminalPayload(data)) adapter.write(chunk);
    });
    resizeSubscription = mountedTerminal.onResize(({ cols, rows }) => {
      const size = { cols, rows };
      if (isTerminalSize(size)) adapter.resize(size);
    });
    resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);

    await adapter.start({
      onOutput(data) {
        if (!disposed && isBoundedTerminalPayload(data)) scheduleOutput(data);
      },
      onExit() {
        surface.dispose();
      },
    });
    if (!disposed) {
      mountedFitAddon.fit();
      // The session can only be addressed after start resolves, so a grid
      // change fitted while start was in flight never reached it — and a fit
      // that changes nothing emits no resize event to resend it. Push the
      // settled grid so the session always matches what is on screen.
      const settledSize = {
        cols: mountedTerminal.cols,
        rows: mountedTerminal.rows,
      };
      if (isTerminalSize(settledSize)) adapter.resize(settledSize);
    }
    return surface;
  } catch (error) {
    disposeResources();
    throw new Error("Failed to mount the Terminal Surface", {
      cause: error,
    });
  }
}

function resolveTerminalAppearance(
  appearance: TerminalAppearance | undefined = undefined,
): {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
} {
  const fontSize = appearance?.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
  const lineHeight = appearance?.lineHeight ?? DEFAULT_TERMINAL_LINE_HEIGHT;
  if (!Number.isFinite(fontSize) || fontSize <= 0)
    throw new TypeError("Terminal font size must be a positive number");
  if (
    !Number.isFinite(lineHeight) ||
    lineHeight < MIN_TERMINAL_LINE_HEIGHT ||
    lineHeight > MAX_TERMINAL_LINE_HEIGHT
  )
    throw new TypeError(
      `font.lineHeight must be a finite number from ${MIN_TERMINAL_LINE_HEIGHT} through ${MAX_TERMINAL_LINE_HEIGHT}`,
    );

  const bundledFamily = quoteFontFamily(BUNDLED_TERMINAL_FONT_FAMILY);
  const systemFont = appearance?.systemFont;
  if (!systemFont)
    return { fontFamily: `${bundledFamily}, monospace`, fontSize, lineHeight };
  if (!systemFont.available)
    throw new MissingTerminalFontError(systemFont.family);
  if (
    systemFont.family.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(systemFont.family)
  )
    throw new TypeError("Configured font family must be a printable line");

  return {
    fontFamily: `${quoteFontFamily(systemFont.family)}, ${bundledFamily}, monospace`,
    fontSize,
    lineHeight,
  };
}

function resolveTerminalPadding(
  padding: TerminalPadding | undefined,
): TerminalPadding {
  const resolved = padding ?? DEFAULT_TERMINAL_PADDING;
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = resolved[side];
    if (
      !Number.isInteger(value) ||
      value < MIN_TERMINAL_PADDING ||
      value > MAX_TERMINAL_PADDING
    )
      throw new TypeError(
        `terminal.padding.${side} must be an integer from ${MIN_TERMINAL_PADDING} through ${MAX_TERMINAL_PADDING}`,
      );
  }
  return resolved;
}

function quoteFontFamily(family: string): string {
  return `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function loadBundledTerminalFont(fontSize: number): Promise<void> {
  if (!("fonts" in document) || !document.fonts) return;
  const loaded = await document.fonts.load(
    `${fontSize}px ${quoteFontFamily(BUNDLED_TERMINAL_FONT_FAMILY)}`,
  );
  if (loaded.length === 0)
    throw new Error("Bundled Terminal Font could not be loaded");
}

function validateScrollbackLines(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SCROLLBACK_LINES)
    throw new TypeError(
      `scrollback.lines must be an integer from 0 through ${MAX_SCROLLBACK_LINES}`,
    );
}

function validateOptionKeyMode(value: OptionKeyMode): void {
  if (!(["none", "left", "right", "both"] as const).includes(value))
    throw new TypeError(
      "keyboard.optionAsAlt must be none, left, right, or both",
    );
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

function applyOptionKeyMode(
  terminal: Terminal,
  currentMode: () => OptionKeyMode,
): void {
  let leftOptionDown = false;
  let rightOptionDown = false;

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.metaKey && ["c", "v", "a"].includes(event.key.toLowerCase()))
      return false;
    if (event.code === "AltLeft") leftOptionDown = event.type !== "keyup";
    if (event.code === "AltRight") rightOptionDown = event.type !== "keyup";
    if (!event.altKey) {
      leftOptionDown = false;
      rightOptionDown = false;
    }

    const mode = currentMode();
    terminal.options.macOptionIsMeta =
      mode === "both" ||
      (mode === "left" && leftOptionDown) ||
      (mode === "right" && rightOptionDown);
    return true;
  });
}
