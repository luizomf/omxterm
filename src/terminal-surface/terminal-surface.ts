import type { TerminalContextMenuRequest } from "../shared/terminal-contract";
import type { TerminalFontZoom } from "../shared/terminal-contract";
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
  // The selected text, read without touching the clipboard.
  selectionText?(): string;
  // The whole buffer, scrollback included, as text. It selects everything to
  // read it; the selection clears at the next key press, as usual.
  outputText?(): string;
  // Opens or closes the in-terminal search bar over the scrollback.
  toggleSearch(): void;
  // The file name printed under a window point (an `ls` entry, a path), or
  // null over blank cells.
  fileTokenAt?(clientX: number, clientY: number): string | null;
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
  // Keyboard input typed into this Surface (never parser replies or paste).
  readonly onUserInput?: (text: string) => void;
  // A pure, order-preserving transform of PTY output before parsing, used for
  // output highlighting. It must only insert SGR sequences.
  readonly transformOutput?: (data: string) => string;
  // A program reported its working directory through OSC 7 (file:// URI).
  readonly onWorkingDirectory?: (uri: string) => void;
  readonly linkHoverAvailability?: {
    isEnabled(): boolean;
    subscribe(listener: () => void): () => void;
  };
  readonly onExternalLink?: (url: string) => void;
  readonly onLocalImageActivation?: (source: LocalImageActivation) => void;
  readonly onFatalError?: (message: string) => void;
  // Keep the final screen after a non-zero exit instead of disposing, so a
  // failed connection's error stays readable. Input is refused afterwards.
  readonly retainOnExit?: boolean;
  // Labels for the search bar; English when absent.
  readonly searchLabels?: {
    readonly placeholder: string;
    readonly previous: string;
    readonly next: string;
    readonly clear: string;
    readonly close: string;
  };
}

export { mountResttyTerminalSurface as mountTerminalSurface } from "./restty-terminal-surface";
