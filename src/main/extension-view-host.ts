/* eslint-disable max-lines -- Keep one epoch's admission, presentation and bounded retirement transitions together. */
import { randomUUID } from "node:crypto";
import { captureValue, type Value } from "../extension-runtime/protocol.js";
import { isAbsolute } from "node:path";
import {
  WebContentsView,
  session,
  protocol,
  type BrowserWindow,
  type Session,
  type Rectangle,
  type WebContentsViewConstructorOptions,
  type WebContents,
  type Input,
  type Event,
} from "electron";
import {
  extensionViewIpc,
  isHostedContentPresentation,
  isHostedContentTitle,
  type HostedContentDescriptor,
  type HostedContentPresentation,
} from "../shared/extension-view";
import {
  createExtensionResources,
  extensionResourceFromUrl,
  isExtensionResource,
  type CapturedResourceOwner,
} from "./extension-view-resources";

import { extensionViewBounds } from "./extension-view-geometry";

export const extensionViewScheme = "omx-extension";
// Call once before app readiness. No service-worker, stream or CSP bypass flags.
export function registerExtensionViewScheme(
  target: Pick<typeof protocol, "registerSchemesAsPrivileged"> = protocol,
): void {
  target.registerSchemesAsPrivileged([
    {
      scheme: extensionViewScheme,
      privileges: { standard: true, secure: true, corsEnabled: true },
    },
  ]);
}
export type ExtensionViewOutcome =
  { status: "settled" } | { status: "failed"; reason: "cleanup" | "timeout" };
export type ExtensionViewState =
  "dormant" | "active" | "retiring" | "settled" | "failed";
export interface ExtensionViewRuntime {
  fromPartition(partition: string): Session;
  createView(options: WebContentsViewConstructorOptions): WebContentsView;
}
export interface ExtensionViewHostOptions {
  owner: BrowserWindow;
  preloadPath: string;
  resources: CapturedResourceOwner;
  // Main-owned approved DIP slot, excluding chrome. Intersected with actual
  // owner bounds AND the renderer's CSS slot; never inferred from renderer IDs.
  contentSlot(): Rectangle;
  onRetired?(id: string): void;
  // Admission loss precedes native/resource settlement, including failed closes.
  onViewRevoked?(id: string): void;
  onState?(state: ExtensionViewState, outcome?: ExtensionViewOutcome): void;
  onRendererProcess?(id: string, pid: number): void;
  onKeybind?(event: Event, input: Input, owner: BrowserWindow): void;
  onRequest?(value: Value, signal: AbortSignal): Promise<Value>;
  // Host/native-test seam only. Not exposed to either renderer.
  runtime?: ExtensionViewRuntime;
}
const runtime: ExtensionViewRuntime = {
  fromPartition: (partition) =>
    session.fromPartition(partition, { cache: false }),
  createView: (options) => new WebContentsView(options),
};
const maximumViews = 8;
const retirementMs = 5_000;
type Entry = {
  descriptor: HostedContentDescriptor;
  view: WebContentsView;
  contents: WebContents;
  destroyed: Promise<void>;
  closing: boolean;
  rendererGone: boolean;
  notified: boolean;
  visible: boolean;
  pid: number;
  entryUrl: string;
  loading: boolean;
  abort: AbortController;
};
function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Hosted operation timeout")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new Error("Hosted operation failed"));
      },
    );
  });
}
function notify(callback: () => void) {
  try {
    callback();
  } catch {
    /* Consumer callbacks cannot veto retirement. */
  }
}

// One captured resource capability, one lazy epoch. A retired host never revives.
const storageMethods = ["clearData", "clearCache", "clearAuthCache"] as const;

