import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Translator } from "../shared/i18n";
import { terminalIpc } from "../shared/terminal-ipc";
import type { createWindowActionSender } from "./window-action-delivery";
import {
  InstalledPackages,
  createNativeLeaseAdapter,
  PackageError,
} from "../installed-packages/installed-packages";
import { createExtensionRuntime } from "../extension-runtime/electron-runtime";
import {
  createExtensionManager,
  type ExtensionTarget,
} from "./extension-manager";
import { createExtensionPackageTrust } from "./extension-package-trust";
import { installExtensionFromDialog } from "./extension-install-dialog";
import { ExtensionDownloadError } from "./extension-download";
import { CatalogError, createExtensionCatalog } from "./extension-catalog";
import { createCatalogAcquisition } from "./extension-catalog-acquisition";
import { createExtensionLinkInstaller } from "./extension-link-install";
import { applicationViews } from "./application-extension-views";
import { extensionPresentation } from "./extension-presentation";
import { MirrorSetupError } from "./mirror-typing-ipc";
import { startExtensionViewHost } from "./extension-view-ipc";
import {
  extensionsIpc,
  isExtensionsRequest,
  type ExtensionsResult,
} from "../shared/extensions";
import type { IpcEvent } from "./terminal-ipc-types";
import type { CoreAction } from "./action-catalog";

function managementFailure(error: unknown): ExtensionsResult {
  // Never expose native errors/URLs or turn uncertain publication into success.
  const errorCode =
    error instanceof PackageError ||
    error instanceof ExtensionDownloadError ||
    error instanceof CatalogError
      ? error.code
      : "outcome-unknown";
  return { ok: false, error: errorCode };
}

type Installation = Awaited<
  ReturnType<ReturnType<typeof createExtensionManager>["snapshot"]>
>[number];

type ExtensionTargetCapture = (
  sessionId?: string,
  context?: "window",
) => ExtensionTarget;

function managementEntry(entry: Installation) {
  return {
    id: entry.id,
    generation: entry.generation,
    name: entry.manifest?.name ?? entry.id,
    version: entry.manifest?.version ?? null,
    installed: entry.digest !== null,
    enabled: entry.enabled,
    local: entry.local,
  };
}

async function applicationManager(
  options: Parameters<typeof startApplicationExtensions>[0],
  owner: AbortSignal,
) {
  const runtime = { appVersion: app.getVersion(), apiVersion: "0.1.0" };
  const root = path.join(app.getPath("userData"), "extensions");
  const addon = path.join(
    options.applicationRoot,
    "extension-runtime",
    "extension-leases.node",
  );
  const packages = await InstalledPackages.open({
    root,
    runtime,
    leases: createNativeLeaseAdapter(addon),
  });
  const backend = await createExtensionRuntime({
    root,
    runtime,
    addon,
    bootstrap: path.join(
      options.applicationRoot,
      "extension-runtime",
      "bootstrap.mjs",
    ),
    environment: process.env,
    owner,
  });
  const manager = createExtensionManager({
    packages,
    runtime: backend,
    trust: createExtensionPackageTrust({
      packages,
      runtime,
      temporaryDirectory: app.getPath("temp"),
    }),
    createViews: (input) => applicationViews(options, input),
  });
  try {
    return { manager, installations: await manager.snapshot() };
  } catch {
    await manager.dispose();
    return undefined;
  }
}

export type ApplicationExtensionsOptions = {
  applicationRoot: string;
  semanticInput?: Pick<
    ReturnType<typeof import("./semantic-input-ipc").registerSemanticInputIpc>,
    "request"
  >;
  mirrorTyping?: ReturnType<
    typeof import("./mirror-typing-ipc").registerMirrorTypingIpc
  >;
  layout: {
    capture: ReturnType<
      typeof import("./terminal-layout-ipc").registerTerminalLayoutIpc
    >["capture"];
    open: ReturnType<
      typeof import("./terminal-layout-transfer").createTerminalLayoutTransfer<BrowserWindow>
    >["open"];
  };
  ssh: Pick<
    ReturnType<
      typeof import("./ssh-terminal-launch").createSshTerminalLaunch<BrowserWindow>
    >,
    "open"
  >;
  isTrustedSender(event: IpcEvent): boolean;
  changed(): void;
  translator(): Translator;
  sendAction: ReturnType<typeof createWindowActionSender>["sendAction"];
  keybind: NonNullable<
    Parameters<typeof startExtensionViewHost>[0]["onKeybind"]
  >;
};

