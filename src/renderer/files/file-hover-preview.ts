import { quotePathForShell } from "../../shared/file-browser";
import type { FilePeek } from "../../shared/file-peek";
import type { Translator } from "../../shared/i18n";
import type { FilesBridge } from "../../shared/terminal-bridge";
import type { TerminalSessionId } from "../../shared/terminal-contract";
import { filePeekCard } from "./file-peek-card";

// How long the pointer rests on a name before the card appears, and how long
// the card stays after the pointer leaves both the name and the card.
const HOVER_DELAY_MS = 450;
const LEAVE_DELAY_MS = 300;
const CARD_GAP_PX = 14;

export interface FileHoverTarget {
  readonly sessionId: TerminalSessionId;
  readonly token: string;
}

// The absolute local path a printed name refers to in a pane's folder, or
// undefined when it cannot be known.
export function resolvePrintedPath(
  token: string,
  directory: string | null,
  home: { readonly home: string; readonly platform: string },
): string | undefined {
  const windows = home.platform === "win32";
  const separator = windows ? "\\" : "/";
  const join = (base: string, name: string) =>
    base.endsWith(separator) || base.endsWith("/")
      ? `${base}${name}`
      : `${base}${separator}${name}`;
  if (token.startsWith("/") && !windows) return token;
  if (windows && /^[a-z]:[\\/]/iu.test(token)) return token;
  if (token === "~") return home.home;
  if (token.startsWith("~/")) return join(home.home, token.slice(2));
  if (token.startsWith("~")) return undefined;
  if (!directory) return undefined;
  return join(directory, token.replace(/^\.[\\/]/u, ""));
}

export interface FileHoverPreviewOptions {
  readonly container: HTMLElement;
  readonly translator: Translator;
  readonly files: Pick<
    FilesBridge,
    "peek" | "home" | "location" | "open" | "reveal"
  >;
  readonly fileAtPoint: (
    clientX: number,
    clientY: number,
  ) => FileHoverTarget | null;
  readonly sessionDirectory: (sessionId: TerminalSessionId) => Promise<{
    readonly directory: string | null;
    readonly busy: boolean;
  } | null>;
  readonly isBlocked: () => boolean;
  readonly copyText: (text: string) => Promise<void>;
  readonly insertText: (text: string) => void;
  readonly notify: (message: string) => void;
  readonly viewImage?: (filePath: string) => void;
}

// Hovering a file name printed in a local terminal (an `ls` listing, a path)
// shows a card with its picture or first lines and details. Nothing is read
// for remote panes or while a program runs in the pane.
export function installFileHoverPreview(
  document: Document,
  options: FileHoverPreviewOptions,
): () => void {
  const t = options.translator.t.bind(options.translator);
  const window = document.defaultView!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let pointer: { x: number; y: number } | undefined;
  let generation = 0;
  let shown:
    | { readonly key: string; readonly element: HTMLElement; dispose(): void }
    | undefined;
  let homeInfo: Promise<{ home: string; platform: string }> | undefined;

  const enabled = () =>
    !document.documentElement.hasAttribute("data-file-preview-off") &&
    !options.isBlocked() &&
    document.hasFocus();

  const hide = () => {
    generation++;
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = undefined;
    if (!shown) return;
    shown.dispose();
    shown.element.remove();
    shown = undefined;
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const place = (element: HTMLElement, x: number, y: number) => {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left =
      x + CARD_GAP_PX + width <= window.innerWidth
        ? x + CARD_GAP_PX
        : Math.max(8, x - CARD_GAP_PX - width);
    const top = Math.min(
      Math.max(8, y + CARD_GAP_PX),
      Math.max(8, window.innerHeight - height - 8),
    );
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  };

  const show = (
    peek: FilePeek,
    x: number,
    y: number,
    key: string,
    platform: string,
  ) => {
    hide();
    const run = (action: () => Promise<unknown>) => () =>
      void action().catch((cause: unknown) => options.notify(String(cause)));
    const card = filePeekCard(document, options.translator, peek, {
      copyPath: run(async () => {
        await options.copyText(peek.path);
        options.notify(t("peek.pathCopied"));
      }),
      insertPath: () => {
        hide();
        options.insertText(`${quotePathForShell(peek.path, platform)} `);
      },
      ...(peek.executable && peek.kind !== "directory"
        ? {}
        : { open: run(() => options.files.open(peek.path)) }),
      reveal: run(() => options.files.reveal(peek.path)),
      ...(options.viewImage &&
      (peek.mime === "image/png" || peek.mime === "image/jpeg")
        ? {
            view: () => {
              hide();
              options.viewImage!(peek.path);
            },
          }
        : {}),
    });
    const element = card.element;
    element.classList.add("file-peek-card");
    element.addEventListener("pointerenter", () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = undefined;
    });
    element.addEventListener("pointerleave", () => scheduleHide());
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    });
    document.body.append(element);
    place(element, x, y);
    element
      .querySelector("img")
      ?.addEventListener("load", () => place(element, x, y));
    shown = { key, element, dispose: card.dispose };
  };

  const scheduleHide = () => {
    if (!shown || leaveTimer) return;
    leaveTimer = setTimeout(hide, LEAVE_DELAY_MS);
  };

  const lookup = async (x: number, y: number) => {
    if (!enabled()) return;
    const target = options.fileAtPoint(x, y);
    if (!target) {
      scheduleHide();
      return;
    }
    const key = `${target.sessionId}\0${target.token}`;
    if (shown?.key === key) {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = undefined;
      return;
    }
    const current = ++generation;
    const [location, state] = await Promise.all([
      options.files.location(target.sessionId).catch(() => undefined),
      options.sessionDirectory(target.sessionId).catch(() => null),
    ]);
    if (location?.kind !== "local" || !state || state.busy) return;
    homeInfo ??= options.files.home();
    const home = await homeInfo;
    const filePath = resolvePrintedPath(target.token, state.directory, home);
    if (!filePath || current !== generation) return;
    const peek = await options.files.peek(filePath).catch(() => null);
    if (!peek || current !== generation || !enabled()) return;
    // The pointer may have moved on while the file was read.
    if (pointer && Math.hypot(pointer.x - x, pointer.y - y) > 24) return;
    show(peek, x, y, key, home.platform);
  };

  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    cancel();
    if (event.buttons !== 0 || event.pointerType === "touch") {
      hide();
      return;
    }
    if (shown) scheduleHide();
    timer = setTimeout(
      () => void lookup(event.clientX, event.clientY),
      HOVER_DELAY_MS,
    );
  };
  const onLeave = () => {
    cancel();
    pointer = undefined;
    scheduleHide();
  };
  const onDismiss = () => {
    cancel();
    hide();
  };
  const onKey = (event: KeyboardEvent) => {
    if (shown?.element.contains(event.target as Node)) return;
    onDismiss();
  };

  options.container.addEventListener("pointermove", onMove, { passive: true });
  options.container.addEventListener("pointerleave", onLeave);
  options.container.addEventListener("pointerdown", onDismiss, true);
  options.container.addEventListener("wheel", onDismiss, { passive: true });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", onDismiss);
  window.addEventListener("resize", onDismiss);
  return () => {
    cancel();
    hide();
    options.container.removeEventListener("pointermove", onMove);
    options.container.removeEventListener("pointerleave", onLeave);
    options.container.removeEventListener("pointerdown", onDismiss, true);
    options.container.removeEventListener("wheel", onDismiss);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onDismiss);
    window.removeEventListener("resize", onDismiss);
  };
}
