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
    { getSelectionText(): string; selectAll(): boolean } | undefined,
): Pick<TerminalSurface, "copy" | "paste" | "inject" | "selectAll"> {
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
  };
}

export function createResttyContextMenu(
  container: HTMLElement,
  options: Pick<
    TerminalSurfaceOptions,
    "clipboard" | "contextMenuEnabled" | "onContextMenu"
  >,
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
      if (enabled || query) options.clipboard.requestContextMenu();
    },
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
