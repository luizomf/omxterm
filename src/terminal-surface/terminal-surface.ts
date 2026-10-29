import type {
  TerminalContextMenuRequest,
  TerminalFontZoom,
} from "../shared/terminal-contract";
import type { LocalImageActivation } from "../shared/local-image";
import type { TerminalFontInput } from "./terminal-font-stack";
import type {
  OptionKeyMode,
  TerminalPadding,
} from "../shared/user-configuration";
export type { OptionKeyMode } from "../shared/user-configuration";
import type { TerminalTheme } from "../shared/terminal-theme";

// Current CSS-pixel cell metrics and space unavailable to the terminal grid
// (padding, borders, scrollbar, etc.). Unmeasurable/hidden/dead Surfaces return
// undefined; hosts must not infer cell size by dividing an outer box by a grid.
export interface TerminalSurfaceGeometry {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly insetWidth: number;
  readonly insetHeight: number;
}

export interface TerminalSurface {
  geometry(): TerminalSurfaceGeometry | undefined;
  focus(): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  applyTheme(theme: TerminalTheme): void;
  zoom(command: TerminalFontZoom): void;
  copy(): Promise<void>;
  paste(): Promise<void>;
  inject(text: string, options?: { readonly submit?: boolean }): Promise<void>;
  selectAll(): void;
  // Opens the in-memory scrollback search bar, or focuses it when open.
  find(): void;
  dispose(): void;
}

export interface TerminalClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  confirmPaste(text: string): Promise<boolean>;
  // The Surface sends no request; a pane host may add one.
  requestContextMenu(request?: TerminalContextMenuRequest): void;
}

export interface TerminalAppearance {
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly ligatures?: boolean;
  readonly systemFont?: {
    readonly family: string;
    readonly available: boolean;
  };
}

// Application-owned text inside the Surface, in the window language.
export interface TerminalSurfaceLabels {
  readonly surfaceRegion: string;
  readonly searchRegion: string;
  readonly searchPlaceholder: string;
  readonly searchClear: string;
  readonly searchMatchAbove: string;
  readonly searchMatchBelow: string;
  readonly searchClose: string;
}

export interface TerminalSurfaceConfiguration {
  readonly labels?: TerminalSurfaceLabels;
  readonly contextMenuEnabled?: boolean;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly appearance: TerminalAppearance & {
    readonly fontSize: number;
    readonly lineHeight: number;
    readonly ligatures: boolean;
  };
  readonly padding: TerminalPadding;
  readonly theme: TerminalTheme;
}

export interface TerminalFontInputLease {
  readonly fonts: readonly TerminalFontInput[];
  release(): void;
}

// The host localizes the application-owned frame; technical cause detail stays
// diagnostic text. Keep identity after disposal so visible notices can relabel.
export type TerminalSurfaceFailure =
  | { readonly kind: "initialization"; readonly detail: string }
  | { readonly kind: "backend-loss" };

export interface TerminalSurfaceOptions {
  readonly labels?: TerminalSurfaceLabels;
  // Standalone Surfaces focus their initial pane by default. Window/tab owners
  // disable this implicit construction side effect and call focus() explicitly.
  readonly focus?: boolean;
  // A window host may paint one shared tint behind Surface, padding and chrome.
  // Otherwise the Surface paints its own opaque default background.
  readonly background?: "surface" | "host";
  readonly abortSignal?: AbortSignal;
  readonly acquireFontInputs?: (
    family: string | undefined,
    abortSignal?: AbortSignal,
  ) => Promise<TerminalFontInputLease>;
  readonly scrollbackLines?: number;
  readonly optionKeyMode?: OptionKeyMode;
  readonly appearance?: TerminalAppearance;
  readonly padding?: TerminalPadding;
  readonly theme?: TerminalTheme;
  readonly clipboard?: TerminalClipboard;
  // Defaults to true. Only terminal content/padding, not the search query.
  readonly contextMenuEnabled?: boolean;
  // Retain host pane focus even when the terminal popup is disabled.
  readonly onContextMenu?: () => void;
  readonly onClipboardError?: () => void;
  // Core host only: final encoded genuine-key bytes, never parser/pointer input.
  // Returning true owns delivery, including a later revocation refusal.
  readonly routeKeyInput?: (text: string) => boolean;
  // Synchronous admission before native reads, raw DOM filtering or injection.
  readonly onSemanticInput?: () => void;
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
  readonly linkHoverAvailability?: {
    isEnabled(): boolean;
    subscribe(listener: () => void): () => void;
  };
  readonly onExternalLink?: (url: string) => void;
  readonly onLocalImageActivation?: (source: LocalImageActivation) => void;
  readonly onFatalError?: (failure: TerminalSurfaceFailure) => void;
}

export { mountResttyTerminalSurface as mountTerminalSurface } from "./restty-terminal-surface";
