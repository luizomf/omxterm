import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { exactLayoutKeys, isLayoutToken } from "../shared/terminal-layout";
import {
  isMirrorReply,
  isMirrorStopReason,
  mirrorTypingIpc,
  type MirrorCommand,
  type MirrorPane,
  type MirrorReply,
  type MirrorStopReason,
} from "../shared/mirror-typing";
import type {
  IpcEvent,
  IpcMainPort,
  TerminalIpcController,
} from "./terminal-ipc-types";
import type { Value } from "../extension-runtime/protocol";

export class MirrorSetupError extends Error {
  constructor(readonly reason: "focus-live-pane" | "need-two-panes") {
    super("Mirror setup unavailable");
  }
}

type Context = {
  id: string;
  source: string;
  lifetime: AbortController;
  cleanup: (() => void)[];
  revision: number;
  panes: readonly MirrorPane[];
  token?: string;
  lease?: string;
  starting: boolean;
  handoff?: boolean;
  bound?: boolean;
};
type Admission = (signal: AbortSignal, commit: () => void) => Promise<void>;
type RequestedCommand = Exclude<MirrorCommand, { kind: "stop" | "retire" }>;

class MirrorWindow {
  private context: Context | undefined;
  private pending = new Map<
    string,
    { resolve(value: MirrorReply): void; reject(): void }
  >();
  private cleanup: (() => void)[] = [];
  private disposed = false;
  readonly contents: BrowserWindow["webContents"];
  constructor(
    readonly window: BrowserWindow,
    readonly controller: TerminalIpcController,
    private quitting: () => boolean,
  ) {
    this.contents = window.webContents;
    const listen = (
      owner: Pick<NodeJS.EventEmitter, "on" | "removeListener">,
      name: string,
      callback: (...args: unknown[]) => void,
    ) => {
      owner.on(name, callback);
      this.cleanup.push(() => owner.removeListener(name, callback));
    };
    listen(window, "closed", () => this.dispose());
    listen(window, "hide", () => this.stop("unavailable"));
    listen(window, "minimize", () => this.stop("unavailable"));
    listen(window, "blur", () => {
      if (!this.context?.lease) this.stop("unavailable");
    });
    listen(this.contents, "destroyed", () => this.dispose());
    listen(this.contents, "render-process-gone", () => this.dispose());
    listen(
      this.contents,
      "did-start-navigation",
      (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) this.retire();
      },
    );
  }
  private send(command: MirrorCommand) {
    if (!this.contents.isDestroyed())
      this.contents.send(mirrorTypingIpc.command, command);
  }
  private available() {
    return (
      !this.disposed &&
      !this.quitting() &&
      !this.window.isDestroyed() &&
      !this.contents.isDestroyed() &&
      this.window.isVisible() &&
      !this.window.isMinimized()
    );
  }
  private current(context: Context, revision = context.revision) {
    return (
      this.context === context &&
      !context.lifetime.signal.aborted &&
      context.revision === revision &&
      this.available()
    );
  }
  private require(context: Context, revision = context.revision) {
    if (!this.current(context, revision) || !this.window.isFocused())
      throw new Error("Mirror Typing unavailable");
  }
  private watch(context: Context, signal: AbortSignal) {
    const abort = () => {
      if (this.context === context) this.retire();
    };
    if (signal.aborted) {
      abort();
      throw new Error("Mirror Typing unavailable");
    }
    signal.addEventListener("abort", abort, { once: true });
    context.cleanup.push(() => signal.removeEventListener("abort", abort));
  }
  private ask(
    command: RequestedCommand,
    signal: AbortSignal,
  ): Promise<MirrorReply> {
    if (signal.aborted)
      return Promise.reject(new Error("Mirror Typing unavailable"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.pending.delete(command.request);
        signal.removeEventListener("abort", fail);
      };
      const fail = () => {
        cleanup();
        reject(new Error("Mirror Typing unavailable"));
      };
      const timer = setTimeout(fail, 5000);
      this.pending.set(command.request, {
        resolve(value) {
          cleanup();
          resolve(value);
        },
        reject: fail,
      });
      signal.addEventListener("abort", fail, { once: true });
      try {
        this.send(command);
      } catch {
        fail();
      }
    });
  }
  reply(value: unknown) {
    if (isMirrorReply(value)) this.pending.get(value.request)?.resolve(value);
  }
  stop(reason: MirrorStopReason = "stopped") {
    const context = this.context;
    if (!context) return;
    context.revision++;
    delete context.token;
    delete context.lease;
    context.starting = false;
    delete context.handoff;
    for (const work of [...this.pending.values()]) work.reject();
    this.controller.mirrorTyping?.revoke();
    try {
      this.send({ kind: "stop", context: context.id, reason });
    } catch {
      /* Native teardown remains independent. */
    }
  }
  stopped(lease: string, reason: MirrorStopReason) {
    if (this.context?.lease === lease) this.stop(reason);
  }
  stopRequest(value: unknown) {
    if (
      exactLayoutKeys(value, ["context", "reason"]) &&
      value.context === this.context?.id &&
      isMirrorStopReason(value.reason)
    )
      this.stop(value.reason);
  }
  retire(id?: string) {
    const context = this.context;
    if (!context || (id !== undefined && context.id !== id)) return;
    this.stop("unavailable");
    this.context = undefined;
    context.cleanup.forEach((cleanup) => cleanup());
    context.lifetime.abort();
    try {
      this.send({ kind: "retire", context: context.id });
    } catch {
      /* Already revoked. */
    }
  }
  async capture(
    signal: AbortSignal,
    source: string | undefined,
  ): Promise<string> {
    this.retire();
    if (!source) throw new MirrorSetupError("focus-live-pane");
    const context: Context = {
      id: randomUUID(),
      source,
      lifetime: new AbortController(),
      cleanup: [],
      revision: 0,
      panes: [],
      starting: false,
    };
    this.context = context;
    try {
      this.watch(context, signal);
      this.require(context);
      const reply = await this.ask(
        { kind: "capture", context: context.id, request: randomUUID() },
        context.lifetime.signal,
      );
      this.require(context, 0);
      if (!reply.ok)
        throw new MirrorSetupError(reply.error ?? "focus-live-pane");
      if (
        !reply.panes ||
        reply.panes.find((pane) => pane.required)?.sessionId !== source
      )
        throw new MirrorSetupError("focus-live-pane");
      context.panes = reply.panes;
      return context.id;
    } catch (error) {
      if (this.context === context) this.retire();
      throw error;
    }
  }
  bind(id: string, signal: AbortSignal) {
    const context = this.context;
    if (!context || context.id !== id)
      throw new Error("Mirror Typing unavailable");
    this.watch(context, signal);
    context.bound = true;
  }
  selectionChanged(source: string | null) {
    const context = this.context;
    if (!context) return;
    if (!context.bound && context.source !== source) this.retire();
    else if (context.starting && !context.handoff) this.stop("unavailable");
  }
  async request(
    id: string,
    view: string,
    value: Record<string, Value>,
    signal: AbortSignal,
    admit: Admission,
  ): Promise<Value> {
    const context = this.context;
    if (!context || context.id !== id)
      return {
        ok: false,
        error: "Focus a live pane, then open Mirror Typing.",
      };
    let revision = context.revision;
    try {
      if (
        value.action === "stop" &&
        exactLayoutKeys(value, ["operation", "action"])
      ) {
        this.stop();
        return { ok: true, status: "stopped" };
      }
      this.require(context);
      if (
        value.action === "describe" &&
        exactLayoutKeys(value, ["operation", "action"])
      ) {
        this.stop();
        revision = context.revision;
        await admit(signal, () => this.require(context, revision));
        const result = await this.ask(
          { kind: "describe", context: id, request: randomUUID() },
          AbortSignal.any([signal, context.lifetime.signal]),
        );
        this.require(context, revision);
        if (
          !result.ok ||
          !result.panes ||
          result.panes.find((pane) => pane.required)?.sessionId !==
            context.source
        )
          throw new Error("Unavailable targets");
        context.panes = result.panes;
        context.token = randomUUID();
        return {
          ok: true,
          setupToken: context.token,
          panes: result.panes.map((pane, index) => ({
            handle: pane.handle,
            title: pane.title,
            ordinal: index + 1,
            required: pane.required,
          })),
        };
      }
      const starting = this.start(context, view, value, signal, admit);
      revision = context.revision;
      return await starting;
    } catch {
      if (this.context === context && context.revision === revision)
        this.stop("unavailable");
      return {
        ok: false,
        error:
          "Mirror Typing unavailable. Refresh targets or focus a live pane and reopen setup.",
      };
    }
  }
  private async start(
    context: Context,
    view: string,
    value: Record<string, Value>,
    signal: AbortSignal,
    admit: Admission,
  ): Promise<Value> {
    // Hosted requests contain prototype-free arrays; normalize before using
    // array methods or iteration, without changing transport hardening.
    const handles = Array.isArray(value.handles)
      ? Array.from(value.handles)
      : [];
    if (
      !exactLayoutKeys(value, [
        "operation",
        "action",
        "setupToken",
        "handles",
      ]) ||
      value.action !== "start" ||
      context.starting ||
      value.setupToken !== context.token ||
      !isLayoutToken(value.setupToken) ||
      !Array.isArray(value.handles) ||
      handles.length < 2 ||
      handles.length > 16 ||
      !handles.every(isLayoutToken) ||
      new Set(handles).size !== handles.length
    )
      throw new Error("Unavailable setup");
    const selected = handles.map((handle) =>
      context.panes.find((pane) => pane.handle === handle),
    );
    if (
      selected.some((pane) => !pane) ||
      !selected.some((pane) => pane?.required)
    )
      throw new Error("Unavailable targets");
    const panes = selected as MirrorPane[];
    delete context.token;
    context.starting = true;
    const revision = ++context.revision;
    const prepared = randomUUID();
    const pendingSignal = AbortSignal.any([signal, context.lifetime.signal]);
    // Establish cancellable core Preparing before the first store await.
    const preparing = await this.ask(
      {
        kind: "prepare",
        request: prepared,
        context: context.id,
        handles,
        sourceView: view,
      },
      pendingSignal,
    );
    this.require(context, revision);
    if (!preparing.ok) throw new Error("Unavailable preparation");
    await admit(pendingSignal, () => this.require(context, revision));
    context.handoff = true;
    const ready = await this.ask(
      { kind: "handoff", request: randomUUID(), context: context.id, prepared },
      pendingSignal,
    );
    this.require(context, revision);
    if (!ready.ok) throw new Error("Unavailable handoff");
    await admit(pendingSignal, () => {
      this.require(context, revision);
      context.lease = this.controller.mirrorTyping!.grant(
        panes.map((pane) => pane.sessionId),
        context.source,
        context.lifetime.signal,
      );
    });
    const active = await this.ask(
      {
        kind: "activate",
        request: randomUUID(),
        context: context.id,
        prepared,
        lease: context.lease!,
      },
      pendingSignal,
    );
    this.require(context, revision);
    if (!active.ok) throw new Error("Unavailable activation");
    context.starting = false;
    return { ok: true, status: "active" };
  }
  dispose() {
    this.retire();
    this.disposed = true;
    this.cleanup.splice(0).forEach((cleanup) => cleanup());
  }
}

