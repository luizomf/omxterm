import { BrowserWindow } from "electron";
import { PackageError } from "../installed-packages/installed-packages";
import type { Value } from "../extension-runtime/protocol";
import {
  formatFilePathInsertion,
  isFilePathPlatform,
} from "../shared/file-path-insertion";
import type { ApplicationExtensionsOptions } from "./application-extensions";
import type { ExtensionViewRequestContext } from "./extension-view-host";

/** Insert one captured Files path through Protected Paste, without Enter. */
export function createFilesPathInsertion(options: {
  window: BrowserWindow;
  translator: ApplicationExtensionsOptions["translator"];
  semanticInput: ApplicationExtensionsOptions["semanticInput"];
  platform: string;
  ownerSignal: AbortSignal;
  epochSignal: AbortSignal;
  admit(signal: AbortSignal, commit: () => void): Promise<void>;
}) {
  let pending = false;
  const fail = (
    reason:
      | "terminal-path-unavailable"
      | "terminal-path-changed"
      | "terminal-path-busy"
      | "terminal-path-invalid",
  ) => ({
    ok: false as const,
    reason,
    error: options
      .translator()
      .t(
        reason === "terminal-path-busy"
          ? "extensions.terminalPathBusy"
          : reason === "terminal-path-invalid"
            ? "extensions.terminalPathInvalid"
            : reason === "terminal-path-changed"
              ? "extensions.terminalPathChanged"
              : "extensions.terminalPathUnavailable",
      ),
  });
  return async (
    value: Record<string, Value>,
    context: ExtensionViewRequestContext,
    signal: AbortSignal,
  ): Promise<Value> => {
    if (
      Object.keys(value).length !== 2 ||
      value.operation !== "insert-path" ||
      typeof value.path !== "string" ||
      !context.isCurrentVisible() ||
      BrowserWindow.getFocusedWindow() !== options.window
    )
      throw new PackageError("unavailable");
    if (!options.semanticInput || !isFilePathPlatform(options.platform))
      return fail("terminal-path-unavailable");
    // Quote the path captured at action time. Do not stat or reread the listing.
    const text = formatFilePathInsertion([value.path], options.platform);
    if (!text) return fail("terminal-path-invalid");
    if (pending) return fail("terminal-path-busy");
    pending = true;
    const lifetime = AbortSignal.any([
      signal,
      options.epochSignal,
      options.ownerSignal,
    ]);
    try {
      const result = await options.semanticInput.request(
        options.window,
        {
          operation: "terminal.semanticInput.v1",
          text,
          title: "Insert path",
          intent: "insert",
          preview: false,
        },
        context,
        lifetime,
        options.admit,
      );
      if (lifetime.aborted || !context.isCurrentVisible())
        return fail("terminal-path-changed");
      return result.ok ? { ok: true } : fail("terminal-path-unavailable");
    } catch {
      return fail("terminal-path-changed");
    } finally {
      pending = false;
    }
  };
}
