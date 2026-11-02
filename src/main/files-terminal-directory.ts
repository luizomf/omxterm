import { BrowserWindow, dialog } from "electron";
import { PackageError } from "../installed-packages/installed-packages";
import type { Value } from "../extension-runtime/protocol";
import type { ApplicationExtensionsOptions } from "./application-extensions";
import type { ExtensionTarget } from "./extension-manager";
import type { ExtensionViewRequestContext } from "./extension-view-host";

/** Resolve one visible Files action without granting caller-selected pane access. */
export function createFilesTerminalDirectory(options: {
  window: BrowserWindow;
  currentTarget(): ExtensionTarget | undefined;
  translator: ApplicationExtensionsOptions["translator"];
  semanticInput: ApplicationExtensionsOptions["semanticInput"];
  ownerSignal: AbortSignal;
  epochSignal: AbortSignal;
  admit(signal: AbortSignal, commit: () => void): Promise<void>;
}) {
  let pending = false;
  const unavailable = () => ({
    ok: false,
    reason: "terminal-directory-unavailable",
    error: options.translator().t("extensions.noActiveTerminalDirectory"),
  });
  async function resolve(
    value: Record<string, Value>,
    context: ExtensionViewRequestContext,
    signal: AbortSignal,
  ): Promise<Value> {
    if (
      Object.keys(value).length !== 1 ||
      !context.isCurrentVisible() ||
      BrowserWindow.getFocusedWindow() !== options.window
    )
      throw new PackageError("unavailable");
    const active = options.currentTarget();
    if (
      !active ||
      active.signal.aborted ||
      !active.terminalDirectory ||
      !active.sourceSessionId ||
      !options.semanticInput
    )
      return unavailable();
    const directory = active.terminalDirectory;
    const lifetime = AbortSignal.any([
      signal,
      options.epochSignal,
      options.ownerSignal,
      active.signal,
    ]);
    const confirmed = await options.semanticInput.confirmSelection(
      options.window,
      active.sourceSessionId,
      context,
      lifetime,
    );
    if (!confirmed || lifetime.aborted || !context.isCurrentVisible())
      return {
        ok: false,
        reason: "terminal-directory-changed",
        error: options.translator().t("extensions.activeTerminalChanged"),
      };
    let decision!: Promise<Electron.MessageBoxReturnValue>;
    await options.admit(lifetime, () => {
      if (
        !context.isCurrentVisible() ||
        BrowserWindow.getFocusedWindow() !== options.window
      )
        throw new PackageError("unavailable");
      const t = options.translator();
      decision = dialog.showMessageBox(options.window, {
        type: "warning",
        title: t.t("extensions.reportedDirectoryTitle"),
        message: t.t("extensions.reportedDirectoryMessage"),
        detail: t.t("extensions.reportedDirectoryDetail", { path: directory }),
        buttons: [
          t.t("common.cancel"),
          t.t("extensions.reportedDirectoryOpen"),
        ],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        signal: lifetime,
      });
    });
    const result = await decision;
    if (lifetime.aborted || !context.isCurrentVisible()) return unavailable();
    return result.response === 1
      ? { ok: true, directory }
      : {
          ok: false,
          reason: "terminal-directory-cancelled",
          error: options
            .translator()
            .t("extensions.reportedDirectoryCancelled"),
        };
  }
  return async (
    value: Record<string, Value>,
    context: ExtensionViewRequestContext,
    signal: AbortSignal,
  ): Promise<Value> => {
    if (pending) throw new PackageError("unavailable");
    pending = true;
    try {
      return await resolve(value, context, signal);
    } finally {
      pending = false;
    }
  };
}
