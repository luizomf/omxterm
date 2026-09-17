export interface ResttyVisibleLinkInteraction {
  getVisibleLinkAtClientPoint(
    clientX: number,
    clientY: number,
  ): { readonly id: string; readonly url: string } | null;
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
): () => void {
  let pending: VisibleLinkPointerGesture | undefined;
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

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove, true);
  canvas.addEventListener("pointerup", onPointerUp, true);
  canvas.addEventListener("pointercancel", onPointerCancel, true);
  canvas.addEventListener("lostpointercapture", cancelPending, true);
  window.addEventListener("blur", cancelPending);
  return () => {
    pending = undefined;
    ignoredPointerUps.clear();
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove, true);
    canvas.removeEventListener("pointerup", onPointerUp, true);
    canvas.removeEventListener("pointercancel", onPointerCancel, true);
    canvas.removeEventListener("lostpointercapture", cancelPending, true);
    window.removeEventListener("blur", cancelPending);
  };
}
