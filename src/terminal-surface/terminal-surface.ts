import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import omtheme from "../../docs/omtheme.json";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  requiresProtectedPaste,
  splitTerminalPayload,
  type TerminalFontZoom,
} from "../shared/terminal-contract";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";
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
import { registerTerminalTitleEvents } from "./terminal-title-events";
import { ignoreOscLinks, registerVisibleWebLinks } from "./visible-web-links";

export interface TerminalSurface {
  focus(): void;
  zoom(command: TerminalFontZoom): void;
  copy(): Promise<void>;
  paste(): Promise<void>;
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

export interface TerminalSurfaceOptions {
  readonly scrollbackLines?: number;
  readonly optionKeyMode?: OptionKeyMode;
  readonly appearance?: TerminalAppearance;
  readonly padding?: TerminalPadding;
  readonly clipboard?: TerminalClipboard;
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
  readonly onExternalLink?: (url: string) => void;
}

const terminalTheme: ITheme = omtheme.colors;

export async function mountTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  const scrollbackLines = options.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES;
  const optionKeyMode = options.optionKeyMode ?? "none";
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
  let pendingFitFrame: number | undefined;
  const onContextMenu = (event: Event) => {
    if (!options.clipboard) return;
    event.preventDefault();
    options.clipboard.requestContextMenu();
  };

  const surface: TerminalSurface = {
    focus() {
      if (!disposed) terminal?.focus();
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
      if (!disposed && text.length > 0)
        await options.clipboard?.writeText(text);
    },
    async paste() {
      if (disposed || !terminal || !options.clipboard) return;
      const text = await options.clipboard.readText();
      if (disposed || text.length === 0) return;

      let confirmedText: string | undefined;
      if (requiresProtectedPaste(text) && !terminal.modes.bracketedPasteMode) {
        if (!(await options.clipboard.confirmPaste(text))) return;
        confirmedText = text;
      }

      if (disposed || !terminal) return;
      const bracketedPasteEnabled = terminal.modes.bracketedPasteMode;
      if (
        requiresProtectedPaste(text) &&
        !bracketedPasteEnabled &&
        confirmedText !== text
      )
        return;
      const payload = bracketedPasteEnabled
        ? `\u001b[200~${text}\u001b[201~`
        : text;
      for (const chunk of splitTerminalPayload(payload)) adapter.write(chunk);
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

  const disposeResources = (): { readonly error: unknown } | undefined => {
    if (disposed) return undefined;
    disposed = true;
    let firstError: unknown;
    let failed = false;
    for (const dispose of [
      () => resizeObserver?.disconnect(),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => {
        if (pendingFitFrame !== undefined)
          cancelAnimationFrame(pendingFitFrame);
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
    if (
      !Number.isInteger(scrollbackLines) ||
      scrollbackLines < 0 ||
      scrollbackLines > MAX_SCROLLBACK_LINES
    ) {
      throw new TypeError(
        `scrollback.lines must be an integer from 0 through ${MAX_SCROLLBACK_LINES}`,
      );
    }
    if (
      optionKeyMode !== "none" &&
      optionKeyMode !== "left" &&
      optionKeyMode !== "right" &&
      optionKeyMode !== "both"
    ) {
      throw new TypeError(
        "keyboard.optionAsAlt must be none, left, right, or both",
      );
    }

    await loadBundledTerminalFont(appearance.fontSize);

    container.style.setProperty("--terminal-padding-top", `${padding.top}px`);
    container.style.setProperty(
      "--terminal-padding-right",
      `${padding.right}px`,
    );
    container.style.setProperty(
      "--terminal-padding-bottom",
      `${padding.bottom}px`,
    );
    container.style.setProperty("--terminal-padding-left", `${padding.left}px`);

    const mountedTerminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: scrollbackLines,
      macOptionIsMeta: optionKeyMode === "both",
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      theme: terminalTheme,
    });
    terminal = mountedTerminal;
    ignoredOscLinksSubscription = ignoreOscLinks(mountedTerminal);
    titleEventSubscription = registerTerminalTitleEvents(mountedTerminal, {
      ...(options.onTitleRequest
        ? { onTitleRequest: options.onTitleRequest }
        : {}),
      ...(options.onBell ? { onBell: options.onBell } : {}),
    });
    applyOptionKeyMode(mountedTerminal, optionKeyMode);
    const mountedFitAddon = new FitAddon();
    fitAddon = mountedFitAddon;
    mountedTerminal.loadAddon(mountedFitAddon);
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
        if (!disposed && isBoundedTerminalPayload(data))
          mountedTerminal.write(data);
      },
      onExit() {
        surface.dispose();
      },
    });
    if (!disposed) mountedFitAddon.fit();
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

function applyOptionKeyMode(terminal: Terminal, mode: OptionKeyMode): void {
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

    terminal.options.macOptionIsMeta =
      mode === "both" ||
      (mode === "left" && leftOptionDown) ||
      (mode === "right" && rightOptionDown);
    return true;
  });
}
