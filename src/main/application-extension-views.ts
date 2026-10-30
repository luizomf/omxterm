import { isSemanticInputRequest } from "../shared/semantic-input";
import { ipcMain, type BrowserWindow } from "electron";
import type { HostedContentDescriptor } from "../shared/extension-view";
import path from "node:path";
import { PackageError } from "../installed-packages/installed-packages";
import type { Value } from "../extension-runtime/protocol";
import type { createExtensionManager } from "./extension-manager";
import type { ApplicationExtensionsOptions } from "./application-extensions";
import { extensionResourceOwner } from "./extension-view-reader";
import { startExtensionViewHost } from "./extension-view-ipc";

/** Own-view capability dispatch; ordinary extension data goes to its backend. */
export function applicationViews(
  options: ApplicationExtensionsOptions,
  {
    pin,
    target,
    signal: epochSignal,
    call,
    admit,
    retired,
  }: Parameters<Parameters<typeof createExtensionManager>[0]["createViews"]>[0],
) {
  const window = target.owner as BrowserWindow;
  const view = pin.manifest.view!;
  const viewOwner = {};
  if (target.mirrorContext)
    options.mirrorTyping?.bind(
      window,
      target.mirrorContext,
      AbortSignal.any([epochSignal, target.signal]),
    );
  let viewId: string | undefined;
  let descriptor: HostedContentDescriptor | undefined;
  const host = startExtensionViewHost({
    ipcMain,
    owner: window,
    preloadPath: path.join(
      options.applicationRoot,
      "preload",
      "extension-view.cjs",
    ),
    resources: extensionResourceOwner(pin),
    contentSlot: () => {
      const [width, height] = window.getContentSize();
      return { x: 0, y: 34, width: width!, height: Math.max(0, height! - 34) };
    },
    onKeybind: options.keybind,
    onRequest(value, signal, context) {
      if (epochSignal.aborted || target.signal.aborted || signal.aborted)
        return Promise.reject(new PackageError("unavailable"));
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (value.operation === "terminal.semanticInput.v1")
          return semanticRequest(value, signal, context);
        if (value.operation === "terminal-directory")
          return Promise.resolve(
            target.terminalDirectory
              ? { ok: true, directory: target.terminalDirectory }
              : {
                  ok: false,
                  error:
                    "No local terminal directory was reported at invocation. Use Home or enter a path.",
                },
          );
        if (
          value.operation === "host.capabilities" &&
          Object.keys(value).length === 1
        )
          return Promise.resolve({
            capabilities: (pin.manifest.capabilities ?? []).filter(
              (capability) => capability !== "state.v1",
            ),
          });
        if (
          value.operation === "terminal.captureLayout.v1" ||
          value.operation === "terminal.openLayout.v1"
        )
          return layoutRequest(value, signal);
        if (value.operation === "terminal.mirrorTyping.v1")
          return mirrorRequest(value, signal);
        if (value.operation === "terminal.openSsh.v1") {
          if (
            !pin.manifest.capabilities?.includes("terminal.openSsh.v1") ||
            Object.keys(value).sort().join() !== "operation,target" ||
            !viewId
          )
            return Promise.reject(new PackageError("unavailable"));
          return options.ssh.open(
            window,
            viewOwner,
            viewId,
            value.target,
            (commit) => admit(signal, commit),
          );
        }
      }
      return call(value, signal);
    },
    onViewRevoked() {
      revokeMirror();
    },
    onState(state) {
      if (state === "retiring" || state === "failed") revokeMirror();
      if (state === "settled") retired();
    },
  });
  function semanticRequest(
    value: Value,
    signal: AbortSignal,
    context: import("./extension-view-host").ExtensionViewRequestContext,
  ) {
    if (
      !pin.manifest.capabilities?.includes("terminal.semanticInput.v1") ||
      !options.semanticInput ||
      !isSemanticInputRequest(value) ||
      !context.isCurrentVisible()
    )
      return Promise.reject(new PackageError("unavailable"));
    host.claimActivation(context.id);
    return options.semanticInput.request(
      window,
      value,
      context,
      AbortSignal.any([signal, epochSignal, target.signal]),
      admit,
    );
  }
  function revokeMirror() {
    if (target.mirrorContext)
      options.mirrorTyping?.retire(window, target.mirrorContext);
  }
  function mirrorRequest(value: Record<string, Value>, signal: AbortSignal) {
    if (
      !pin.manifest.capabilities?.includes("terminal.mirrorTyping.v1") ||
      !target.mirrorContext ||
      !viewId ||
      !options.mirrorTyping
    )
      return Promise.reject(new PackageError("unavailable"));
    return options.mirrorTyping.request(
      window,
      target.mirrorContext,
      viewId,
      value,
      signal,
      admit,
    );
  }
  async function layoutRequest(
    value: Record<string, Value>,
    signal: AbortSignal,
  ) {
    if (value.operation === "terminal.captureLayout.v1") {
      if (
        !pin.manifest.capabilities?.includes("terminal.captureLayout.v1") ||
        Object.keys(value).length !== 1
      )
        throw new PackageError("unavailable");
      let capture!: ReturnType<typeof options.layout.capture>;
      await admit(signal, () => {
        capture = options.layout.capture(
          window,
          AbortSignal.any([signal, epochSignal, target.signal]),
        );
      });
      return capture;
    }
    if (
      !pin.manifest.capabilities?.includes("terminal.openLayout.v1") ||
      Object.keys(value).sort().join() !== "layout,operation" ||
      !viewId
    )
      throw new PackageError("unavailable");
    return options.layout.open(
      window,
      value.layout,
      host.captureFocusIntent(viewId),
      (commit) => admit(signal, commit),
    );
  }
  return {
    open: async (togglePanel?: boolean) => {
      if (epochSignal.aborted || target.signal.aborted)
        throw new PackageError("unavailable");
      if (descriptor) {
        host.reveal(
          togglePanel && descriptor.presentation === "panel"
            ? { ...descriptor, toggle: true }
            : descriptor,
        );
        return;
      }
      descriptor = await host.open({
        entryResource: view.entry,
        title: view.title,
        ...(target.presentation ? { presentation: target.presentation } : {}),
      });
      viewId = descriptor.id;
    },
    retire: host.retire,
  };
}