async function invokeExtension(
  options: ApplicationExtensionsOptions,
  captured: ExtensionTarget,
  source: ExtensionTarget,
  open: (target: ExtensionTarget) => Promise<void>,
  mirror: boolean,
  stopping: () => boolean,
) {
  const window = captured.owner as BrowserWindow;
  try {
    let invocation = captured;
    if (mirror) {
      if (!options.mirrorTyping) throw new PackageError("unavailable");
      const signal = AbortSignal.any([captured.signal, source.signal]);
      const mirrorContext = await options.mirrorTyping.capture(
        window,
        signal,
        source.sourceSessionId,
      );
      invocation = { ...captured, signal, mirrorContext };
    }
    await open(invocation);
  } catch (error) {
    if (!window.isDestroyed() && !stopping()) {
      const t = options.translator().t;
      const eligibility =
        error instanceof MirrorSetupError ? error.reason : undefined;
      void dialog.showMessageBox(window, {
        type: "error",
        message: t(
          eligibility ? "mirrorTyping.title" : "extensions.unavailable",
        ),
        detail: t(
          eligibility === "focus-live-pane"
            ? "mirrorTyping.focusLivePane"
            : eligibility === "need-two-panes"
              ? "mirrorTyping.needTwoPanes"
              : "extensions.unavailableDetail",
        ),
      });
    }
  }
}

function captureExtensionTarget(
  source: ExtensionTarget,
  context: "window" | undefined,
  presentation: "panel" | undefined,
  captureWindow: ExtensionTargetCapture | undefined,
): ExtensionTarget | undefined {
  if (presentation !== "panel" && context !== "window") return source;
  const windowTarget = captureWindow?.(source.sourceSessionId, "window");
  return presentation === "panel"
    ? windowTarget && {
        ...windowTarget,
        terminalDirectory: source.terminalDirectory,
        presentation,
      }
    : windowTarget;
}

async function acknowledgeExtension(
  pending: Map<BrowserWindow, { token: string; invoke(): Promise<void> }>,
  window: BrowserWindow,
  token: string,
  accepted: boolean,
  stopping: boolean,
): Promise<ExtensionsResult> {
  const issued = pending.get(window);
  if (!issued || issued.token !== token)
    return { ok: false, error: "unavailable" };
  pending.delete(window);
  if (!accepted || BrowserWindow.getFocusedWindow() !== window || stopping)
    return { ok: false, error: "unavailable" };
  await issued.invoke();
  return { ok: true };
}

