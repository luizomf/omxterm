import { isAbsolute } from "node:path";
import { createCompanionDismissal } from "./companion-dismissal";
import { terminalIpc } from "../shared/terminal-ipc";
import type {
  TerminalClipboardAction,
  TerminalContextMenuTarget,
} from "../shared/terminal-contract";
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import {
  extensionViewIpc,
  isHostedContentId,
  isHostedContentPresentation,
  type HostedContentDescriptor,
} from "../shared/extension-view";
import {
  createExtensionViewHost,
  type ExtensionViewHostOptions,
} from "./extension-view-host";

type Host = ReturnType<typeof createExtensionViewHost>;
type Route = {
  hosts: Set<Host>;
  retiring: Set<Host>;
  issued: Map<string, Host>;
  revision: number;
  focused: string | null;
  panels: Set<string>;
  dismissal: ReturnType<typeof createCompanionDismissal>;
};
const routers = new WeakMap<IpcMain, Map<WebContents, Route>>();

export function sendExtensionAwareClipboard(
  ipcMain: IpcMain,
  owner: WebContents,
  action: TerminalClipboardAction,
  target?: TerminalContextMenuTarget,
): void {
  if (!target) {
    const hosts = routers.get(ipcMain)?.get(owner)?.hosts;
    if (hosts)
      for (const host of hosts)
        if (host.clipboard(action === "select-all" ? "selectAll" : action))
          return;
  }
  owner.send(terminalIpc.clipboardAction, target ? { action, target } : action);
}

function registryFor(ipcMain: IpcMain) {
  let routes = routers.get(ipcMain);
  if (routes) return routes;
  routes = new Map<WebContents, Route>();
  const registry = routes;
  const routeFor = (event: IpcMainInvokeEvent) => {
    const route = registry.get(event.sender);
    if (
      !route ||
      event.sender.isDestroyed() ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("Rejected hosted owner");
    return route;
  };
  ipcMain.handle(
    extensionViewIpc.present,
    async (event, ...args: unknown[]) => {
      const route = routeFor(event);
      if (args.length !== 1 || !isHostedContentPresentation(args[0]))
        throw new TypeError("Invalid hosted presentation");
      const presentation = args[0];
      const selected =
        presentation.id === null
          ? undefined
          : route.issued.get(presentation.id);
      if (
        presentation.id !== null &&
        (!selected || !selected.owns(presentation.id))
      )
        throw new Error("Unknown hosted content");
      if (presentation.revision <= route.revision) return false;
      route.revision = presentation.revision;
      // One window revision orders ALL epochs. Never show a target until every
      // other native epoch has acknowledged hiding (including its retirement).
      const hidden = await Promise.all(
        [...route.hosts]
          .filter((host) => host !== selected)
          .map(async (host) => {
            if (route.retiring.has(host))
              return (await host.retire()).status === "settled";
            return host.present({ ...presentation, id: null, focus: false });
          }),
      );
      if (
        route.revision !== presentation.revision ||
        hidden.some((value) => !value)
      )
        return false;
      return selected ? selected.present(presentation) : true;
    },
  );
  ipcMain.handle(extensionViewIpc.close, async (event, ...args: unknown[]) => {
    const route = routeFor(event);
    if (args.length !== 1 || !isHostedContentId(args[0]))
      throw new TypeError("Invalid hosted close");
    const id = args[0];
    const host = route.issued.get(id);
    if (!host?.owns(id)) throw new Error("Unknown hosted content");
    await host.close(id);
  });
  routers.set(ipcMain, routes);
  return routes;
}

// Multiple epochs/windows share the actual-sender router. Payload identities
// only select IDs already issued to that window; they never choose an owner.
export function startExtensionViewHost(
  options: ExtensionViewHostOptions & { ipcMain: IpcMain },
) {
  const contents = options.owner.webContents;
  if (
    !isAbsolute(options.preloadPath) ||
    options.owner.isDestroyed() ||
    contents.isDestroyed()
  )
    throw new Error("Invalid hosted owner setup");
  const registry = registryFor(options.ipcMain);
  let route = registry.get(contents);
  if (!route) {
    route = {
      hosts: new Set(),
      retiring: new Set(),
      issued: new Map(),
      revision: 0,
      focused: null,
      panels: new Set(),
      dismissal: createCompanionDismissal(options.owner),
    };
    registry.set(contents, route);
    contents.once("destroyed", () => {
      registry.delete(contents);
      if (!registry.size) {
        options.ipcMain.removeHandler(extensionViewIpc.present);
        options.ipcMain.removeHandler(extensionViewIpc.close);
        routers.delete(options.ipcMain);
      }
    });
  }
  const ownerRoute = route;
  const reportFocus = () => {
    const focused =
      [...ownerRoute.hosts]
        .map((candidate) => candidate.focusedId())
        .find((id) => id !== null) ?? null;
    if (focused === ownerRoute.focused) return;
    ownerRoute.focused = focused;
    if (!contents.isDestroyed()) contents.send(extensionViewIpc.focus, focused);
    options.onFocusChange?.();
  };
  const host = createExtensionViewHost({
    ...options,
    onFocusChange: reportFocus,
    interceptInput(event, input, sourceId) {
      const id = host.focusedId();
      return ownerRoute.dismissal.handle(
        event,
        input,
        id === sourceId && ownerRoute.panels.has(id) ? id : undefined,
        id === sourceId ? id : undefined,
      );
    },
    onRetired(id) {
      ownerRoute.panels.delete(id);
      if (ownerRoute.issued.get(id) === host) {
        ownerRoute.issued.delete(id);
        if (!contents.isDestroyed())
          contents.send(extensionViewIpc.retired, id);
      }
      options.onRetired?.(id);
    },
    onState(state, outcome) {
      if (state === "retiring") ownerRoute.retiring.add(host);
      if (state === "settled") {
        ownerRoute.hosts.delete(host);
        ownerRoute.retiring.delete(host);
      }
      if (state === "failed" && !contents.isDestroyed())
        contents.send(extensionViewIpc.failure, true);
      options.onState?.(state, outcome);
    },
  });
  ownerRoute.hosts.add(host);
  const reveal = (descriptor: HostedContentDescriptor) => {
    if (!host.owns(descriptor.id) || contents.isDestroyed())
      throw new Error("Hosted owner retired");
    contents.send(extensionViewIpc.open, descriptor);
  };
  return {
    reveal,
    async open(input: {
      entryResource: string;
      title: string;
      presentation?: "panel";
    }) {
      const opened = await host.open(input);
      const descriptor: HostedContentDescriptor = input.presentation
        ? { ...opened, presentation: input.presentation }
        : opened;
      if (!host.owns(descriptor.id) || contents.isDestroyed())
        throw new Error("Hosted owner retired");
      ownerRoute.issued.set(descriptor.id, host);
      if (descriptor.presentation === "panel")
        ownerRoute.panels.add(descriptor.id);
      try {
        reveal(descriptor);
      } catch {
        await host.retire();
        throw new Error("Hosted notification failed");
      }
      return descriptor;
    },
    captureFocusIntent: (id: string) => host.captureFocusIntent(id),
    claimActivation(id: string) {
      if (host.focusedId() === id) ownerRoute.dismissal.claimActivation(id);
    },
    clipboard: host.clipboard,
    retire: host.retire,
  };
}
