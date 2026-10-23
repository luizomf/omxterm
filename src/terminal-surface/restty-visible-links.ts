import { parseLocalImageReference } from "../shared/local-image-reference";
import type { TerminalSurfaceOptions } from "./terminal-surface";

export interface ResttyVisibleLinkInteraction {
  getVisibleLinkAtClientPoint(
    clientX: number,
    clientY: number,
  ): {
    readonly id: string;
    readonly url: string;
    readonly cells: readonly number[];
  } | null;
  setVisibleLinkHover(cells: readonly number[] | null): void;
}

export interface ResttyVisibleLinkController {
  invalidate(): void;
  dispose(): void;
}

export function requestVisibleLink(
  destination: string,
  options: TerminalSurfaceOptions,
): void {
  const reference = parseLocalImageReference(destination);
  if (destination.startsWith("file:///"))
    options.onLocalImageActivation?.({
      source: "file-url",
      url: destination,
    });
  else if (
    reference &&
    (reference.kind !== "absolute" ||
      reference.fallbackPath ||
      destination.startsWith("'") ||
      destination.startsWith('"'))
  )
    options.onLocalImageActivation?.({
      source: "path-reference",
      path: destination,
    });
  else if (destination.startsWith("/") || /^[a-z]:[\\/]/iu.test(destination))
    options.onLocalImageActivation?.({
      source: "native-path",
      path: destination,
    });
  else options.onExternalLink?.(destination);
}

// Ctrl/Cmd-click links when the Surface opens links or local images.
export function installSurfaceVisibleLinks(
  canvas: HTMLCanvasElement,
  interaction: ResttyVisibleLinkInteraction,
  options: TerminalSurfaceOptions,
): ResttyVisibleLinkController | undefined {
  if (!options.onExternalLink && !options.onLocalImageActivation)
    return undefined;
  return installResttyVisibleLinks(
    canvas,
    interaction,
    (url) => requestVisibleLink(url, options),
    navigator.platform,
    options.linkHoverAvailability,
  );
}

interface VisibleLinkPointerGesture {
  readonly pointerId: number;
  readonly link: { readonly id: string; readonly url: string };
  readonly down: PointerEventInit;
}

function pointerEventInit(event: PointerEvent): PointerEventInit {
  return {
    bubbles: true,
    cancelable: true,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    button: event.button,
    buttons: event.buttons,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  };
}

export function installResttyVisibleLinks(
  canvas: HTMLCanvasElement,
  interaction: ResttyVisibleLinkInteraction,
  requestActivation: (url: string) => void,
  platform: string = navigator.platform,
  availability?: TerminalSurfaceOptions["linkHoverAvailability"],
): ResttyVisibleLinkController {
  let pending: VisibleLinkPointerGesture | undefined;
  let pointer:
    { readonly clientX: number; readonly clientY: number } | undefined;
  let modifierHeld = false;
  const ignoredPointerUps = new Set<number>();
  const replayed = new WeakSet<PointerEvent>();
  const hasModifier = (event: PointerEvent) =>
    platform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
  const consume = (event: PointerEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const resolve = (event: PointerEvent) =>
    interaction.getVisibleLinkAtClientPoint(event.clientX, event.clientY);
  const clearHover = () => interaction.setVisibleLinkHover(null);
  const updateHover = () => {
    if (
      !pointer ||
      !modifierHeld ||
      canvas.closest("[hidden]") ||
      document.hidden ||
      availability?.isEnabled() === false
    ) {
      clearHover();
      return;
    }
    const link = interaction.getVisibleLinkAtClientPoint(
      pointer.clientX,
      pointer.clientY,
    );
    interaction.setVisibleLinkHover(link?.cells ?? null);
  };
  const replayDown = (gesture: VisibleLinkPointerGesture) => {
    const event = new PointerEvent("pointerdown", gesture.down);
    replayed.add(event);
    canvas.dispatchEvent(event);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (replayed.has(event) || event.button !== 0 || !hasModifier(event))
      return;
    const link = resolve(event);
    if (!link) return;
    pending = {
      pointerId: event.pointerId,
      link,
      down: pointerEventInit(event),
    };
    consume(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
    modifierHeld = hasModifier(event);
    updateHover();
    if (!pending || pending.pointerId !== event.pointerId) return;
    const current = resolve(event);
    if (current?.id === pending.link.id) {
      consume(event);
      return;
    }
    const cancelled = pending;
    pending = undefined;
    replayDown(cancelled);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (ignoredPointerUps.delete(event.pointerId)) {
      consume(event);
      return;
    }
    if (!pending || pending.pointerId !== event.pointerId) return;
    const gesture = pending;
    pending = undefined;
    const current = resolve(event);
    if (
      event.button !== 0 ||
      !hasModifier(event) ||
      current?.id !== gesture.link.id ||
      current.url !== gesture.link.url
    ) {
      replayDown(gesture);
      return;
    }
    consume(event);
    clearHover();
    requestActivation(current.url);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (!pending || pending.pointerId !== event.pointerId) return;
    ignoredPointerUps.add(event.pointerId);
    pending = undefined;
    consume(event);
  };
  const cancelPending = () => {
    if (pending) ignoredPointerUps.add(pending.pointerId);
    pending = undefined;
  };
  const onKeyChange = (event: KeyboardEvent) => {
    modifierHeld = platform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
    updateHover();
  };
  const clearPointer = () => {
    pointer = undefined;
    modifierHeld = false;
    clearHover();
  };
  const onBlur = () => {
    cancelPending();
    clearPointer();
  };
  const focusRoot =
    canvas.closest(".restty-terminal-surface") ??
    canvas.parentElement ??
    canvas;
  const onFocusOut = (event: FocusEvent) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !focusRoot.contains(event.relatedTarget)
    )
      clearPointer();
  };
  const removeAvailabilityListener = availability?.subscribe(clearPointer);
  const visibilityRoot = canvas.closest(".terminal-surface");
  const visibilityObserver = visibilityRoot
    ? new MutationObserver(clearPointer)
    : undefined;
  visibilityObserver?.observe(visibilityRoot!, {
    attributes: true,
    attributeFilter: ["hidden"],
  });

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove, true);
  canvas.addEventListener("pointerup", onPointerUp, true);
  canvas.addEventListener("pointercancel", onPointerCancel, true);
  canvas.addEventListener("lostpointercapture", cancelPending, true);
  canvas.addEventListener("pointerleave", clearPointer);
  focusRoot.addEventListener("focusout", onFocusOut as EventListener);
  canvas.addEventListener("wheel", clearHover, { passive: true });
  window.addEventListener("keydown", onKeyChange);
  window.addEventListener("keyup", onKeyChange);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", clearHover);
  document.addEventListener("visibilitychange", clearPointer);
  focusRoot.addEventListener("scroll", clearHover, true);
  return {
    invalidate: clearHover,
    dispose() {
      pending = undefined;
      ignoredPointerUps.clear();
      clearPointer();
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
      canvas.removeEventListener("lostpointercapture", cancelPending, true);
      canvas.removeEventListener("pointerleave", clearPointer);
      focusRoot.removeEventListener("focusout", onFocusOut as EventListener);
      canvas.removeEventListener("wheel", clearHover);
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", clearHover);
      document.removeEventListener("visibilitychange", clearPointer);
      focusRoot.removeEventListener("scroll", clearHover, true);
      visibilityObserver?.disconnect();
      removeAvailabilityListener?.();
    },
  };
}
