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
    { getSelectionText(): string; selectAll(): boolean } | undefined,
): Pick<
  TerminalSurface,
  "copy" | "paste" | "inject" | "selectAll" | "selectionText" | "outputText"
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
    selectionText: () => liveSelection()?.getSelectionText() ?? "",
    outputText() {
      const interaction = liveSelection();
      return interaction?.selectAll() ? interaction.getSelectionText() : "";
    },
  };
}

export function resttyContextMenuHandler(
  clipboard: TerminalClipboard | undefined,
) {
  return (event: Event) => {
    if (!clipboard) return;
    event.preventDefault();
    clipboard.requestContextMenu();
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
        if (source === "key" && text.length > 0) {
          revealInput();
          options.onUserInput?.(text);
        }
        return text;
      }
      void delivery.deliver(text);
      return null;
    },
    onOsc: (command: number, payload: string) => {
      if (command === 7) {
        if (isWorkingDirectoryReport(payload))
          options.onWorkingDirectory?.(payload);
        return;
      }
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

// OSC 7 reports "file://host/path". Only bounded, control-free file URIs are
// forwarded; main resolves and validates the path before using it.
export const MAX_WORKING_DIRECTORY_REPORT_LENGTH = 4096;
export function isWorkingDirectoryReport(payload: string): boolean {
  return (
    payload.length <= MAX_WORKING_DIRECTORY_REPORT_LENGTH &&
    /^file:\/\/[^/]*\//u.test(payload) &&
    !/\p{Cc}/u.test(payload)
  );
}
