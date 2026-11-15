import {
  Restty,
  type ResttyConfig,
  type ResttyTerminalConfig,
  type PtyTransport,
} from "restty";
import type { ResttyRuntime as UpstreamRuntime } from "restty/internal/runtime";
import type { OptionKeyMode } from "../shared/user-configuration";
import type { TerminalKeyPress } from "./terminal-surface";
import type { ResttyVisibleLinkInteraction } from "./restty-visible-links";
import type { VisibleLinkMatch } from "./visible-links";

// The checksum-guarded 0.3.0 correction owns these additions. Keep its untyped
// dependency assertion here; neither callers nor the public Surface expose it.
export type PatchedResttyRuntime = {
  readonly events: UpstreamRuntime["events"];
  readonly lifecycle: Pick<UpstreamRuntime["lifecycle"], "init" | "state">;
  readonly render: {
    getBackend(): string | null;
    refresh(): void;
    // Gives a ready pane's WebGL context back and swaps in a blank canvas; the
    // core keeps its state. False when there is no context to give back.
    release(): boolean;
    // A new context on the current canvas; false when none can be created.
    restore(): boolean;
  };
  readonly io: Pick<UpstreamRuntime["io"], "connectPty">;
  readonly interaction: Pick<
    UpstreamRuntime["interaction"],
    "focus" | "updateSize"
  > &
    ResttyVisibleLinkInteraction & {
      getSelectionText(): string;
      // Retained scrollback plus screen as text, leaving the selection as is.
      getBufferText(): string;
      // The active screen's rows, one line each, wherever the view is
      // scrolled, leaving selection, scroll and cursor as they are; null
      // while the core isn't ready.
      getScreenText(): string | null;
      // The latest finished command's output that has text, as the shell's
      // OSC 133 marks bound it, without prompt or command line; "" without.
      getLastCommandOutput(): string;
      selectAll(): boolean;
      scrollToBottom(): void;
      // Moves the view |delta| OSC 133 prompts up (negative) or down.
      scrollToPrompt(delta: number): void;
    };
  readonly terminal: Pick<
    UpstreamRuntime["terminal"],
    "applyTheme" | "setFontSize" | "setLigatures"
  > & {
    isBracketedPasteEnabled(): boolean;
    // The keymap's bytes for one press (and its release when Kitty reports
    // them) in the core's current modes; it sends nothing.
    encodeKeyPress(key: TerminalKeyPress): string;
    // Whether the alternate screen is the active one.
    isAltScreen(): boolean;
    setOptionKeyMode(value: OptionKeyMode): void;
    setScrollbackLines(value: number): void;
  };
};

export type PatchedResttyTerminalConfig = ResttyTerminalConfig & {
  readonly isSurfaceVisible?: () => boolean;
  readonly lineHeight: number;
  readonly maxScrollbackBytes: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly scrollbackLines: number;
};

// Origins emitted into beforeInput by the pinned runtime with OMXTerm's
// configuration. PTY output uses beforeRenderOutput instead; no plugins or
// arbitrary-source sendInput API are exposed by this adapter.
export type ResttyInputOrigin = "key" | "paste" | "program" | "pointer";
export interface PatchedResttyServices {
  readonly ptyTransport: PtyTransport;
  // true claims the final encoded keyboard payload, suppressing its local send.
  routeKeyInput(text: string): boolean;
  onPasteGesture(): void;
  beforeInput(payload: {
    text: string;
    source: ResttyInputOrigin;
  }): string | null;
  onOsc(command: number, payload: string): void;
  resolveVisibleLink(candidate: {
    readonly text: string;
    readonly offset: number;
    readonly clippedStart: boolean;
    readonly clippedEnd: boolean;
  }): VisibleLinkMatch | null;
}

export interface PatchedResttyPane {
  readonly container: HTMLElement;
  readonly runtime: PatchedResttyRuntime;
  clearSearch(): void;
}

export type PatchedResttyConfig = Pick<ResttyConfig, "root" | "surface"> & {
  readonly terminal: PatchedResttyTerminalConfig;
  readonly services: PatchedResttyServices;
};
export type PatchedRestty = Pick<
  Restty,
  "destroy" | "openSearch" | "isSearchOpen" | "setSearchUiStyleOptions"
> & {
  getActivePane(): PatchedResttyPane | null;
};
export const PatchedRestty = Restty as unknown as {
  new (options: PatchedResttyConfig): PatchedRestty;
};
