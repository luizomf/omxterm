import type { PtyTransport } from "restty";
import { decodeOsc52Write } from "./osc52-clipboard";
import type { SemanticInputDelivery } from "./semantic-input-delivery";
import type { TerminalSurfaceOptions } from "./terminal-surface";
import { visibleWebLinkAtOffset } from "./visible-web-links";

export function resttyHostServices(
  transport: PtyTransport,
  delivery: SemanticInputDelivery,
  options: TerminalSurfaceOptions,
  revealInput: () => void,
) {
  return {
    ptyTransport: transport,
    beforeInput: ({ text, source }: { text: string; source: string }) => {
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
    resolveVisibleLink: (candidate: {
      readonly text: string;
      readonly offset: number;
      readonly clippedStart: boolean;
      readonly clippedEnd: boolean;
    }) =>
      visibleWebLinkAtOffset(
        candidate.text,
        candidate.offset,
        candidate.clippedStart,
        candidate.clippedEnd,
      ) ?? null,
  };
}
