import type {
  TerminalSurfaceFailure,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { RendererLanguage, Translate } from "./renderer-language";

// The page, not a failed/disposed Surface, owns a visible failure notice's
// language binding. Retain identity, never an already-translated message.
export function bindTerminalWindowLanguage(
  document: Document,
  tabStrip: HTMLElement,
  language: RendererLanguage,
  options: {
    readonly userFileErrorBanner?: HTMLElement;
    readonly surfaceFailureBanner?: HTMLElement;
    readonly onSurfaceFailure?: (message: string) => void;
  },
) {
  let disposed = false;
  let failure: TerminalSurfaceFailure | undefined;
  let clipboardFailed = false;
  const renderFailure = (t: Translate) => {
    if (!failure && !clipboardFailed) return;
    const messages: string[] = [];
    if (failure)
      messages.push(
        failure.kind === "initialization"
          ? t("terminal.initializationFailure", { detail: failure.detail })
          : t("terminal.backendLost"),
      );
    if (clipboardFailed) messages.push(t("dialog.clipboardError.message"));
    const message = messages.join("\n");
    if (options.surfaceFailureBanner) {
      options.surfaceFailureBanner.textContent = message;
      options.surfaceFailureBanner.hidden = false;
    }
    options.onSurfaceFailure?.(message);
  };
  const unbind = language.bind((t) => {
    document.documentElement.lang = language.language;
    tabStrip.setAttribute("aria-label", t("terminal.tabs"));
    options.userFileErrorBanner?.setAttribute(
      "aria-label",
      t("terminal.userFileErrors"),
    );
    options.surfaceFailureBanner?.setAttribute(
      "aria-label",
      t("terminal.surfaceFailure"),
    );
    renderFailure(t);
  });
  const surfaceOptions: Pick<
    TerminalSurfaceOptions,
    "onFatalError" | "onClipboardError"
  > =
    options.onSurfaceFailure || options.surfaceFailureBanner
      ? {
          onClipboardError() {
            if (disposed) return;
            // A retained fatal notice must not hide another pane's action failure.
            clipboardFailed = true;
            renderFailure(language.t);
          },
          onFatalError(value) {
            if (disposed) return;
            failure = value;
            renderFailure(language.t);
          },
        }
      : {};
  return {
    surfaceOptions,
    dispose() {
      disposed = true;
      unbind();
      failure = undefined;
      clipboardFailed = false;
    },
  };
}
