import type { SettingsBridge } from "./settings";
import type { ExtensionsBridge } from "./extensions";
import type { SettingsTabSelection } from "./terminal-panes";
import type { AboutBridge } from "./about";
import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalContextMenuTarget,
  TerminalContextMenuRequest,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalSize,
  TerminalTabCommand,
} from "./terminal-contract";
import type { WindowChromeCommand, WindowChromeState } from "./window-chrome";
import type { TerminalRendererConfiguration } from "./user-configuration";
import type { TerminalFontData } from "./terminal-font-data";
import type { TerminalSnippetsResponse } from "./terminal-snippets";
import type { LocalImageActivation, LocalImageData } from "./local-image";

export interface TerminalBridge {
  readonly semanticInput?: import("./semantic-input").SemanticInputBridge;
  readonly mirrorTyping?: import("./mirror-typing").MirrorTypingBridge;
  readonly layout?: import("./terminal-layout").TerminalLayoutBridge;
  readonly hostedContent?: import("./extension-view").HostedContentBridge;
  readonly palette?: import("./command-palette").CommandPaletteBridge;
  configuration(): Promise<TerminalRendererConfiguration>;
  fontData(family?: string): Promise<TerminalFontData>;
  snippets(): Promise<TerminalSnippetsResponse>;
  onSnippetsToggle(listener: () => void): () => void;
  onTabBarToggle(listener: () => void): () => void;
  onAuxiliaryPanelToggle(listener: () => void): () => void;
  onFind(listener: () => void): () => void;
  onTitleBarToggle(listener: () => void): () => void;
  windowChrome(command: WindowChromeCommand): void;
  onWindowChrome(listener: (state: WindowChromeState) => void): () => void;
  onConfigurationUpdate(
    listener: (configuration: TerminalRendererConfiguration) => void,
  ): () => void;
  retainSurface(configurationId: string): Promise<string>;
  releaseSurface(surfaceId: string): void;
  // workingDirectoryOf names the session whose reported directory a split
  // pane inherits; main resolves and validates it.
  start(
    surfaceId?: string,
    workingDirectoryOf?: TerminalSessionId,
    launchToken?: string,
    restoreToken?: string,
  ): Promise<TerminalSessionId>;
  sshPane?(token: string, accepted: boolean | null): void;
  input(sessionId: TerminalSessionId, data: string): void;
  resize(sessionId: TerminalSessionId, size: TerminalSize): void;
  close(sessionId: TerminalSessionId, reason?: "rendering-failure"): void;
  title(sessionId: TerminalSessionId, request: string): void;
  bell(sessionId: TerminalSessionId): void;
  openExternalLink(url: string): void;
  loadLocalImage(source?: LocalImageActivation): Promise<LocalImageData | null>;
  onLocalImageOpen(listener: () => void): () => void;
  acknowledgeOutput(sessionId: TerminalSessionId, end: number): void;
  onOutput(
    listener: (sessionId: TerminalSessionId, data: string, end: number) => void,
  ): () => void;
  onExit(
    listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void,
  ): () => void;
  onTabCommand(listener: (command: TerminalTabCommand) => void): () => void;
  onTabTitle(
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ): () => void;
  notifyTabSelection(
    sessionId: TerminalSessionId | null | SettingsTabSelection,
    tabSessionIds?: readonly TerminalSessionId[],
  ): void;
  syncTabTitle(sessionId: TerminalSessionId): void;
  notifyTabsEmpty(reason?: "rendering-failure"): void;
  onFontZoom(listener: (command: TerminalFontZoom) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
  droppedFilePathInsertion(files: readonly File[]): string;
  confirmPaste(text: string): Promise<boolean>;
  requestClipboardContextMenu(request?: TerminalContextMenuRequest): void;
  onClipboardAction(
    listener: (
      action: TerminalClipboardAction,
      target?: TerminalContextMenuTarget,
    ) => void,
  ): () => void;
}

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
      readonly about: AboutBridge;
      readonly settings: SettingsBridge;
      readonly extensions?: ExtensionsBridge;
    };
  }
}