// Startup creates infrastructure, never activates installed code. Unsupported
// platforms retain Settings with an explicit preview-unavailable result.
export async function startApplicationExtensions(
  options: ApplicationExtensionsOptions,
) {
  const windows = new Map<BrowserWindow, ExtensionTargetCapture>();
  const lifetime = new AbortController();
  const pending = new Map<
    BrowserWindow,
    { token: string; invoke(): Promise<void> }
  >();
  let stopping = false;
  const catalog = createExtensionCatalog(
    { appVersion: app.getVersion(), apiVersion: "0.1.0" },
    `${process.platform}-${process.arch}`,
  );
  const catalogLoads = createCatalogAcquisition(catalog);
  const supported =
    (process.platform === "linux" || process.platform === "darwin") &&
    process.arch === "arm64";
  // Broken extension infrastructure must not prevent terminal startup.
  const initialized = supported
    ? await applicationManager(options, lifetime.signal).catch(() => undefined)
    : undefined;
  const manager = initialized?.manager;
  let installations = initialized?.installations ?? [];
  async function refresh(): Promise<ExtensionsResult> {
    if (!manager)
      return {
        ok: false,
        error: supported ? "runtime-unavailable" : "unsupported",
      };
    installations = await manager.snapshot();
    options.changed();
    return {
      ok: true,
      pendingCleanup: manager.pendingCleanup(),
      entries: installations.map(managementEntry),
      catalog: catalog.snapshot(installations),
    };
  }
  const busy = new Set<BrowserWindow>();
  const links = createExtensionLinkInstaller(
    () => stopping,
    options.translator,
  );
  ipcMain.handle(
    extensionsIpc,
    async (event, ...args: unknown[]): Promise<ExtensionsResult> => {
      if (
        stopping ||
        !options.isTrustedSender(event) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error("Rejected extension management owner");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (
        !window ||
        !windows.has(window) ||
        args.length !== 1 ||
        !isExtensionsRequest(args[0])
      )
        throw new TypeError("Invalid extension management request");
      if (args[0].operation === "open")
        return acknowledgeExtension(
          pending,
          window,
          args[0].token,
          args[0].accepted,
          stopping,
        );
      if (args[0].operation === "cancel-install") {
        links.cancel(window, args[0].token);
        catalogLoads.cancel(window, args[0].token);
        return { ok: true };
      }
      if (!manager) return refresh();
      if (args[0].operation === "catalog-refresh") {
        try {
          await catalogLoads.refresh(window, args[0].token);
          return { ok: true, catalog: catalog.snapshot(installations) };
        } catch (error) {
          return {
            ...managementFailure(error),
            catalog: catalog.snapshot(installations),
          };
        }
      }
      if (busy.has(window)) return { ok: false, error: "busy" };
      busy.add(window);
      try {
        const request = args[0];
        if (request.operation === "snapshot") await manager.collect();
        if (request.operation === "catalog-install") {
          const release = catalog.select(request.selection);
          await links.install(
            window,
            manager,
            {
              operation: "install-link",
              url: release.archive.url,
              token: request.token,
            },
            release,
          );
        } else if (request.operation === "install-link")
          await links.install(window, manager, request);
        else if (request.operation === "install")
          await installExtensionFromDialog(
            window,
            manager,
            () => stopping,
            options.translator,
          );
        else if (request.operation === "uninstall")
          await manager.uninstall(request.id, request.generation);
        else if (
          request.operation === "enable" ||
          request.operation === "disable"
        )
          await manager.setEnabled(
            request.id,
            request.generation,
            request.operation === "enable",
          );
        return await refresh();
      } catch (error) {
        return managementFailure(error);
      } finally {
        busy.delete(window);
      }
    },
  );
  const capture = (window: BrowserWindow | undefined, sessionId?: string) =>
    window ? windows.get(window)?.(sessionId) : undefined;
  function actions(
    target?: ExtensionTarget,
    claim?: () => boolean,
    snippetsCompatibility = false,
  ): CoreAction[] {
    if (stopping) return [];
    return installations.flatMap((entry) => {
      if ((entry.id === "omxterm.snippets") !== snippetsCompatibility)
        return [];
      const view = entry.enabled && entry.digest && entry.manifest?.view;
      if (!view) return [];
      const presentation = extensionPresentation(entry.manifest!);
      const open = manager!.action({
        id: entry.id,
        generation: entry.generation,
        digest: entry.digest!,
      });
      return [
        {
          id: view.action,
          label: view.title,
          accelerator: null,
          palette: true,
          extension: true,
          invoke() {
            if (claim && !claim()) return;
            const source =
              target ?? capture(BrowserWindow.getFocusedWindow() ?? undefined);
            const captured =
              source &&
              captureExtensionTarget(
                source,
                view.context,
                presentation,
                windows.get(source.owner as BrowserWindow),
              );
            if (!captured || captured.signal.aborted || stopping) return;
            const window = captured.owner as BrowserWindow;
            const token = randomUUID();
            pending.set(window, {
              token,
              invoke: () =>
                invokeExtension(
                  options,
                  snippetsCompatibility
                    ? { ...captured, togglePanel: true }
                    : captured,
                  source!,
                  open,
                  entry.manifest?.capabilities?.includes(
                    "terminal.mirrorTyping.v1",
                  ) === true,
                  () => stopping,
                ),
            });
            options.sendAction(window.webContents, terminalIpc.tabCommand, {
              action: snippetsCompatibility
                ? "toggle-snippets-extension"
                : "open-extension",
              token,
            });
          },
        },
      ];
    });
  }
  return {
    actions,
    capture,
    toggleSnippets(window: BrowserWindow) {
      if (stopping || BrowserWindow.getFocusedWindow() !== window) return;
      const target = capture(window);
      if (!target || target.signal.aborted) return;
      const action = actions(target, undefined, true).find(
        (entry) => entry.id === "omxterm.snippets.open",
      );
      if (action) action.invoke();
      else
        options.sendAction(window.webContents, terminalIpc.tabCommand, {
          action: "snippets-management",
        });
    },
    contextMenu(
      window: BrowserWindow,
      sessionId: string | undefined,
      claim: () => boolean,
    ) {
      const target = capture(window, sessionId);
      return target
        ? actions(
            target,
            () => BrowserWindow.getFocusedWindow() === window && claim(),
          ).map(({ label, invoke: click }) => ({ label, click }))
        : [];
    },
    registerWindow(window: BrowserWindow, target: ExtensionTargetCapture) {
      const contents = window.webContents;
      windows.set(window, target);
      window.once("closed", () => {
        windows.delete(window);
        pending.delete(window);
        // The native window getter is no longer usable after closed.
        manager?.cancel(contents);
      });
    },
    async dispose() {
      stopping = true;
      links.dispose();
      catalogLoads.dispose();
      pending.clear();
      ipcMain.removeHandler(extensionsIpc);
      lifetime.abort();
      return (await manager?.dispose()) ?? true;
    },
  };
}
