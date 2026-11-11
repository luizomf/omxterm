import type { PtyTransport } from "restty";
import type { PatchedResttyServices } from "./restty-runtime-contract";
import { decodeOsc52Write } from "./osc52-clipboard";
import type { SemanticInputDelivery } from "./semantic-input-delivery";
import type {
  TerminalSurfaceOptions,
  TerminalSurface,
} from "./terminal-surface";
import { visibleLinkAtOffset } from "./visible-links";

export function resttyClipboardActions(
  delivery: SemanticInputDelivery,
  options: TerminalSurfaceOptions,
  liveSelection: () =>
    | {
        getSelectionText(): string;
        getBufferText(): string;
        selectAll(): boolean;
      }
    | undefined,
): Pick<
  TerminalSurface,
  "copy" | "paste" | "inject" | "injectTracked" | "selectAll" | "exportText"
> {
  return {
    async copy() {
      try {
        const text = liveSelection()?.getSelectionText() ?? "";
        if (!text) return;
        await options.clipboard?.writeText(text);
      } catch {
        options.onClipboardError?.();
      }
    },
    async paste() {
      options.onSemanticInput?.();
      if (options.clipboard)
        await delivery.deliverFrom(options.clipboard.readText);
    },
    async inject(text, injectOptions) {
      options.onSemanticInput?.();
      await delivery.deliver(text, injectOptions);
    },
    async injectTracked(text) {
      options.onSemanticInput?.();
      return delivery.deliverTracked(text);
    },
    selectAll: () => {
      liveSelection()?.selectAll();
    },
    exportText(kind) {
      const interaction = liveSelection();
      if (!interaction) return "";
      return kind === "selection"
        ? interaction.getSelectionText()
        : interaction.getBufferText();
    },
  };
}

export function createResttyContextMenu(
  container: HTMLElement,
  options: Pick<
    TerminalSurfaceOptions,
    "clipboard" | "contextMenuEnabled" | "onContextMenu"
  >,
  liveSelection: () => { getSelectionText(): string } | undefined = () =>
    undefined,
) {
  let enabled = options.contextMenuEnabled ?? true;
  return {
    setEnabled(value = true) {
      enabled = value;
    },
    handle(event: Event) {
      // Prior cancellation (e.g. application mouse reporting) is not a veto:
      // enabled retains the existing unconditional host-menu eligibility.
      event.preventDefault();
      if (!options.clipboard) return;
      options.onContextMenu?.();
      const query =
        event.target instanceof HTMLInputElement &&
        event.target.closest('[role="search"]') !== null &&
        container.contains(event.target);
      if (query) options.clipboard.requestContextMenu({ target: "field" });
      else if (enabled) {
        let hasSelection = false;
        try {
          hasSelection = (liveSelection()?.getSelectionText() ?? "") !== "";
        } catch {
          // A failed core read still opens the menu, offering content export.
        }
        options.clipboard.requestContextMenu({
          target: "terminal",
          hasSelection,
        });
      }
    },
  };
}

export function resttyHostServices(
  transport: PtyTransport,
  delivery: SemanticInputDelivery,
  options: TerminalSurfaceOptions,
  revealInput: () => void,
  isLive: () => boolean = () => true,
): PatchedResttyServices {
  return {
    ptyTransport: transport,
    routeKeyInput: (text) =>
      !isLive() || options.routeKeyInput?.(text) === true,
    onPasteGesture: () => {
      if (isLive()) options.onSemanticInput?.();
    },
    beforeInput: ({ text, source }) => {
      if (!isLive()) return null;
      if (source !== "paste") {
        if (source === "key" && text.length > 0) revealInput();
        return text;
      }
      void delivery.deliver(text);
      return null;
    },
    onOsc: (command: number, payload: string) => {
      if (!isLive() || command !== 52 || !options.clipboard) return;
      const text = decodeOsc52Write(payload);
      if (text === undefined) return;
      void options.clipboard
        .writeText(text)
        .catch(() => options.onClipboardError?.());
    },
    resolveVisibleLink: (candidate) =>
      visibleLinkAtOffset(
        candidate.text,
        candidate.offset,
        candidate.clippedStart,
        candidate.clippedEnd,
      ) ?? null,
  };
}