/** Sender authentication is shared with terminal IPC, never extension web IPC. */
export function registerMirrorTypingIpc(options: {
  ipc: IpcMainPort;
  trusted(event: IpcEvent): boolean;
  quitting(): boolean;
}) {
  const owners = new Map<object, MirrorWindow>();
  const ownerFor = (event: IpcEvent) =>
    options.trusted(event) && !options.quitting()
      ? owners.get(event.sender)
      : undefined;
  const reply = (event: IpcEvent, value?: unknown) =>
    ownerFor(event)?.reply(value);
  const input = (event: IpcEvent, value?: unknown) =>
    ownerFor(event)?.controller.mirrorTyping?.input(value);
  const stop = (event: IpcEvent, value?: unknown) =>
    ownerFor(event)?.stopRequest(value);
  options.ipc.on(mirrorTypingIpc.reply, reply);
  options.ipc.on(mirrorTypingIpc.input, input);
  options.ipc.on(mirrorTypingIpc.stop, stop);
  const owner = (window: BrowserWindow) => {
    const found = owners.get(window.webContents);
    if (!found) throw new Error("Mirror Typing unavailable");
    return found;
  };
  return {
    register(window: BrowserWindow, controller: TerminalIpcController) {
      const value = new MirrorWindow(window, controller, options.quitting);
      owners.set(value.contents, value);
      window.once("closed", () => owners.delete(value.contents));
    },
    capture: (window: BrowserWindow, signal: AbortSignal, source?: string) =>
      owner(window).capture(signal, source),
    bind: (window: BrowserWindow, context: string, signal: AbortSignal) =>
      owner(window).bind(context, signal),
    request: (
      window: BrowserWindow,
      context: string,
      view: string,
      value: Record<string, Value>,
      signal: AbortSignal,
      admit: Admission,
    ) => owner(window).request(context, view, value, signal, admit),
    stopped: (window: BrowserWindow, lease: string, reason: MirrorStopReason) =>
      owner(window).stopped(lease, reason),
    retire: (window: BrowserWindow, context?: string) =>
      owner(window).retire(context),
    selectionChanged: (window: BrowserWindow, source: string | null) =>
      owners.get(window.webContents)?.selectionChanged(source),
    dispose() {
      for (const value of owners.values()) value.dispose();
      owners.clear();
      options.ipc.removeListener(mirrorTypingIpc.reply, reply);
      options.ipc.removeListener(mirrorTypingIpc.input, input);
      options.ipc.removeListener(mirrorTypingIpc.stop, stop);
    },
  };
}
