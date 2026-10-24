import type {
  TerminalContextMenuRequest,
  TerminalExportKind,
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

export interface TerminalSurface {
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
  // Text for an explicit export: the selected text, or the retained
  // scrollback plus screen. Reading either never changes the selection.
  exportText(kind: TerminalExportKind): string;
  dispose(): void;
}

export interface TerminalClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  confirmPaste(text: string): Promise<boolean>;
  requestContextMenu(request: TerminalContextMenuRequest): void;
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

export interface TerminalSurfaceConfiguration {
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

export interface TerminalSurfaceOptions {
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
  readonly onClipboardError?: () => void;
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
  readonly linkHoverAvailability?: {
    isEnabled(): boolean;
    subscribe(listener: () => void): () => void;
  };
  readonly onExternalLink?: (url: string) => void;
  readonly onLocalImageActivation?: (source: LocalImageActivation) => void;
  readonly onFatalError?: (message: string) => void;
}

export { mountResttyTerminalSurface as mountTerminalSurface } from "./restty-terminal-surface";
