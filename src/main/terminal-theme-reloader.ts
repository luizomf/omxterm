import type {
  TerminalTheme,
  TerminalThemeUpdate,
} from "../shared/terminal-theme";
import { MAX_USER_FILE_ERROR_LENGTH } from "../shared/user-configuration";
import { loadTerminalTheme, TerminalThemeError } from "./terminal-theme";

interface TerminalThemeReloaderOptions {
  readonly selectedPath?: string;
  readonly initialTheme: TerminalTheme;
  readonly startupNotices: readonly string[];
  readonly load?: (themePath: string) => Promise<TerminalTheme>;
  readonly apply: (update: TerminalThemeUpdate) => void;
}

export interface TerminalThemeReloader {
  readonly enabled: boolean;
  current(): TerminalThemeUpdate;
  reload(): Promise<void>;
}

export function createTerminalThemeReloader(
  options: TerminalThemeReloaderOptions,
): TerminalThemeReloader {
  let activeTheme = options.initialTheme;
  let reloadNotice: string | undefined;
  let pendingReload: Promise<void> | undefined;

  const current = (): TerminalThemeUpdate =>
    Object.freeze({
      terminalTheme: activeTheme,
      userFileErrors: Object.freeze([
        ...options.startupNotices,
        ...(reloadNotice ? [reloadNotice] : []),
      ]),
    });

  const reload = async () => {
    if (!options.selectedPath) return;
    try {
      activeTheme = await (options.load ?? loadTerminalTheme)(
        options.selectedPath,
      );
      reloadNotice = undefined;
    } catch (cause) {
      if (!(cause instanceof TerminalThemeError)) throw cause;
      reloadNotice = boundedReloadNotice(cause.message);
    }
    options.apply(current());
  };

  return {
    enabled: options.selectedPath !== undefined,
    current,
    reload() {
      if (pendingReload) return pendingReload;
      pendingReload = reload().finally(() => {
        pendingReload = undefined;
      });
      return pendingReload;
    },
  };
}

function boundedReloadNotice(detail: string): string {
  const prefix =
    "Terminal Theme reload failed. OMXTerm kept the last valid Terminal Theme. ";
  const suffix =
    " Fix the file and choose View -> Reload Terminal Theme again.";
  const available = MAX_USER_FILE_ERROR_LENGTH - prefix.length - suffix.length;
  return `${prefix}${detail.slice(0, Math.max(0, available))}${suffix}`;
}
