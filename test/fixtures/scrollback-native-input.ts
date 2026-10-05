import type { scrollbackInputEvidence } from "./scrollback-input-evidence";

export interface NativePointerObservation {
  readonly trusted: boolean;
  readonly canvas: boolean;
  readonly id: number;
  readonly buttons: number;
  readonly x: number;
  readonly y: number;
  readonly dragging: boolean;
}

export function observeScrollbackNativeInput(
  canvas: HTMLCanvasElement,
  input: HTMLTextAreaElement,
  isDragging: () => boolean,
  accepted: () => boolean,
  evidence?: ReturnType<typeof scrollbackInputEvidence>,
) {
  let down: NativePointerObservation | null = null;
  let move: NativePointerObservation | null = null;
  let up: NativePointerObservation | null = null;
  let character: { trusted: boolean; input: boolean } | null = null;
  let notifyDrag: (() => void) | undefined;
  let unexpectedCharacters = 0;
  evidence?.onUnexpectedWrite(() => notifyDrag?.());
  const pointer = (event: PointerEvent): NativePointerObservation => ({
    trusted: event.isTrusted,
    canvas: event.target === canvas,
    id: event.pointerId,
    buttons: event.buttons,
    x: event.clientX,
    y: event.clientY,
    dragging: isDragging(),
  });
  // Registered after Restty's bound handlers: dragging is observed, never set.
  canvas.addEventListener("pointerdown", (event) => {
    down = pointer(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    move = pointer(event);
    notifyDrag?.();
  });
  canvas.addEventListener("pointerup", (event) => {
    up = pointer(event);
    notifyDrag?.();
  });
  // Restty accepts ordinary character text in beforeinput and prevents default;
  // a successful native character need not produce a later DOM input event.
  input.addEventListener("beforeinput", (event) => {
    character = { trusted: event.isTrusted, input: event.target === input };
    if (
      evidence &&
      (!evidence.expectingCharacter() ||
        event.data !== "x" ||
        event.inputType !== "insertText")
    ) {
      unexpectedCharacters = Math.min(
        Number.MAX_SAFE_INTEGER,
        unexpectedCharacters + 1,
      );
      notifyDrag?.();
    }
  });
  const snapshot = () => {
    const rect = canvas.getBoundingClientRect();
    const host = document.querySelector<HTMLElement>(
      ".restty-native-scroll-host",
    )!;
    return {
      ready:
        document.hasFocus() &&
        document.activeElement === input &&
        !input.disabled,
      down,
      move,
      up,
      character,
      accepted: accepted(),
      unexpected: {
        characters: unexpectedCharacters,
        writes: evidence?.snapshot().unexpectedWrites ?? 0,
      },
      geometry: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      viewport: {
        top: host.scrollTop,
        height: host.scrollHeight,
        clientHeight: host.clientHeight,
      },
    };
  };
  return {
    reset() {
      down = move = up = null;
      character = null;
    },
    snapshot,
    waitForDrag(point: { x: number; startY: number; endY: number }) {
      return new Promise<ReturnType<typeof snapshot>>((resolve) => {
        // One drag per fixture. Register before checking already-observed input;
        // the main phase owns the deadline and always releases in its finally.
        notifyDrag = () => {
          const value = snapshot();
          if (
            !hasNativeDrag(value, point) &&
            !value.up &&
            value.unexpected.characters === 0 &&
            value.unexpected.writes === 0
          )
            return;
          notifyDrag = undefined;
          resolve(value);
        };
        notifyDrag();
      });
    },
  };
}

export type NativeInputObservation = ReturnType<
  ReturnType<typeof observeScrollbackNativeInput>["snapshot"]
>;

export function hasNativeDrag(
  value: NativeInputObservation,
  point: { x: number; startY: number; endY: number },
): boolean {
  const { down, move } = value;
  return Boolean(
    down?.trusted &&
    down.canvas &&
    down.buttons === 1 &&
    down.x === point.x &&
    down.y === point.startY &&
    move?.trusted &&
    move.canvas &&
    move.buttons === 1 &&
    move.id === down.id &&
    move.x === point.x &&
    move.y === point.endY &&
    move.dragging,
  );
}
