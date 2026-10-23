import { quotePathForShell } from "../shared/file-browser";
import type { Translator } from "../shared/i18n";
import type { FilesBridge } from "../shared/terminal-bridge";
import type {
  TerminalClipboard,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import {
  createLocalImagePreview,
  type LocalImageDetailsOptions,
  type LocalImagePreview,
} from "./local-image-preview";
import {
  ENGLISH_SNIPPETS_LABELS,
  type SnippetsSidebarLabels,
} from "./snippets-sidebar";
import type { TerminalTabs } from "./terminal-tabs";
import type { WindowChromeLabels } from "./window-chrome";
import type { TerminalWindowPageOptions } from "./terminal-window-host";

export function searchLabels(
  translator: Translator,
): NonNullable<TerminalSurfaceOptions["searchLabels"]> {
  return {
    placeholder: translator.t("search.placeholder"),
    previous: translator.t("search.previous"),
    next: translator.t("search.next"),
    clear: translator.t("search.clear"),
    close: translator.t("search.close"),
  };
}

export function snippetsLabels(
  translator: Translator | undefined,
): SnippetsSidebarLabels {
  if (!translator) return ENGLISH_SNIPPETS_LABELS;
  return {
    title: translator.t("menu.snippets"),
    close: translator.t("sidebar.close"),
    search: translator.t("snippets.search"),
    empty: translator.t("snippets.empty"),
    noMatch: translator.t("snippets.noMatch"),
  };
}

// The window's Local Image Preview, with details and file actions when the
// window has a translator, file access and a clipboard.
export function createWindowImagePreview(
  document: Document,
  options: TerminalWindowPageOptions,
  translator: Translator | undefined,
  tabs: () => TerminalTabs,
  onActivityChange: () => void,
): LocalImagePreview {
  const files = options.workspace?.files;
  return createLocalImagePreview(document, {
    loadImage: options.loadLocalImage!,
    ...(translator && files && options.clipboard
      ? {
          details: imagePreviewDetails(
            document,
            translator,
            files,
            options.clipboard,
            (text) => tabs().injectSnippet(text, { submit: false }),
          ),
        }
      : {}),
    focusTerminal: () => tabs().focusSelected(),
    onActivityChange,
    ...(translator ? { translator } : {}),
  });
}

// The Local Image Preview's details and actions on the shown file.
function imagePreviewDetails(
  document: Document,
  translator: Translator,
  files: Pick<FilesBridge, "open" | "reveal">,
  clipboard: Pick<TerminalClipboard, "writeText">,
  insert: (text: string) => void,
): LocalImageDetailsOptions {
  const platform = document.defaultView?.navigator.platform.startsWith("Win")
    ? "win32"
    : "posix";
  return {
    translator,
    copyPath: (path) => clipboard.writeText(path),
    insertPath: (path) => insert(`${quotePathForShell(path, platform)} `),
    open: (path) => files.open(path),
    reveal: (path) => files.reveal(path),
  };
}

export function windowChromeLabels(translator: Translator): WindowChromeLabels {
  return {
    controls: translator.t("chrome.windowControls"),
    minimize: translator.t("chrome.minimize"),
    maximize: translator.t("chrome.maximize"),
    restore: translator.t("chrome.restore"),
    close: translator.t("chrome.close"),
  };
}
