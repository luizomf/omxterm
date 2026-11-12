import { isAbsolute } from "node:path";
import { createCompanionDismissal } from "./companion-dismissal";
import { terminalIpc } from "../shared/terminal-ipc";
import { filesTerminalDragIpc } from "../shared/files-terminal-drag";
import {
  createFilesTerminalDrag,
  type FilesTerminalDropConsumer,
} from "./files-terminal-drag";
import type {
  TerminalClipboardAction,
  TerminalContextMenuTarget,
} from "../shared/terminal-contract";
import type {
  IpcMain,
  IpcMainInvokeEvent,
  IpcMainEvent,
  WebContents,
} from "electron";
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
  dismissible: Set<string>;
  dismissal: ReturnType<typeof createCompanionDismissal>;
  filesDrag: ReturnType<typeof createFilesTerminalDrag>;
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
  const routeFor = (event: IpcMainInvokeEvent | IpcMainEvent) => {
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
      if (
        presentation.activeId != null &&
        !route.issued.get(presentation.activeId)?.owns(presentation.activeId)
      )
        throw new Error("Unknown active hosted content");
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
  ipcMain.handle(filesTerminalDragIpc.handoff, (event, ...args: unknown[]) => {
    const route = routeFor(event);
    return args.length === 2
      ? route.filesDrag.handoff(args[0], args[1])
      : { status: "refused" };
  });
  routers.set(ipcMain, routes);
  return routes;
}

// Multiple epochs/windows share the actual-sender router. Payload identities
// only select IDs already issued to that window; they never choose an owner.
export function startExtensionViewHost(
  options: ExtensionViewHostOptions & {
    ipcMain: IpcMain;
    filesTerminalDrop?: FilesTerminalDropConsumer | undefined;
    filesDragSignal?: AbortSignal;
  },
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
      dismissible: new Set(),
      dismissal: createCompanionDismissal(options.owner),
      filesDrag: createFilesTerminalDrag(options.owner),
    };
    registry.set(contents, route);
    contents.ipc.on(filesTerminalDragIpc.claim, (event, ...args: unknown[]) => {
      // One assignment is one synchronous reply, including refusal.
      event.returnValue =
        event.sender === contents &&
        event.senderFrame === contents.mainFrame &&
        !contents.isDestroyed() &&
        args.length === 1
          ? (registry.get(contents)?.filesDrag.claim(args[0]) ?? false)
          : false;
    });
    contents.once("destroyed", () => {
      registry.get(contents)?.filesDrag.revoke();
      registry.delete(contents);
      if (!registry.size) {
        options.ipcMain.removeHandler(extensionViewIpc.present);
        options.ipcMain.removeHandler(extensionViewIpc.close);
        options.ipcMain.removeHandler(filesTerminalDragIpc.handoff);
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
    filesDrag: options.filesTerminalDrop
      ? {
          start: (value, context, signal, report) =>
            ownerRoute.filesDrag.start(
              value,
              context,
              options.filesDragSignal
                ? AbortSignal.any([signal, options.filesDragSignal])
                : signal,
              options.filesTerminalDrop!,
              report,
            ),
          end: ownerRoute.filesDrag.end,
          revoke: ownerRoute.filesDrag.revoke,
        }
      : undefined,
    onFocusChange: reportFocus,
    interceptInput(event, input, sourceId) {
      const id = host.focusedId();
      return ownerRoute.dismissal.handle(
        event,
        input,
        id === sourceId && ownerRoute.dismissible.has(id) ? id : undefined,
        id === sourceId ? id : undefined,
        () => {
          // focusedId includes live, visible, selected child and native owner
          // guards. A stale/hidden child must never originate a core action.
          if (id !== sourceId) return false;
          options.onKeybind?.(event, input, options.owner, true);
          return event.defaultPrevented;
        },
      );
    },
    onRetired(id) {
      ownerRoute.dismissible.delete(id);
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
      presentation?: import("../shared/extension-view").HostedPresentationKind;
      panelDefaultToken?: string;
    }) {
      const opened = await host.open(input);
      const descriptor: HostedContentDescriptor = input.presentation
        ? { ...opened, presentation: input.presentation }
        : opened;
      if (!host.owns(descriptor.id) || contents.isDestroyed())
        throw new Error("Hosted owner retired");
      ownerRoute.issued.set(descriptor.id, host);
      // Escape in a panel or dialog child dismisses it through core.
      if (descriptor.presentation) ownerRoute.dismissible.add(descriptor.id);
      try {
        reveal(
          input.panelDefaultToken
            ? { ...descriptor, panelDefaultToken: input.panelDefaultToken }
            : descriptor,
        );
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
