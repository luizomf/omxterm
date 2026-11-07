import { isSemanticInputRequest } from "../shared/semantic-input";
import {
  createFilesPathInsertion,
  createFilesTerminalDropInsertion,
} from "./files-path-insertion";
import { ipcMain, type BrowserWindow } from "electron";
import type { HostedContentDescriptor } from "../shared/extension-view";
import path from "node:path";
import { PackageError } from "../installed-packages/installed-packages";
import type { Value } from "../extension-runtime/protocol";
import type {
  createExtensionManager,
  ExtensionTarget,
} from "./extension-manager";
import type { ApplicationExtensionsOptions } from "./application-extensions";
import { extensionResourceOwner } from "./extension-view-reader";
import { startExtensionViewHost } from "./extension-view-ipc";
import { createFilesTerminalDirectory } from "./files-terminal-directory";

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
  currentTarget: (window: BrowserWindow) => ExtensionTarget | undefined,
) {
  const window = target.owner as BrowserWindow;
  const lifetime = AbortSignal.any([epochSignal, target.signal]);
  const filesDirectory =
    target.presentation === "panel" && pin.manifest.id === "omxterm.files"
      ? createFilesTerminalDirectory({
          window,
          currentTarget: () => currentTarget(window),
          translator: options.translator,
          semanticInput: options.semanticInput,
          ownerSignal: target.signal,
          epochSignal,
          admit,
        })
      : undefined;
  const view = pin.manifest.view!;
  const viewOwner = {};
  if (target.mirrorContext)
    options.mirrorTyping?.bind(window, target.mirrorContext, lifetime);
  let viewId: string | undefined;
  let descriptor: HostedContentDescriptor | undefined;
  const pathRequest = createFilesPathInsertion(
    (input, signal, context, dropTicket) =>
      semanticRequest(
        input,
        signal,
        context,
        dropTicket ? { dropTicket } : true,
      ),
  );
  const insertDrop = createFilesTerminalDropInsertion(pathRequest);
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
    subscribeSelection: (listener) =>
      options.semanticInput?.subscribeSelection(window, listener) ?? (() => {}),
    filesDragSignal: lifetime,
    filesTerminalDrop:
      target.presentation === "panel" &&
      pin.manifest.id === "omxterm.files" &&
      (options.filesTerminalDrop ||
        (options.semanticInput &&
          pin.manifest.capabilities?.includes("terminal.insertPath.v1")))
        ? (input) => {
            const signal = AbortSignal.any([input.signal, lifetime]);
            if (signal.aborted || !input.source.isCurrentVisible())
              return Promise.resolve({ status: "refused" });
            if (options.filesTerminalDrop)
              return options.filesTerminalDrop(
                window,
                { ...input, signal },
                admit,
              );
            return insertDrop({ ...input, signal });
          }
        : undefined,
    onRequest(value, signal, context) {
      if (epochSignal.aborted || target.signal.aborted || signal.aborted)
        return Promise.reject(new PackageError("unavailable"));
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (value.operation === "terminal.semanticInput.v1")
          return semanticRequest(value, signal, context);
        if (value.operation === "terminal.insertPath.v1")
          return pathRequest(value, signal, context);
        if (value.operation === "terminal-directory")
          return filesDirectory
            ? filesDirectory(value, context, signal)
            : Promise.resolve(
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
    value: Value | import("../shared/semantic-input").SemanticInputRequest,
    signal: AbortSignal,
    context: import("./extension-view-host").ExtensionViewRequestContext,
    waitForDelivery: boolean | { dropTicket: string } = false,
  ) {
    if (
      !pin.manifest.capabilities?.includes(
        waitForDelivery
          ? "terminal.insertPath.v1"
          : "terminal.semanticInput.v1",
      ) ||
      !options.semanticInput ||
      !isSemanticInputRequest(value) ||
      !context.isCurrentVisible()
    )
      return Promise.reject(new PackageError("unavailable"));
    host.claimActivation(context.id);
    const delivery: [options?: boolean | { dropTicket: string }] =
      waitForDelivery ? [waitForDelivery] : [];
    return options.semanticInput.request(
      window,
      value,
      context,
      AbortSignal.any([signal, lifetime]),
      admit,
      ...delivery,
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
          AbortSignal.any([signal, lifetime]),
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
    open: async (togglePanel?: boolean, panelDefaultToken?: string) => {
      if (epochSignal.aborted || target.signal.aborted)
        throw new PackageError("unavailable");
      if (descriptor) {
        host.reveal(
          panelDefaultToken
            ? { ...descriptor, panelDefaultToken }
            : togglePanel && descriptor.presentation === "panel"
              ? { ...descriptor, toggle: true }
              : descriptor,
        );
        return;
      }
      descriptor = await host.open({
        entryResource: view.entry,
        title: view.title,
        ...(target.presentation ? { presentation: target.presentation } : {}),
        ...(panelDefaultToken ? { panelDefaultToken } : {}),
      });
      viewId = descriptor.id;
    },
    retire: host.retire,
  };
}
