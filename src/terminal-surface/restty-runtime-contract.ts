import {
  Restty,
  type ResttyConfig,
  type ResttyTerminalConfig,
  type PtyTransport,
} from "restty";
import type { ResttyRuntime as UpstreamRuntime } from "restty/internal/runtime";
import type { OptionKeyMode } from "../shared/user-configuration";
import type { ResttyVisibleLinkInteraction } from "./restty-visible-links";
import type { VisibleLinkMatch } from "./visible-links";

// The checksum-guarded 0.3.0 correction owns these additions. Keep its untyped
// dependency assertion here; neither callers nor the public Surface expose it.
export type PatchedResttyRuntime = {
  readonly events: UpstreamRuntime["events"];
  readonly lifecycle: Pick<UpstreamRuntime["lifecycle"], "init" | "state">;
  readonly render: { getBackend(): string | null; refresh(): void };
  readonly io: Pick<UpstreamRuntime["io"], "connectPty">;
  readonly interaction: Pick<
    UpstreamRuntime["interaction"],
    "focus" | "updateSize"
  > &
    ResttyVisibleLinkInteraction & {
      getSelectionText(): string;
      // Retained scrollback plus screen as text, leaving the selection as is.
      getBufferText(): string;
      selectAll(): boolean;
      scrollToBottom(): void;
    };
  readonly terminal: Pick<
    UpstreamRuntime["terminal"],
    "applyTheme" | "setFontSize" | "setLigatures"
  > & {
    isBracketedPasteEnabled(): boolean;
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
export type ResttyInputOrigin = "key" | "paste" | "program";
export interface PatchedResttyServices {
  readonly ptyTransport: PtyTransport;
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
