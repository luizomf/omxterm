import { BrowserWindow } from "electron";
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
    context: ExtensionViewRequestContext,
    signal: AbortSignal,
  ): Promise<Value> {
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
    await options.admit(lifetime, () => {
      if (
        lifetime.aborted ||
        !context.isCurrentVisible() ||
        BrowserWindow.getFocusedWindow() !== options.window
      )
        throw new PackageError("unavailable");
    });
    if (
      lifetime.aborted ||
      !context.isCurrentVisible() ||
      BrowserWindow.getFocusedWindow() !== options.window
    )
      return {
        ok: false,
        reason: "terminal-directory-changed",
        error: options.translator().t("extensions.activeTerminalChanged"),
      };
    return { ok: true, directory };
  }
  return async (
    value: Record<string, Value>,
    context: ExtensionViewRequestContext,
    signal: AbortSignal,
  ): Promise<Value> => {
    if (
      Object.keys(value).length !== 1 ||
      !context.isCurrentVisible() ||
      BrowserWindow.getFocusedWindow() !== options.window
    )
      throw new PackageError("unavailable");
    if (pending)
      return {
        ok: false,
        reason: "terminal-directory-busy",
        error: options.translator().t("extensions.terminalDirectoryBusy"),
      };
    pending = true;
    try {
      return await resolve(context, signal);
    } finally {
      pending = false;
    }
  };
}
