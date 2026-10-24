import type { PtyTransport } from "restty";
import type { PatchedResttyServices } from "./restty-runtime-contract";
import { decodeOsc52Write } from "./osc52-clipboard";
import type { SemanticInputDelivery } from "./semantic-input-delivery";
import type {
  TerminalClipboard,
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
  "copy" | "paste" | "inject" | "selectAll" | "exportText"
> {
  return {
    async copy() {
      const text = liveSelection()?.getSelectionText() ?? "";
      if (!text) return;
      try {
        await options.clipboard?.writeText(text);
      } catch {
        options.onClipboardError?.();
      }
    },
    async paste() {
      if (options.clipboard)
        await delivery.deliverFrom(options.clipboard.readText);
    },
    async inject(text, injectOptions) {
      await delivery.deliver(text, injectOptions);
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

// The request reports whether text is selected, so main can label the
// contextual export it offers.
export function resttyContextMenuHandler(
  clipboard: TerminalClipboard | undefined,
  liveSelection: () => { getSelectionText(): string } | undefined,
) {
  return (event: Event) => {
    if (!clipboard) return;
    event.preventDefault();
    const hasSelection = (liveSelection()?.getSelectionText() ?? "") !== "";
    clipboard.requestContextMenu({ hasSelection });
  };
}

export function resttyHostServices(
  transport: PtyTransport,
  delivery: SemanticInputDelivery,
  options: TerminalSurfaceOptions,
  revealInput: () => void,
): PatchedResttyServices {
  return {
    ptyTransport: transport,
    beforeInput: ({ text, source }) => {
      if (source !== "paste") {
        if (source === "key" && text.length > 0) revealInput();
        return text;
      }
      void delivery.deliver(text);
      return null;
    },
    onOsc: (command: number, payload: string) => {
      if (command !== 52 || !options.clipboard) return;
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
