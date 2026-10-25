import type { TerminalExportKind } from "../shared/terminal-contract";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";

interface ExportSource {
  readonly removed: boolean;
  // A retained pane whose session ended or whose Surface failed.
  readonly ended?: boolean;
  readonly surface?: TerminalSurface | undefined;
}

// Binds an export chosen from a terminal context menu to the pane whose Surface
// opened that menu. The choice reads that pane once, and nothing once it is
// gone or ended, so another pane or tab selected in between cannot substitute
// its text.
export function createExportOwnership<Source extends ExportSource>() {
  let owner: Source | undefined;
  return {
    // Without a source (configuration replay) the options pass unchanged.
    surfaceOptions(
      source: Source | undefined,
      options: TerminalSurfaceOptions,
    ): TerminalSurfaceOptions {
      const clipboard = options.clipboard;
      if (!clipboard || !source) return options;
      return {
        ...options,
        clipboard: {
          ...clipboard,
          requestContextMenu(request) {
            owner = request.target === "terminal" ? source : undefined;
            clipboard.requestContextMenu(request);
          },
        },
      };
    },
    exportText(kind: TerminalExportKind): string | undefined {
      const source = owner;
      owner = undefined;
      return source?.removed === false && source.ended !== true
        ? source.surface?.exportText(kind)
        : undefined;
    },
  };
}
