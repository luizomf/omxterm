import type { TerminalExportKind } from "../shared/terminal-contract";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";

interface ExportSource {
  readonly removed: boolean;
  readonly surface?: TerminalSurface | undefined;
}

// Binds an export chosen from a terminal context menu to the tab whose Surface
// opened that menu. The choice reads that tab once, and nothing once the tab is
// gone, so a tab selected or exited in between cannot substitute its text.
export function createExportOwnership<Source extends ExportSource>() {
  let owner: Source | undefined;
  return {
    surfaceOptions(
      source: Source,
      options: TerminalSurfaceOptions,
    ): TerminalSurfaceOptions {
      const clipboard = options.clipboard;
      if (!clipboard) return options;
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
      return source?.removed === false
        ? source.surface?.exportText(kind)
        : undefined;
    },
  };
}
