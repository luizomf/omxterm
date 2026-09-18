import type { TerminalFontZoom } from "../shared/terminal-contract";
import type { LocalImageActivation } from "../shared/local-image";
import type { TerminalFontData } from "../shared/terminal-font-data";
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
  dispose(): void;
}

export interface TerminalClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  confirmPaste(text: string): Promise<boolean>;
  requestContextMenu(): void;
}

export interface TerminalAppearance {
  readonly fontSize?: number;
  readonly lineHeight?: number;
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
  readonly linkHoverAvailability?: {
    isEnabled(): boolean;
    subscribe(listener: () => void): () => void;
  };
  readonly onExternalLink?: (url: string) => void;
  readonly onLocalImageActivation?: (source: LocalImageActivation) => void;
  readonly onFatalError?: (message: string) => void;
}

export { mountResttyTerminalSurface as mountTerminalSurface } from "./restty-terminal-surface";