class NativeExtensionViewHost {
  readonly #epoch = randomUUID();
  readonly #origin = `${extensionViewScheme}://${this.#epoch}`;
  readonly #views = new Map<string, Entry>();
  readonly #resources;
  readonly #native;
  readonly #ownerContents: WebContents;
  #state: ExtensionViewState = "dormant";
  #session: Session | undefined;
  #retirement: Promise<ExtensionViewOutcome> | undefined;
  #selected: string | null = null;
  #layoutFocus: string | null = null;
  #revision = 0;
  #focusGeneration = 0;
  #blur = () => {
    this.#focusGeneration++;
  };
  #cleanupFailed = false;
  constructor(private readonly options: ExtensionViewHostOptions) {
    if (!isAbsolute(options.preloadPath))
      throw new TypeError("App-owned absolute preload required");
    this.#ownerContents = options.owner.webContents;
    this.#native = options.runtime ?? runtime;
    this.#resources = createExtensionResources(options.resources, this.#origin);
    options.owner.on("closed", this.#ownerLost);
    options.owner.webContents.on("destroyed", this.#ownerLost);
    options.owner.webContents.on("render-process-gone", this.#ownerLost);
    options.owner.webContents.on("did-start-navigation", this.#ownerNavigation);
    options.owner.on("resize", this.#hideForLayout);
    options.owner.on("blur", this.#blur);
    options.owner.webContents.on("zoom-changed", this.#hideForLayout);
  }
  #live() {
    return (
      (this.#state === "dormant" || this.#state === "active") &&
      !this.options.owner.isDestroyed() &&
      !this.options.owner.webContents.isDestroyed()
    );
  }
  #changeState(next: ExtensionViewState, outcome?: ExtensionViewOutcome) {
    this.#state = next;
    notify(() => this.options.onState?.(next, outcome));
  }
  #visibility(entry: Entry, visible: boolean) {
    entry.visible = visible;
    entry.view.setVisible(visible);
    // WebContents can outlive its disposed frame after renderer loss. Native
    // hiding still applies, but no presentation IPC belongs to a lost/closing view.
    if (!entry.rendererGone && !entry.closing && !entry.contents.isDestroyed())
      entry.contents.send(extensionViewIpc.visibility, visible);
  }
  #hideAll = (keep?: Entry) => {
    this.#selected = keep?.descriptor.id ?? null;
    for (const entry of this.#views.values()) {
      if (entry !== keep && !entry.contents.isDestroyed()) {
        try {
          this.#visibility(entry, false);
        } catch {
          this.#cleanupFailed = true;
        }
      }
    }
  };
  #hideForLayout = () => {
    if (this.#selected && this.#views.get(this.#selected)?.contents.isFocused())
      this.#layoutFocus = this.#selected;
    this.#hideAll();
  };
  #destroy(entry: Entry) {
    if (entry.closing) return;
    entry.closing = true;
    entry.abort.abort();
    notify(() => this.options.onViewRevoked?.(entry.descriptor.id));
    if (this.#selected === entry.descriptor.id) this.#selected = null;
    try {
      if (!entry.contents.isDestroyed()) this.#visibility(entry, false);
    } catch {
      this.#cleanupFailed = true;
    }
    try {
      if (!this.options.owner.isDestroyed())
        this.options.owner.contentView.removeChildView(entry.view);
    } catch {
      this.#cleanupFailed = true;
    }
    try {
      if (!entry.contents.isDestroyed())
        entry.contents.close({ waitForBeforeUnload: false });
    } catch {
      this.#cleanupFailed = true;
    }
  }
  #notifyRetired(entry: Entry) {
    if (entry.notified) return;
    entry.notified = true;
    notify(() => this.options.onRetired?.(entry.descriptor.id));
  }
  #ownerLost = () => {
    void this.retire();
  };
  #ownerNavigation = (event: {
    isMainFrame: boolean;
    isSameDocument: boolean;
  }) => {
    if (event.isMainFrame && !event.isSameDocument) void this.retire();
  };
  async #cleanup(): Promise<ExtensionViewOutcome> {
    for (const entry of this.#views.values()) this.#destroy(entry);
    const failures: unknown[] = [];
    if (this.#session) {
      try {
        this.#session.protocol.unhandle(extensionViewScheme);
      } catch {
        this.#cleanupFailed = true;
      }
      try {
        await this.#session.closeAllConnections();
      } catch {
        failures.push("connections");
      }
    }
    await Promise.all(
      [...this.#views.values()].map((entry) => entry.destroyed),
    );
    await this.#resources.drain();
    if (this.#session) {
      for (const clear of storageMethods) {
        try {
          await this.#session[clear]();
        } catch {
          failures.push("storage");
        }
      }
    }
    try {
      await this.options.resources.release();
    } catch {
      failures.push("release");
    }
    const failed = this.#cleanupFailed || failures.length > 0;
    // A timeout permanently published failure; late drain is not permission
    // to remove its retained core tab or bypass failure acknowledgement.
    if (!failed && this.#state !== "failed")
      for (const entry of this.#views.values()) this.#notifyRetired(entry);
    this.#views.clear();
    return failed
      ? { status: "failed", reason: "cleanup" }
      : { status: "settled" };
  }
  retire = (): Promise<ExtensionViewOutcome> => {
    if (this.#retirement) return this.#retirement;
    this.#state = "retiring";
    this.#resources.revoke();
    this.#hideAll();
    // Publish before any consumer callback can reenter. A timeout keeps the
    // original cleanup alive; no retry, early release or later success rewrite.
    this.#retirement = Promise.resolve().then(async () => {
      let outcome: ExtensionViewOutcome;
      try {
        outcome = await bounded(this.#cleanup(), retirementMs);
      } catch {
        outcome = { status: "failed", reason: "timeout" };
      }
      this.options.owner.removeListener("closed", this.#ownerLost);
      this.#ownerContents.removeListener("destroyed", this.#ownerLost);
      this.#ownerContents.removeListener(
        "render-process-gone",
        this.#ownerLost,
      );
      this.#ownerContents.removeListener(
        "did-start-navigation",
        this.#ownerNavigation,
      );
      this.options.owner.removeListener("resize", this.#hideForLayout);
      this.options.owner.removeListener("blur", this.#blur);
      this.#ownerContents.removeListener("zoom-changed", this.#hideForLayout);
      this.#changeState(outcome.status, outcome);
      return outcome;
    });
    this.#changeState("retiring");
    return this.#retirement;
  };
  #ensureSession() {
    if (this.#session) return this.#session;
    const created = this.#native.fromPartition(`extension-${this.#epoch}`);
    this.#session = created; // Retain even a partially configured session.
    created.setPermissionCheckHandler(() => false);
    created.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    created.setDevicePermissionHandler(() => false);
    created.on("will-download", (event) => event.preventDefault());
    created.webRequest.onBeforeRequest((details, callback) => {
      const entry = [...this.#views.values()].find(
        (item) => item.contents.id === details.webContentsId && !item.closing,
      );
      const packaged =
        extensionResourceFromUrl(details.url, this.#origin) !== null;
      const typeAllowed = [
        "mainFrame",
        "script",
        "stylesheet",
        "image",
      ].includes(details.resourceType);
      callback({
        cancel:
          !this.#live() ||
          !entry ||
          !packaged ||
          !typeAllowed ||
          (details.resourceType === "mainFrame" &&
            (!entry.loading || details.url !== entry.entryUrl)),
      });
    });
    created.protocol.handle(extensionViewScheme, (request) =>
      this.#resources.respond(request),
    );
    return created;
  }
  #trackProcess(entry: Entry) {
    if (!this.#live() || entry.closing || entry.contents.isDestroyed()) return;
    entry.pid = entry.contents.getOSProcessId();
    notify(() =>
      this.options.onRendererProcess?.(entry.descriptor.id, entry.pid),
    );
    if (
      entry.pid > 0 &&
      entry.pid === this.options.owner.webContents.getOSProcessId()
    )
      void this.retire();
  }
  #bindView(entry: Entry) {
    const contents = entry.contents;
    entry.view.setVisible(false);
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    if (this.options.onRequest) {
      let pending = 0;
      contents.ipc.handle(
        "extension-view:request",
        async (event, ...args: unknown[]) => {
          if (
            !this.#live() ||
            entry.closing ||
            contents.isDestroyed() ||
            event.sender !== contents ||
            event.senderFrame !== contents.mainFrame ||
            args.length !== 1 ||
            pending >= 32
          )
            throw new Error("Request unavailable");
          const value = captureValue(args[0]);
          pending++;
          try {
            const result = await this.options.onRequest!(
              value,
              entry.abort.signal,
            );
            if (!this.#live() || entry.closing || entry.abort.signal.aborted)
              throw new Error("Outcome unknown");
            return captureValue(result);
          } finally {
            pending--;
          }
        },
      );
    }
    const prevent = (event: Event) => event.preventDefault();
    contents.on("will-navigate", prevent);
    contents.on("will-frame-navigate", prevent);
    contents.on("will-redirect", prevent);
    contents.on("will-attach-webview", prevent);
    contents.on("render-process-gone", () => {
      entry.rendererGone = true;
      this.#ownerLost();
    });
    contents.on("dom-ready", () => this.#trackProcess(entry));
    contents.on("did-finish-load", () => {
      this.#trackProcess(entry);
      if (!entry.closing && this.#live())
        this.#visibility(entry, entry.visible);
    });
    contents.on("before-input-event", (event, input) => {
      if (
        this.#live() &&
        this.#selected === entry.descriptor.id &&
        entry.visible &&
        contents.isFocused()
      )
        this.options.onKeybind?.(event, input, this.options.owner);
    });
  }
  async open(input: {
    entryResource: string;
    title: string;
  }): Promise<HostedContentDescriptor> {
    if (
      !isExtensionResource(input.entryResource) ||
      !input.entryResource.endsWith(".html") ||
      !isHostedContentTitle(input.title)
    )
      throw new TypeError("Invalid hosted content");
    if (!this.#live() || this.#views.size >= maximumViews)
      throw new Error("Hosted content unavailable");
    let entry: Entry | undefined;
    try {
      const view = this.#native.createView({
        webPreferences: {
          session: this.#ensureSession(),
          preload: this.options.preloadPath,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          contextIsolation: true,
          sandbox: process.platform !== "linux",
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
          navigateOnDragDrop: false,
          devTools: false,
        },
      });
      let destroyed!: () => void;
      entry = {
        descriptor: { id: randomUUID(), title: input.title },
        view,
        contents: view.webContents,
        destroyed: new Promise<void>((resolve) => {
          destroyed = resolve;
        }),
        closing: false,
        rendererGone: false,
        notified: false,
        visible: false,
        pid: 0,
        entryUrl: `${this.#origin}/${input.entryResource}`,
        loading: true,
        abort: new AbortController(),
      };
      const current = entry;
      this.#views.set(current.descriptor.id, current);
      view.webContents.once("destroyed", () => {
        destroyed();
        if (!current.closing) void this.retire();
      });
      this.#bindView(current);
      this.options.owner.contentView.addChildView(view);
      this.#changeState("active");
      if (!this.#live() || current.closing)
        throw new Error("Hosted owner retired");
      await bounded(current.contents.loadURL(current.entryUrl), 10_000);
      current.loading = false;
      this.#trackProcess(current);
      if (
        !this.#live() ||
        current.closing ||
        current.contents.isDestroyed() ||
        current.pid <= 0
      )
        throw new Error("Hosted content retired");
      return { ...current.descriptor };
    } catch {
      if (entry) this.#destroy(entry);
      await this.retire();
      throw new Error("Hosted content failed to open");
    }
  }
  // No await between invalidating the old selection and setting visibility.
  // Awaiting the IPC result acknowledges native hide-before-DOM-overlay.
  async present(presentation: HostedContentPresentation): Promise<boolean> {
    if (!isHostedContentPresentation(presentation))
      throw new TypeError("Invalid hosted presentation");
    if (!this.#live() || presentation.revision <= this.#revision) return false;
    this.#revision = presentation.revision;
    const entry =
      presentation.id === null ? undefined : this.#views.get(presentation.id);
    // Hiding a focused native child does not focus the parent WebContents.
    // Capture ownership before hiding; never activate an unfocused OS window.
    const returnFocus =
      presentation.id === null &&
      this.#selected !== null &&
      this.#views.get(this.#selected)?.contents.isFocused() === true &&
      this.options.owner.isFocused();
    // A geometry-only update must not hide/refocus a live field or interrupt IME.
    this.#hideAll(
      entry && this.#selected === presentation.id ? entry : undefined,
    );
    if (this.#cleanupFailed) {
      void this.retire();
      return false;
    }
    if (presentation.id === null) {
      this.#layoutFocus = null;
      if (returnFocus) this.options.owner.webContents.focus();
      return true;
    }
    if (
      !entry ||
      entry.closing ||
      entry.loading ||
      entry.contents.isDestroyed()
    ) {
      this.#hideAll();
      return false;
    }
    try {
      const bounds = extensionViewBounds(
        this.options.owner,
        this.options.contentSlot(),
        presentation.bounds,
      );
      if (
        !bounds ||
        !this.#live() ||
        this.#revision !== presentation.revision
      ) {
        this.#hideAll();
        return false;
      }
      entry.view.setBounds(bounds);
      this.#visibility(entry, true);
      this.#selected = entry.descriptor.id;
      if (presentation.focus || this.#layoutFocus === presentation.id)
        entry.contents.focus();
      this.#layoutFocus = null;
      return true;
    } catch {
      void this.retire();
      return false;
    }
  }
  async close(id: string): Promise<void> {
    const entry = this.#views.get(id);
    if (!entry) throw new Error("Unknown hosted content");
    this.#destroy(entry);
    try {
      await bounded(entry.destroyed, retirementMs);
    } catch {
      await this.retire();
      throw new Error("Hosted content close failed");
    }
    if (!this.#live() || this.#views.size === 1) {
      const outcome = await this.retire();
      if (outcome.status !== "settled")
        throw new Error("Hosted content retirement failed");
    } else {
      this.#views.delete(id);
      this.#notifyRetired(entry);
    }
  }
  clipboard = (action: "copy" | "paste" | "selectAll"): boolean => {
    const entry =
      this.#selected === null ? undefined : this.#views.get(this.#selected);
    if (
      !this.#live() ||
      !entry ||
      entry.closing ||
      !entry.visible ||
      entry.contents.isDestroyed() ||
      !entry.contents.isFocused()
    )
      return false;
    if (action !== "copy" && action !== "paste" && action !== "selectAll")
      return false;
    entry.contents[action]();
    return true;
  };
  captureFocusIntent(id: string): () => boolean {
    const revision = this.#revision;
    const generation = this.#focusGeneration;
    return () => {
      const entry = this.#views.get(id);
      return (
        this.#live() &&
        this.#revision === revision &&
        this.#focusGeneration === generation &&
        this.#selected === id &&
        !!entry?.visible &&
        !entry.contents.isDestroyed() &&
        entry.contents.isFocused() &&
        this.options.owner.isFocused()
      );
    };
  }
  owns(id: string) {
    const entry = this.#views.get(id);
    return this.#live() && !!entry && !entry.closing;
  }
}
export function createExtensionViewHost(options: ExtensionViewHostOptions) {
  return new NativeExtensionViewHost(options);
}
