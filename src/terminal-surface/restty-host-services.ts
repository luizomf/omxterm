import type { PtyTransport } from "restty";
import type { PatchedResttyServices } from "./restty-runtime-contract";
import { decodeOsc52Write } from "./osc52-clipboard";
import type { SemanticInputDelivery } from "./semantic-input-delivery";
import type {
  TerminalClipboard,
  TerminalSurfaceOptions,
  TerminalSurface,
} from "./terminal-surface";
import { fileTokenAtOffset, visibleLinkAtOffset } from "./visible-links";
import type { ResttyVisibleLinkInteraction } from "./restty-visible-links";

// The file name under a window point. Restty's link lookup reads the cells;
// while `state.active` is set, the host's resolver below answers with the
// printed file name instead of a link.
export function resttyFileProbe(
  interaction: () =>
    | Pick<ResttyVisibleLinkInteraction, "getVisibleLinkAtClientPoint">
    | undefined,
) {
  const state = { active: false };
  return {
    services: (
      transport: PtyTransport,
      delivery: SemanticInputDelivery,
      options: TerminalSurfaceOptions,
      revealInput: () => void,
    ) => resttyHostServices(transport, delivery, options, revealInput, state),
    tokenAt(clientX: number, clientY: number): string | null {
      const current = interaction();
      if (!current) return null;
      state.active = true;
      try {
        return (
          current.getVisibleLinkAtClientPoint(clientX, clientY)?.url ?? null
        );
      } catch {
        // A disposed pane has nothing under the pointer.
        return null;
      } finally {
        state.active = false;
      }
    },
  };
}

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
  // While active, Restty's link lookup reports the file name under the
  // pointer instead of a link (see fileTokenAt).
  probe: { active: boolean } = { active: false },
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
      (probe.active ? fileTokenAtOffset : visibleLinkAtOffset)(
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

// A lost WebGL context ends the Surface.
export function onContextLost(
  canvas: HTMLCanvasElement,
  lost: () => void,
): void {
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      lost();
    },
    { once: true },
  );
}
