import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { DefaultSnippetsSeed } from "./default-snippets";
import { createPanelDefault, type PendingExtensionOpen } from "./panel-default";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Translator } from "../shared/i18n";
import type { HostedPresentationKind } from "../shared/extension-view";
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
import {
  companionToolShortcut,
  extensionPresentation,
} from "./extension-presentation";
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

/** An enabled, installed extension declares this capability. */
function declares(installations: Installation[], capability: string) {
  return installations.some(
    (entry) =>
      entry.enabled &&
      entry.digest !== null &&
      (entry.manifest?.capabilities as string[] | undefined)?.includes(
        capability,
      ) === true,
  );
}

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
  windows: Map<BrowserWindow, ExtensionTargetCapture>,
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
  const warning = await options.defaultSnippets?.install(packages);
  if (warning) options.onDefaultSnippetsWarning?.(warning);
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
    createViews: (input) =>
      applicationViews(options, input, (window) => windows.get(window)?.()),
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
  defaultSnippets?: DefaultSnippetsSeed;
  onDefaultSnippetsWarning?(warning: string): void;
  semanticInput?: Pick<
    ReturnType<typeof import("./semantic-input-ipc").registerSemanticInputIpc>,
    "request" | "confirmSelection" | "subscribeSelection"
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
  /** Main's validated External Link opener, shared with core surfaces. */
  openExternalLink?(url: string): void;
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
  presentation: HostedPresentationKind | undefined,
  captureWindow: ExtensionTargetCapture | undefined,
): ExtensionTarget | undefined {
  if (presentation !== "panel" && context !== "window")
    return presentation ? { ...source, presentation } : source;
  const windowTarget = captureWindow?.(source.sourceSessionId, "window");
  return presentation === "panel"
    ? windowTarget && {
        ...windowTarget,
        terminalDirectory: source.terminalDirectory,
        presentation,
      }
    : presentation
      ? windowTarget && { ...windowTarget, presentation }
      : windowTarget;
}

function supportsExtensionPreview() {
  return (
    (["linux", "win32"].includes(process.platform) &&
      ["arm64", "x64"].includes(process.arch)) ||
    (process.platform === "darwin" && process.arch === "arm64")
  );
}

// Startup creates infrastructure, never activates installed code. Unsupported
// platforms retain Settings with an explicit preview-unavailable result. Broken
// infrastructure must not prevent terminal startup.
// eslint-disable-next-line max-lines-per-function -- one owner wires every extension surface; splitting it only moves the closures around
export async function startApplicationExtensions(
  options: ApplicationExtensionsOptions,
) {
  const windows = new Map<BrowserWindow, ExtensionTargetCapture>();
  const lifetime = new AbortController();
  const pending = new Map<BrowserWindow, PendingExtensionOpen>();
  let stopping = false;
  const catalog = createExtensionCatalog(
    { appVersion: app.getVersion(), apiVersion: "0.1.0" },
    `${process.platform}-${process.arch}`,
  );
  const catalogLoads = createCatalogAcquisition(catalog);
  const supported = supportsExtensionPreview();
  const initialized = supported
    ? await applicationManager(options, lifetime.signal, windows).catch(
        () => undefined,
      )
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
  const defaultPanel = createPanelDefault({
    manager,
    pending,
    stopping: () => stopping,
    capture: (window) => windows.get(window)?.(undefined, "window"),
  });
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
      const opening = defaultPanel.request(window, args[0]);
      if (opening) return opening;
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
      const shortcut = companionToolShortcut(entry.manifest!);
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
          ...(shortcut ? { shortcut } : {}),
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
            defaultPanel.cancel(window);
            pending.set(window, {
              token,
              invoke: () =>
                invokeExtension(
                  options,
                  captured.presentation === "panel"
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
    declares: (capability: string) => declares(installations, capability),
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
      defaultPanel.registerWindow(window);
      window.once("closed", () => {
        windows.delete(window);
        defaultPanel.cancel(window);
        pending.delete(window);
        // The native window getter is no longer usable after closed.
        manager?.cancel(contents);
      });
    },
    async dispose() {
      stopping = true;
      links.dispose();
      catalogLoads.dispose();
      defaultPanel.dispose();
      pending.clear();
      ipcMain.removeHandler(extensionsIpc);
      lifetime.abort();
      return (await manager?.dispose()) ?? true;
    },
  };
}
