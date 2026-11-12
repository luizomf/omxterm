import type {
  MirrorCommand,
  MirrorPane,
  MirrorStopReason,
  MirrorTypingBridge,
} from "../shared/mirror-typing";
import type { ApplicationTab } from "./terminal-tabs";
import {
  tabPanes,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";
import { retainDismissalGesture } from "./about/about-dialog";
import type { StateMarks } from "./state-marks";

interface Member extends MirrorPane {
  readonly pane: TerminalPane;
  readonly surface: NonNullable<TerminalPane["surface"]>;
}
interface Context {
  readonly tab: TerminalTab;
  readonly original: Member;
  members: Member[];
}
interface Attempt {
  readonly context: string;
  readonly snapshot: Context;
  readonly request: string;
  readonly members: Member[];
  readonly sourceView: string;
  handoff?: string;
  ready: boolean;
  lease?: string;
  sequence: number;
}
function member(pane: TerminalPane): Member | undefined {
  const sessionId = pane.adapter.sessionId();
  if (
    pane.removed ||
    pane.ended ||
    pane.tab.removed ||
    !pane.surface ||
    !sessionId
  )
    return;
  return {
    pane,
    surface: pane.surface,
    sessionId,
    handle: crypto.randomUUID(),
    title: pane.label.slice(0, 120).replace(/[\u0000-\u001f\u007f]/g, ""),
    required: pane === pane.tab.focused,
  };
}
function live(value: Member) {
  const pane = value.pane;
  return (
    !pane.removed &&
    !pane.ended &&
    !pane.tab.removed &&
    pane.surface === value.surface &&
    pane.adapter.sessionId() === value.sessionId &&
    tabPanes(pane.tab).includes(pane)
  );
}

// Start only counts from the setup dialog the user is looking at.
function selectedMembers(
  snapshot: Context | undefined,
  command: Extract<MirrorCommand, { kind: "prepare" }>,
  setupShown: boolean,
  available: boolean,
): Member[] | undefined {
  if (!snapshot || !live(snapshot.original) || !available || !setupShown)
    return;
  const members = command.handles.map((handle) =>
    snapshot.members.find((item) => item.handle === handle),
  );
  if (
    members.length < 2 ||
    members.length > 16 ||
    new Set(command.handles).size !== members.length ||
    members.some((item) => !item || !live(item)) ||
    !members.some((item) => item?.pane === snapshot.original.pane)
  )
    return;
  return members as Member[];
}
function refreshMembers(context: Context) {
  context.members = tabPanes(context.tab).flatMap((pane) => {
    const item = member(pane);
    return item ? [{ ...item, required: pane === context.original.pane }] : [];
  });
}
function observeMembers(members: readonly Member[], ended: () => void) {
  return members.map(({ pane }) => {
    pane.snippetTargetListeners.add(ended);
    return () => pane.snippetTargetListeners.delete(ended);
  });
}
function onFocus(document: Document, listener: () => void) {
  const window = document.defaultView!;
  window.addEventListener("focus", listener, { once: true });
  return () => window.removeEventListener("focus", listener);
}
function publicPanes(members: readonly Member[]): MirrorPane[] {
  return members.map(({ handle, sessionId, title, required }) => ({
    handle,
    sessionId,
    title,
    required,
  }));
}

// The Start gesture originated in another WebContents. Retain both possible
// activation releases; a fresh non-repeat press releases each guard normally.
function guardStartRelease(document: Document) {
  const enter = retainDismissalGesture(document);
  const space = retainDismissalGesture(document);
  return {
    settle() {
      const Keyboard = document.defaultView!.KeyboardEvent;
      enter.settle(new Keyboard("keydown", { key: "Enter", code: "Enter" }));
      space.settle(new Keyboard("keydown", { key: " ", code: "Space" }));
    },
    dispose() {
      enter.dispose();
      space.dispose();
    },
  };
}

// While the route is armed, members and the source carry a State Mark;
// clicking any of them stops the group.
// Preparing is input-inert and brief, so it shows nothing.
function markMembers(marks: StateMarks, stop: () => void) {
  let marked: readonly TerminalPane[] = [];
  return (panes: readonly TerminalPane[] = [], source?: TerminalPane) => {
    for (const pane of marked)
      if (!panes.includes(pane)) marks.set(pane, "mirror", undefined);
    for (const pane of panes)
      marks.set(pane, "mirror", {
        glyph: "mirror",
        label: (t) =>
          t(pane === source ? "mirrorTyping.source" : "mirrorTyping.member"),
        action: { label: (t) => t("mirrorTyping.clickToStop"), run: stop },
      });
    marked = panes;
  };
}

// Renderer owns exact DOM/Surface identities; main independently owns native
// focus, package admission and the lease. Neither side can arm the other alone.
export function createMirrorTyping(deps: {
  bridge: MirrorTypingBridge;
  parent: HTMLElement;
  marks: StateMarks;
  selected(): ApplicationTab | undefined;
  // Whether this hosted setup view is the dialog currently shown.
  setupShown(id: string): boolean;
  available(): boolean;
  handoff(
    tab: TerminalTab,
    pane: TerminalPane,
    ready: () => void,
    current: () => boolean,
  ): void;
  focus(): void;
}) {
  const { bridge } = deps;
  const contexts = new Map<string, Context>();
  let attempt: Attempt | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribers: (() => void)[] = [];
  const { marks } = deps;
  const document = deps.parent.ownerDocument;
  const startGuard = guardStartRelease(document);
  const mark = markMembers(marks, () => {
    stop("stopped");
    deps.focus();
  });
  let dismissFailure = () => {};
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const remove of unsubscribers.splice(0)) remove();
  };
  const stop = (reason: MirrorStopReason, echo = true) => {
    const previous = attempt;
    attempt = undefined; // Close local admission before crossing IPC.
    clear();
    if (!previous) return;
    mark();
    // An ordinary stop is idle: the marks just go away.
    if (reason === "semantic-input")
      marks.flash((t) => t("mirrorTyping.semantic"));
    if (reason === "write-failed")
      dismissFailure = marks.notify((t) => t("mirrorTyping.failed"));
    if (previous.handoff && !previous.ready)
      bridge.reply({ request: previous.handoff, ok: false });
    if (echo) bridge.stop(previous.context, reason);
  };
  const valid = (value: Attempt) =>
    attempt === value &&
    deps.available() &&
    value.members.every(live) &&
    live(value.snapshot.original);
  const selectedMember = (value: Attempt) =>
    deps.selected() === value.snapshot.tab &&
    value.members.some((item) => item.pane === value.snapshot.tab.focused);
  const changed = () => {
    if (!attempt) return;
    if (!valid(attempt) || !selectedMember(attempt)) stop("unavailable");
    else if (attempt.lease)
      mark(
        attempt.members.map((item) => item.pane),
        attempt.snapshot.tab.focused,
      );
  };
  const describe = (
    command: Extract<MirrorCommand, { kind: "capture" | "describe" }>,
  ) => {
    stop("stopped");
    let context = contexts.get(command.context);
    if (command.kind === "capture") {
      contexts.clear();
      const tab = deps.selected();
      const original =
        tab?.kind === "terminal" ? member(tab.focused) : undefined;
      context =
        tab?.kind === "terminal" && original
          ? { tab, original, members: [] }
          : undefined;
    }
    if (!context || !deps.available() || !live(context.original)) {
      bridge.reply({
        request: command.request,
        ok: false,
        error: "focus-live-pane",
      });
      return;
    }
    refreshMembers(context);
    if (context.members.length < 2) {
      bridge.reply({
        request: command.request,
        ok: false,
        error: "need-two-panes",
      });
      return;
    }
    contexts.set(command.context, context);
    bridge.reply({
      request: command.request,
      ok: true,
      panes: publicPanes(context.members),
    });
  };
  const prepare = (command: Extract<MirrorCommand, { kind: "prepare" }>) => {
    stop("stopped");
    const snapshot = contexts.get(command.context);
    const members = selectedMembers(
      snapshot,
      command,
      deps.setupShown(command.sourceView),
      deps.available(),
    );
    if (!snapshot || !members) {
      bridge.reply({ request: command.request, ok: false });
      return;
    }
    const current: Attempt = {
      context: command.context,
      snapshot,
      request: command.request,
      members,
      sourceView: command.sourceView,
      ready: false,
      sequence: 0,
    };
    attempt = current;
    dismissFailure();
    startGuard.settle();
    unsubscribers.push(
      ...observeMembers(current.members, () => stop("unavailable")),
    );
    timer = setTimeout(() => stop("unavailable"), 5000);
    bridge.reply({ request: command.request, ok: true });
  };
  const handoff = (command: Extract<MirrorCommand, { kind: "handoff" }>) => {
    const current = attempt;
    if (
      !current ||
      current.context !== command.context ||
      current.request !== command.prepared ||
      current.handoff ||
      !valid(current) ||
      !deps.setupShown(current.sourceView)
    ) {
      bridge.reply({ request: command.request, ok: false });
      return;
    }
    current.handoff = command.request;
    const snapshot = current.snapshot;
    const ready = (waited: boolean) => {
      if (attempt !== current) return;
      if (!valid(current) || !selectedMember(current) || !document.hasFocus())
        return stop("unavailable");
      if (waited) deps.focus();
      current.ready = true;
      bridge.reply({ request: command.request, ok: true });
    };
    deps.handoff(
      snapshot.tab,
      snapshot.original.pane,
      () => {
        // Hiding the setup view can return focus here a moment later (Linux
        // X11). Wait for it; the prepare timer and blur still bound the wait.
        if (document.hasFocus() || !valid(current) || !selectedMember(current))
          ready(false);
        else unsubscribers.push(onFocus(document, () => ready(true)));
      },
      () => valid(current) && document.hasFocus(),
    );
  };
  const onCommand = (command: MirrorCommand) => {
    if (command.kind === "capture" || command.kind === "describe")
      describe(command);
    else if (command.kind === "prepare") prepare(command);
    else if (command.kind === "handoff") handoff(command);
    else if (command.kind === "activate") {
      const current = attempt;
      const ok =
        !!current &&
        current.context === command.context &&
        current.request === command.prepared &&
        current.ready &&
        !current.lease &&
        deps.parent.ownerDocument.hasFocus() &&
        valid(current) &&
        selectedMember(current);
      if (ok) {
        current.lease = command.lease;
        if (timer) clearTimeout(timer);
        timer = undefined;
        changed();
      } else {
        if (attempt?.context === command.context) stop("unavailable", false);
        bridge.stop(command.context, "unavailable");
      }
      bridge.reply({ request: command.request, ok });
    } else {
      if (attempt?.context === command.context)
        stop(command.kind === "stop" ? command.reason : "unavailable", false);
      if (command.kind === "retire") contexts.delete(command.context);
    }
  };
  const unsubscribe = bridge.onCommand(onCommand);
  const page = deps.parent.ownerDocument.defaultView;
  const blur = () => {
    if (attempt && !attempt.lease) stop("unavailable");
  };
  page?.addEventListener("blur", blur);
  return {
    changed,
    stop: () => stop("unavailable"),
    route(pane: TerminalPane, data: string) {
      const current = attempt;
      if (!current?.lease) return false;
      if (
        !valid(current) ||
        !selectedMember(current) ||
        current.snapshot.tab.focused !== pane
      ) {
        stop("unavailable");
        return true;
      }
      if (!deps.parent.ownerDocument.hasFocus()) return true;
      bridge.input({
        lease: current.lease,
        sequence: ++current.sequence,
        sourceSessionId: pane.adapter.sessionId()!,
        data,
      });
      return true;
    },
    semantic(pane: TerminalPane) {
      if (attempt?.members.some((item) => item.pane === pane))
        stop("semantic-input");
    },
    dispose() {
      stop("unavailable");
      unsubscribe();
      contexts.clear();
      page?.removeEventListener("blur", blur);
      startGuard.dispose();
    },
  };
}
